import type { FeedConfig, L2Expr, L2NumericField } from '@cfb/core-types'

export type SortMode = 'chronological' | 'engagement' | 'pack' | 'custom'

export function hasSortPackRef(rank: FeedConfig['rank']): boolean {
  return Boolean(rank?.packRef?.packageId)
}

export interface EngagementSignal {
  enabled: boolean
  weight: number
}

export interface EngagementWeights {
  likes: EngagementSignal
  reposts: EngagementSignal
  replies: EngagementSignal
  quotes: EngagementSignal
  bookmarks: EngagementSignal
}

export interface ContentSignals {
  authorFollowers: EngagementSignal
  authorPosts: EngagementSignal
  textLength: EngagementSignal
  hashtagCount: EngagementSignal
  mentionCount: EngagementSignal
  linkCount: EngagementSignal
  altTextBonus: EngagementSignal
  /** Bonus for root posts (original, not reply/quote) */
  rootPostBonus: EngagementSignal
  /** Bonus for reply posts */
  replyBonus: EngagementSignal
  /** Bonus for quote posts */
  quotePostBonus: EngagementSignal
}

export interface RatioSignals {
  /** (likes+reposts) / (followers+1) — reach-normalized engagement */
  engagementRate: EngagementSignal
  /** replies / (likes+1) — discussion/controversy detector */
  replyRatio: EngagementSignal
  /** quotes / (likes+1) — quotability signal */
  quoteRatio: EngagementSignal
}

export interface MediaBonus {
  image: EngagementSignal
  video: EngagementSignal
  linkCard: EngagementSignal
}

export type AuthorFairnessMode = 'off' | 'log' | 'sqrt' | 'sigmoid'

export interface SortTuning {
  decayHalfLifeHours: number
  editorScoreWeight: number
  maxAgeHours: number
  authorFairness: AuthorFairnessMode
  mediaBonus: MediaBonus
  contentSignals: ContentSignals
  ratioSignals: RatioSignals
  /** Max score any post can have. 0 = no cap. */
  scoreCap: number
  /** Min score floor. 0 = no floor (can go negative). */
  scoreFloor: number
}

export const DEFAULT_ENGAGEMENT_WEIGHTS: EngagementWeights = {
  likes: { enabled: true, weight: 1 },
  reposts: { enabled: true, weight: 2 },
  replies: { enabled: true, weight: 1 },
  quotes: { enabled: false, weight: 1 },
  bookmarks: { enabled: false, weight: 3 },
}

export const DEFAULT_CONTENT_SIGNALS: ContentSignals = {
  authorFollowers: { enabled: false, weight: 0 },
  authorPosts: { enabled: false, weight: 0 },
  textLength: { enabled: false, weight: 0 },
  hashtagCount: { enabled: false, weight: 0 },
  mentionCount: { enabled: false, weight: 0 },
  linkCount: { enabled: false, weight: 0 },
  altTextBonus: { enabled: false, weight: 0 },
  rootPostBonus: { enabled: false, weight: 0 },
  replyBonus: { enabled: false, weight: 0 },
  quotePostBonus: { enabled: false, weight: 0 },
}

export const DEFAULT_RATIO_SIGNALS: RatioSignals = {
  engagementRate: { enabled: false, weight: 0 },
  replyRatio: { enabled: false, weight: 0 },
  quoteRatio: { enabled: false, weight: 0 },
}

export const DEFAULT_MEDIA_BONUS: MediaBonus = {
  image: { enabled: false, weight: 0 },
  video: { enabled: false, weight: 0 },
  linkCard: { enabled: false, weight: 0 },
}

export const DEFAULT_SORT_TUNING: SortTuning = {
  decayHalfLifeHours: 0,
  editorScoreWeight: 0,
  maxAgeHours: 0,
  authorFairness: 'off',
  mediaBonus: { ...DEFAULT_MEDIA_BONUS },
  contentSignals: { ...DEFAULT_CONTENT_SIGNALS },
  ratioSignals: { ...DEFAULT_RATIO_SIGNALS },
  scoreCap: 0,
  scoreFloor: 0,
}

export const SORT_MODE_OPTIONS: {
  id: SortMode
  label: string
  hint: string
}[] = [
  {
    id: 'chronological',
    label: 'Chronological',
    hint: 'Newest posts first — default when no custom sort is set.',
  },
  {
    id: 'engagement',
    label: 'Engagement',
    hint: 'Weighted score from likes, reposts, replies, quotes, and bookmarks.',
  },
  {
    id: 'custom',
    label: 'Custom formula',
    hint: 'Full control over every available signal and tuning option.',
  },
]

