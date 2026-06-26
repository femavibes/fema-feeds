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
}

export interface SortTuning {
  /** Hours half-life for time decay. 0 = no decay. */
  decayHalfLifeHours: number
  /** Multiply editor_score by this before adding to engagement. 0 = ignore. */
  editorScoreWeight: number
}

export const DEFAULT_ENGAGEMENT_WEIGHTS: EngagementWeights = {
  likes: { enabled: true, weight: 1 },
  reposts: { enabled: true, weight: 2 },
  replies: { enabled: true, weight: 1 },
  quotes: { enabled: false, weight: 1 },
}

export const DEFAULT_SORT_TUNING: SortTuning = {
  decayHalfLifeHours: 0,
  editorScoreWeight: 0,
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
    hint: 'Weighted score from likes, reposts, replies, and quotes.',
  },
  {
    id: 'custom',
    label: 'Custom formula',
    hint: 'Build your own sort expression from any available fields.',
  },
]

function fieldExpr(field: L2NumericField): L2Expr {
  return { type: 'field', field }
}

function literal(value: number): L2Expr {
  return { type: 'literal', value }
}

function binary(op: '+' | '-' | '*' | '/', left: L2Expr, right: L2Expr): L2Expr {
  return { type: 'binary', op, left, right }
}

/** Apply time decay: score / (1 + post_age_hours / halfLife) */
function applyDecay(base: L2Expr, halfLifeHours: number): L2Expr {
  if (halfLifeHours <= 0) return base
  const denominator = binary('+', literal(1), binary('/', fieldExpr('post_age_hours'), literal(halfLifeHours)))
  return binary('/', base, denominator)
}

/** Apply editor_score boost: base + (editor_score * weight) */
function applyEditorBoost(base: L2Expr, weight: number): L2Expr {
  if (weight <= 0) return base
  return binary('+', base, binary('*', fieldExpr('editor_score'), literal(weight)))
}

/** Apply tuning (decay + editor boost) to a base expression. */
export function applyTuning(base: L2Expr, tuning: SortTuning): L2Expr {
  let expr = base
  expr = applyEditorBoost(expr, tuning.editorScoreWeight)
  expr = applyDecay(expr, tuning.decayHalfLifeHours)
  return expr
}

export function exprKey(expr: L2Expr): string {
  return JSON.stringify(expr)
}

export function engagementExpr(weights: EngagementWeights): L2Expr {
  const terms: L2Expr[] = []
  if (weights.likes.enabled) {
    terms.push(weights.likes.weight === 1
      ? fieldExpr('like_count')
      : binary('*', fieldExpr('like_count'), literal(weights.likes.weight)))
  }
  if (weights.reposts.enabled) {
    terms.push(weights.reposts.weight === 1
      ? fieldExpr('repost_count')
      : binary('*', fieldExpr('repost_count'), literal(weights.reposts.weight)))
  }
  if (weights.replies.enabled) {
    terms.push(weights.replies.weight === 1
      ? fieldExpr('reply_count')
      : binary('*', fieldExpr('reply_count'), literal(weights.replies.weight)))
  }
  if (weights.quotes.enabled) {
    terms.push(weights.quotes.weight === 1
      ? fieldExpr('quote_count')
      : binary('*', fieldExpr('quote_count'), literal(weights.quotes.weight)))
  }
  if (terms.length === 0) return fieldExpr('like_count')
  return terms.reduce((acc, t) => binary('+', acc, t))
}

/** Human-readable formula string for display. */
export function engagementFormulaLabel(weights: EngagementWeights): string {
  const parts: string[] = []
  if (weights.likes.enabled) {
    parts.push(weights.likes.weight === 1 ? 'likes' : `likes × ${weights.likes.weight}`)
  }
  if (weights.reposts.enabled) {
    parts.push(weights.reposts.weight === 1 ? 'reposts' : `reposts × ${weights.reposts.weight}`)
  }
  if (weights.replies.enabled) {
    parts.push(weights.replies.weight === 1 ? 'replies' : `replies × ${weights.replies.weight}`)
  }
  if (weights.quotes.enabled) {
    parts.push(weights.quotes.weight === 1 ? 'quotes' : `quotes × ${weights.quotes.weight}`)
  }
  return parts.length ? parts.join(' + ') : 'likes'
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
  }
  detectFieldWeight(expr, 'like_count', w, 'likes')
  detectFieldWeight(expr, 'repost_count', w, 'reposts')
  detectFieldWeight(expr, 'reply_count', w, 'replies')
  detectFieldWeight(expr, 'quote_count', w, 'quotes')
  if (!w.likes.enabled && !w.reposts.enabled && !w.replies.enabled && !w.quotes.enabled) {
    w.likes.enabled = true
  }
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
  if (w.likes.enabled || w.reposts.enabled || w.replies.enabled || w.quotes.enabled) {
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
