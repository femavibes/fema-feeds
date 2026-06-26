import type { FeedConfig, L2Expr, L2NumericField } from '@cfb/core-types'

import { defaultRankExpr } from './l2-form'

export type SortMode = 'chronological' | 'engagement' | 'likes' | 'discussion' | 'author_reach' | 'pack' | 'custom'

export function hasSortPackRef(rank: FeedConfig['rank']): boolean {
  return Boolean(rank?.packRef?.packageId)
}

export interface EngagementWeights {
  likes: boolean
  reposts: boolean
  replies: boolean
}

export interface SortTuning {
  /** Hours half-life for time decay. 0 = no decay. */
  decayHalfLifeHours: number
  /** Multiply editor_score by this before adding to engagement. 0 = ignore. */
  editorScoreWeight: number
}

export const DEFAULT_ENGAGEMENT_WEIGHTS: EngagementWeights = {
  likes: true,
  reposts: true,
  replies: false,
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
    hint: 'Score from likes, reposts, and replies — tune which signals count below.',
  },
  {
    id: 'likes',
    label: 'Most liked',
    hint: 'Posts with the highest like count rise to the top.',
  },
  {
    id: 'discussion',
    label: 'Discussion',
    hint: 'Replies plus reposts — surfaces posts people are talking about.',
  },
  {
    id: 'author_reach',
    label: 'Author reach',
    hint: 'Posts from accounts with more followers rank higher.',
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

function sumFields(fields: Array<'like_count' | 'repost_count' | 'reply_count' | 'author_follower_count'>): L2Expr {
  const [first, ...rest] = fields
  if (!first) return defaultRankExpr()
  return rest.reduce<L2Expr>(
    (acc, f) => binary('+', acc, fieldExpr(f)),
    fieldExpr(first),
  )
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
  const fields: Array<'like_count' | 'repost_count' | 'reply_count'> = []
  if (weights.likes) fields.push('like_count')
  if (weights.reposts) fields.push('repost_count')
  if (weights.replies) fields.push('reply_count')
  if (fields.length === 0) {
    return defaultRankExpr()
  }
  return sumFields(fields)
}

export function rankExprForMode(
  mode: SortMode,
  weights: EngagementWeights = DEFAULT_ENGAGEMENT_WEIGHTS,
  tuning: SortTuning = DEFAULT_SORT_TUNING,
): L2Expr | null {
  let base: L2Expr | null = null
  switch (mode) {
    case 'chronological':
      return null
    case 'engagement':
      base = engagementExpr(weights)
      break
    case 'likes':
      base = fieldExpr('like_count')
      break
    case 'discussion':
      base = sumFields(['reply_count', 'repost_count'])
      break
    case 'author_reach':
      base = fieldExpr('author_follower_count')
      break
    case 'pack':
    case 'custom':
      return null
  }
  if (!base) return null
  return applyTuning(base, tuning)
}

export function detectEngagementWeights(expr: L2Expr): EngagementWeights {
  const key = exprKey(expr)
  const withReplies = exprKey(engagementExpr({ likes: true, reposts: true, replies: true }))
  const defaultKey = exprKey(defaultRankExpr())
  const likesOnly = exprKey(fieldExpr('like_count'))
  const repostsOnly = exprKey(fieldExpr('repost_count'))
  const repliesOnly = exprKey(fieldExpr('reply_count'))

  if (key === withReplies) return { likes: true, reposts: true, replies: true }
  if (key === defaultKey) return { ...DEFAULT_ENGAGEMENT_WEIGHTS }
  if (key === likesOnly) return { likes: true, reposts: false, replies: false }
  if (key === repostsOnly) return { likes: false, reposts: true, replies: false }
  if (key === repliesOnly) return { likes: false, reposts: false, replies: true }

  const likesReplies = exprKey(engagementExpr({ likes: true, reposts: false, replies: true }))
  const repostsReplies = exprKey(engagementExpr({ likes: false, reposts: true, replies: true }))
  if (key === likesReplies) return { likes: true, reposts: false, replies: true }
  if (key === repostsReplies) return { likes: false, reposts: true, replies: true }

  return { ...DEFAULT_ENGAGEMENT_WEIGHTS }
}

export function detectSortMode(rank: FeedConfig['rank']): SortMode {
  if (rank?.packRef) return 'pack'
  if (!rank?.sortKey) return 'chronological'

  const key = exprKey(rank.sortKey)
  // Check basic presets (no tuning)
  for (const mode of ['likes', 'discussion', 'author_reach'] as const) {
    const preset = rankExprForMode(mode)
    if (preset && exprKey(preset) === key) return mode
  }

  const engagementVariants: EngagementWeights[] = [
    DEFAULT_ENGAGEMENT_WEIGHTS,
    { likes: true, reposts: true, replies: true },
    { likes: true, reposts: false, replies: false },
    { likes: false, reposts: true, replies: false },
    { likes: false, reposts: false, replies: true },
    { likes: true, reposts: false, replies: true },
    { likes: false, reposts: true, replies: true },
  ]
  for (const weights of engagementVariants) {
    if (exprKey(engagementExpr(weights)) === key) return 'engagement'
  }

  // If it doesn't match any preset exactly, it's a custom formula
  // (could be a tuned preset — still show as the base mode)
  // Try to detect tuned presets by checking if the expr contains known fields
  if (containsField(rank.sortKey, 'like_count') || containsField(rank.sortKey, 'repost_count') || containsField(rank.sortKey, 'reply_count')) {
    return 'engagement'
  }
  if (containsField(rank.sortKey, 'author_follower_count')) return 'author_reach'

  return 'custom'
}

function containsField(expr: L2Expr, field: L2NumericField): boolean {
  if (expr.type === 'field') return expr.field === field
  if (expr.type === 'binary') return containsField(expr.left, field) || containsField(expr.right, field)
  return false
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
    // Custom mode keeps whatever sortKey is currently set (user edits it)
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
    case 'likes':
      return 'Likes'
    case 'discussion':
      return 'Discussion'
    case 'author_reach':
      return 'Followers'
    case 'engagement': {
      const parts: string[] = []
      if (weights.likes) parts.push('likes')
      if (weights.reposts) parts.push('reposts')
      if (weights.replies) parts.push('replies')
      return parts.length ? `Engagement (${parts.join(' + ')})` : 'Engagement'
    }
    case 'pack':
      return 'Sort pack'
    case 'custom':
      return 'Custom formula'
  }
}