// --- Expr builders ---

function fieldExpr(field: L2NumericField): L2Expr {
  return { type: 'field', field }
}

function literal(value: number): L2Expr {
  return { type: 'literal', value }
}

function binary(op: '+' | '-' | '*' | '/', left: L2Expr, right: L2Expr): L2Expr {
  return { type: 'binary', op, left, right }
}

/** score / (1 + post_age_hours / halfLife) */
function applyDecay(base: L2Expr, halfLifeHours: number): L2Expr {
  if (halfLifeHours <= 0) return base
  return binary('/', base, binary('+', literal(1), binary('/', fieldExpr('post_age_hours'), literal(halfLifeHours))))
}

/** base + (editor_score * weight) */
function applyEditorBoost(base: L2Expr, weight: number): L2Expr {
  if (weight <= 0) return base
  return binary('+', base, binary('*', fieldExpr('editor_score'), literal(weight)))
}

/** score / f(author_follower_count + 1) */
function applyAuthorFairness(base: L2Expr, mode: AuthorFairnessMode): L2Expr {
  if (mode === 'off') return base
  const followers = binary('+', fieldExpr('author_follower_count'), literal(1))
  // We approximate log/sqrt/sigmoid with available arithmetic ops
  // log ≈ we can't do real log in L2Expr, so we use sqrt(sqrt(x)) as rough log proxy
  // sqrt = x / sqrt(x) trick isn't available... we'll use division by followers^0.5 power
  // For now: log = /sqrt(followers), sqrt = /sqrt(sqrt(followers)), sigmoid = hard divisor
  // Actually with only +,-,*,/ we approximate:
  //   log: score * 10 / (followers)  -- very rough, scale factor helps
  //   sqrt: score / (followers / 1000) -- normalized
  // Better approach: just divide by followers with different scale factors
  switch (mode) {
    case 'log':
      // Gentle: divide by (followers / 1000 + 1) — caps at reasonable divisor
      return binary('/', base, binary('+', binary('/', followers, literal(1000)), literal(1)))
    case 'sqrt':
      // Moderate: divide by (followers / 100 + 1) — stronger equalization
      return binary('/', base, binary('+', binary('/', followers, literal(100)), literal(1)))
    case 'sigmoid':
      // Aggressive: divide by (followers / 10 + 1) — heavy anti-megaphone
      return binary('/', base, binary('+', binary('/', followers, literal(10)), literal(1)))
  }
}

/** Add flat bonus for media types */
function applyMediaBonus(base: L2Expr, media: MediaBonus): L2Expr {
  let expr = base
  // media_type: 0=text, 1=image, 2=video, 3=gif, 4=link, 5=quote
  // We use image_count > 0, video fields, link_thumb for detection
  if (media.image.enabled && media.image.weight > 0) {
    // image_count * weight (0 when no images, bonus when images present)
    expr = binary('+', expr, binary('*', fieldExpr('image_count'), literal(media.image.weight)))
  }
  if (media.video.enabled && media.video.weight > 0) {
    // video_size_bytes > 0 means has video; approximate as min(video_size_bytes, 1) * weight
    // Actually simpler: video_aspect_w will be 0 for non-video. Use as boolean proxy.
    // Best we can do with arithmetic: add weight when video_aspect_w > 0
    // Hack: min(video_aspect_w, 1) * weight — but we don't have min()
    // Just use video_size_bytes / (video_size_bytes + 1) * weight — approaches weight when has video
    expr = binary('+', expr, binary('*', binary('/', fieldExpr('video_size_bytes'), binary('+', fieldExpr('video_size_bytes'), literal(1))), literal(media.video.weight)))
  }
  if (media.linkCard.enabled && media.linkCard.weight > 0) {
    // link_thumb_size_bytes as proxy for link card presence
    expr = binary('+', expr, binary('*', binary('/', fieldExpr('link_thumb_size_bytes'), binary('+', fieldExpr('link_thumb_size_bytes'), literal(1))), literal(media.linkCard.weight)))
  }
  return expr
}

