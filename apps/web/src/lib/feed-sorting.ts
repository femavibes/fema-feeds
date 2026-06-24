import type { FeedConfig, L2Expr, L2NumericField } from '@cfb/core-types'

import { defaultRankExpr } from './l2-form'

export type SortMode = 'chronological' | 'engagement' | 'likes' | 'discussion' | 'author_reach' | 'pack'

export function hasSortPackRef(rank: FeedConfig['rank']): boolean {
  return Boolean(rank?.packRef?.packageId)
}

export interface EngagementWeights {
  likes: boolean
  reposts: boolean
  replies: boolean
}

export const DEFAULT_ENGAGEMENT_WEIGHTS: EngagementWeights = {
  likes: true,
  reposts: true,
  replies: false,
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
]

function fieldExpr(field: L2NumericField): L2Expr {
  return { type: 'field', field }
}

function sumFields(fields: Array<'like_count' | 'repost_count' | 'reply_count' | 'author_follower_count'>): L2Expr {
  const [first, ...rest] = fields
  if (!first) return defaultRankExpr()
  return rest.reduce<L2Expr>(
    (acc, f) => ({ type: 'binary', op: '+', left: acc, right: fieldExpr(f) }),
    fieldExpr(first),
  )
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

export function rankExprForMode(mode: SortMode, weights: EngagementWeights = DEFAULT_ENGAGEMENT_WEIGHTS): L2Expr | null {
  switch (mode) {
    case 'chronological':
      return null
    case 'engagement':
      return engagementExpr(weights)
    case 'likes':
      return fieldExpr('like_count')
    case 'discussion':
      return sumFields(['reply_count', 'repost_count'])
    case 'author_reach':
      return fieldExpr('author_follower_count')
    case 'pack':
      return null
  }
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

  return 'engagement'
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
): FeedConfig {
  const expr = rankExprForMode(mode, weights)
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
  }
}