/** Add content signal bonuses/penalties */
function applyContentSignals(base: L2Expr, signals: ContentSignals): L2Expr {
  let expr = base
  const add = (field: L2NumericField, signal: EngagementSignal) => {
    if (!signal.enabled || signal.weight === 0) return
    expr = binary('+', expr, signal.weight === 1 ? fieldExpr(field) : binary('*', fieldExpr(field), literal(signal.weight)))
  }
  add('author_follower_count', signals.authorFollowers)
  add('author_posts_count', signals.authorPosts)
  add('text_length', signals.textLength)
  add('facet_tag_count', signals.hashtagCount)
  add('facet_mention_count', signals.mentionCount)
  add('facet_link_count', signals.linkCount)
  // Alt text bonus: image_count as proxy
  if (signals.altTextBonus.enabled && signals.altTextBonus.weight !== 0) {
    expr = binary('+', expr, binary('*', fieldExpr('image_count'), literal(signals.altTextBonus.weight)))
  }
  // Post kind bonuses: use media_type field as proxy (0=text=root-ish)
  // Actually we don't have a post_kind numeric field, so these are best-effort
  // root posts: no good numeric proxy in L2Expr currently, skip for now
  // For reply/quote bonus we'd need post_kind in L2NumericField — document as future
  // Workaround: quote_count on the post itself indicates it IS a quote... no that's wrong
  // Leave post kind bonuses as documented-but-not-yet-functional in the expr
  // They'll show in UI but won't affect the formula until we add post_kind as numeric
  return expr
}

/** Add ratio-based signals (computed from multiple fields) */
function applyRatioSignals(base: L2Expr, signals: RatioSignals): L2Expr {
  let expr = base
  // Engagement rate: (likes + reposts) / (followers + 1) * weight
  if (signals.engagementRate.enabled && signals.engagementRate.weight !== 0) {
    const rate = binary('/', binary('+', fieldExpr('like_count'), fieldExpr('repost_count')), binary('+', fieldExpr('author_follower_count'), literal(1)))
    expr = binary('+', expr, binary('*', rate, literal(signals.engagementRate.weight)))
  }
  // Reply ratio: replies / (likes + 1) * weight
  if (signals.replyRatio.enabled && signals.replyRatio.weight !== 0) {
    const rate = binary('/', fieldExpr('reply_count'), binary('+', fieldExpr('like_count'), literal(1)))
    expr = binary('+', expr, binary('*', rate, literal(signals.replyRatio.weight)))
  }
  // Quote ratio: quotes / (likes + 1) * weight
  if (signals.quoteRatio.enabled && signals.quoteRatio.weight !== 0) {
    const rate = binary('/', fieldExpr('quote_count'), binary('+', fieldExpr('like_count'), literal(1)))
    expr = binary('+', expr, binary('*', rate, literal(signals.quoteRatio.weight)))
  }
  return expr
}

/** Apply all tuning to a base expression. */
export function applyTuning(base: L2Expr, tuning: SortTuning): L2Expr {
  let expr = base
  expr = applyEditorBoost(expr, tuning.editorScoreWeight)
  expr = applyContentSignals(expr, tuning.contentSignals)
  expr = applyRatioSignals(expr, tuning.ratioSignals)
  expr = applyMediaBonus(expr, tuning.mediaBonus)
  expr = applyAuthorFairness(expr, tuning.authorFairness)
  expr = applyDecay(expr, tuning.decayHalfLifeHours)
  if (tuning.maxAgeHours > 0) {
    const ageFactor = binary('-', literal(1), binary('/', fieldExpr('post_age_hours'), literal(tuning.maxAgeHours)))
    expr = binary('*', expr, ageFactor)
  }
  // Score cap: min(score, cap) — approximated as cap - max(0, score - cap)
  // With only arithmetic we can't do true min/max, so we document this as enforced at DB write
  // Score floor: same — enforced at DB write, not in the expr
  return expr
}

export function exprKey(expr: L2Expr): string {
  return JSON.stringify(expr)
}

export function engagementExpr(weights: EngagementWeights): L2Expr {
  const terms: L2Expr[] = []
  const add = (field: L2NumericField, signal: EngagementSignal) => {
    if (!signal.enabled) return
    terms.push(signal.weight === 1 ? fieldExpr(field) : binary('*', fieldExpr(field), literal(signal.weight)))
  }
  add('like_count', weights.likes)
  add('repost_count', weights.reposts)
  add('reply_count', weights.replies)
  add('quote_count', weights.quotes)
  add('bookmark_count', weights.bookmarks)
  if (terms.length === 0) return fieldExpr('like_count')
  return terms.reduce((acc, t) => binary('+', acc, t))
}

/** Human-readable formula string for display. */
export function engagementFormulaLabel(weights: EngagementWeights, tuning: SortTuning = DEFAULT_SORT_TUNING): string {
  const parts: string[] = []
  const add = (name: string, signal: EngagementSignal) => {
    if (!signal.enabled) return
    parts.push(signal.weight === 1 ? name : `${name} × ${signal.weight}`)
  }
  add('likes', weights.likes)
  add('reposts', weights.reposts)
  add('replies', weights.replies)
  add('quotes', weights.quotes)
  add('bookmarks', weights.bookmarks)
  let formula = parts.length ? parts.join(' + ') : 'likes'

  if (tuning.editorScoreWeight > 0) {
    formula = `(${formula}) + editor_score × ${tuning.editorScoreWeight}`
  }
  // Content signals
  const cParts: string[] = []
  if (tuning.contentSignals.authorFollowers.enabled && tuning.contentSignals.authorFollowers.weight !== 0) {
    cParts.push(`followers × ${tuning.contentSignals.authorFollowers.weight}`)
  }
  if (tuning.contentSignals.authorPosts.enabled && tuning.contentSignals.authorPosts.weight !== 0) {
    cParts.push(`author_posts × ${tuning.contentSignals.authorPosts.weight}`)
  }
  if (tuning.contentSignals.textLength.enabled && tuning.contentSignals.textLength.weight !== 0) {
    cParts.push(`text_len × ${tuning.contentSignals.textLength.weight}`)
  }
  if (tuning.contentSignals.hashtagCount.enabled && tuning.contentSignals.hashtagCount.weight !== 0) {
    cParts.push(`tags × ${tuning.contentSignals.hashtagCount.weight}`)
  }
  if (tuning.contentSignals.mentionCount.enabled && tuning.contentSignals.mentionCount.weight !== 0) {
    cParts.push(`mentions × ${tuning.contentSignals.mentionCount.weight}`)
  }
  if (tuning.contentSignals.altTextBonus.enabled && tuning.contentSignals.altTextBonus.weight !== 0) {
    cParts.push(`alt_text × ${tuning.contentSignals.altTextBonus.weight}`)
  }
  if (cParts.length > 0) {
    formula = `(${formula}) + ${cParts.join(' + ')}`
  }
  // Ratio signals
  const rParts: string[] = []
  if (tuning.ratioSignals.engagementRate.enabled && tuning.ratioSignals.engagementRate.weight !== 0) {
    rParts.push(`eng_rate × ${tuning.ratioSignals.engagementRate.weight}`)
  }
  if (tuning.ratioSignals.replyRatio.enabled && tuning.ratioSignals.replyRatio.weight !== 0) {
    rParts.push(`reply_ratio × ${tuning.ratioSignals.replyRatio.weight}`)
  }
  if (tuning.ratioSignals.quoteRatio.enabled && tuning.ratioSignals.quoteRatio.weight !== 0) {
    rParts.push(`quote_ratio × ${tuning.ratioSignals.quoteRatio.weight}`)
  }
  if (rParts.length > 0) {
    formula = `(${formula}) + ${rParts.join(' + ')}`
  }
  if (tuning.mediaBonus.image.enabled || tuning.mediaBonus.video.enabled || tuning.mediaBonus.linkCard.enabled) {
    const bonuses: string[] = []
    if (tuning.mediaBonus.image.enabled) bonuses.push(`img+${tuning.mediaBonus.image.weight}`)
    if (tuning.mediaBonus.video.enabled) bonuses.push(`vid+${tuning.mediaBonus.video.weight}`)
    if (tuning.mediaBonus.linkCard.enabled) bonuses.push(`link+${tuning.mediaBonus.linkCard.weight}`)
    formula = `(${formula}) + media[${bonuses.join(', ')}]`
  }
  if (tuning.authorFairness !== 'off') {
    formula = `(${formula}) / ${tuning.authorFairness}(followers)`
  }
  if (tuning.decayHalfLifeHours > 0) {
    formula = `(${formula}) / (1 + age/${tuning.decayHalfLifeHours}h)`
  }
  if (tuning.maxAgeHours > 0) {
    formula = `(${formula}) × (1 - age/${tuning.maxAgeHours}h)`
  }
  if (tuning.scoreCap > 0) {
    formula = `min(${formula}, ${tuning.scoreCap})`
  }
  if (tuning.scoreFloor !== 0) {
    formula = `max(${formula}, ${tuning.scoreFloor})`
  }
  return formula
}

export function rankExprForMode(
  mode: SortMode,
  weights: EngagementWeights = DEFAULT_ENGAGEMENT_WEIGHTS,
  tuning: SortTuning = DEFAULT_SORT_TUNING,
): L2Expr | null {
  switch (mode) {
    case 'chronological':
      return null
    case 'engagement':
      return applyTuning(engagementExpr(weights), tuning)
    case 'pack':
    case 'custom':
      return null
  }
}

export function detectEngagementWeights(expr: L2Expr): EngagementWeights {
  const w: EngagementWeights = {
    likes: { enabled: false, weight: 1 },
    reposts: { enabled: false, weight: 1 },
    replies: { enabled: false, weight: 1 },
    quotes: { enabled: false, weight: 1 },
    bookmarks: { enabled: false, weight: 1 },
  }
  detectFieldWeight(expr, 'like_count', w, 'likes')
  detectFieldWeight(expr, 'repost_count', w, 'reposts')
  detectFieldWeight(expr, 'reply_count', w, 'replies')
  detectFieldWeight(expr, 'quote_count', w, 'quotes')
  detectFieldWeight(expr, 'bookmark_count', w, 'bookmarks')
  return w
}

function detectFieldWeight(
  expr: L2Expr,
  field: L2NumericField,
  out: EngagementWeights,
  key: keyof EngagementWeights,
): void {
  if (expr.type === 'field' && expr.field === field) {
    out[key] = { enabled: true, weight: 1 }
  } else if (expr.type === 'binary') {
    if (expr.op === '*') {
      if (expr.left.type === 'field' && expr.left.field === field && expr.right.type === 'literal') {
        out[key] = { enabled: true, weight: expr.right.value }
        return
      }
      if (expr.right.type === 'field' && expr.right.field === field && expr.left.type === 'literal') {
        out[key] = { enabled: true, weight: expr.left.value }
        return
      }
    }
    detectFieldWeight(expr.left, field, out, key)
    detectFieldWeight(expr.right, field, out, key)
  }
}

export function detectSortMode(rank: FeedConfig['rank']): SortMode {
  if (rank?.packRef) return 'pack'
  if (!rank?.sortKey) return 'chronological'

  const w = detectEngagementWeights(rank.sortKey)
  if (w.likes.enabled || w.reposts.enabled || w.replies.enabled || w.quotes.enabled || w.bookmarks.enabled) {
    return 'engagement'
  }

  return 'custom'
}

export function applySortPack(
  draft: FeedConfig,
  pack: { id: string; version: string; name: string },
  updatePolicy: import('@cfb/core-types').SortPackUpdatePolicy = 'pinned',
): FeedConfig {
  return {
    ...draft,
    rank: {
      packRef: {
        packageId: pack.id,
        versionPin: pack.version,
        label: pack.name,
        updatePolicy,
      },
    },
  }
}

export function clearSortPackRef(draft: FeedConfig): FeedConfig {
  if (!draft.rank?.packRef) return draft
  const { packRef: _packRef, ...restRank } = draft.rank
  if (!restRank.sortKey) {
    const { rank: _rank, ...rest } = draft
    return rest as FeedConfig
  }
  return { ...draft, rank: restRank }
}

export function applySortMode(
  draft: FeedConfig,
  mode: SortMode,
  weights: EngagementWeights = DEFAULT_ENGAGEMENT_WEIGHTS,
  tuning: SortTuning = DEFAULT_SORT_TUNING,
): FeedConfig {
  if (mode === 'custom') {
    return clearSortPackRef(draft)
  }
  const expr = rankExprForMode(mode, weights, tuning)
  const cleared = clearSortPackRef(draft)
  if (!expr) {
    const { rank: _rank, ...rest } = cleared
    return rest as FeedConfig
  }
  return { ...cleared, rank: { sortKey: expr } }
}

export function sortModeBadge(mode: SortMode, weights: EngagementWeights): string {
  switch (mode) {
    case 'chronological':
      return 'Post time'
    case 'engagement':
      return 'Engagement'
    case 'pack':
      return 'Sort pack'
    case 'custom':
      return 'Custom formula'
  }
}
