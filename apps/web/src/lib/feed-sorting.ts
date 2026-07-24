import type { FeedConfig, L2Expr, L2NumericField, EngagementWeights, SortTuning } from '@cfb/core-types'
import {
  DEFAULT_ENGAGEMENT_WEIGHTS,
  DEFAULT_SORT_TUNING,
} from './feed-sort-defaults.js'
import {
  compileAdvancedSort,
  compileEngagementSort,
} from './feed-sort-compile.js'

export type SortMode = 'chronological' | 'engagement' | 'advanced' | 'builder' | 'pack'

export function hasSortPackRef(rank: FeedConfig['rank']): boolean {
  return Boolean(rank?.packRef?.packageId)
}

export {
  DEFAULT_ENGAGEMENT_WEIGHTS,
  DEFAULT_CONTENT_SIGNALS,
  DEFAULT_RATIO_SIGNALS,
  DEFAULT_MEDIA_BONUS,
  DEFAULT_SORT_TUNING,
} from './feed-sort-defaults.js'

export {
  engagementExpr,
  applyTuning,
  engagementFormulaLabel,
  advancedFormulaLabel,
} from './feed-sort-compile.js'

export {
  SORT_FORMULA_CHUNK_TEMPLATES,
  decayFormulaLabel,
  authorFairnessFormulaLabel,
} from './feed-sort-chunks.js'

export const SORT_MODE_OPTIONS: {
  id: SortMode
  label: string
  hint: string
}[] = [
  {
    id: 'chronological',
    label: 'Chronological',
    hint: 'Newest or oldest first — no scoring formula.',
  },
  {
    id: 'engagement',
    label: 'Engagement',
    hint: 'Weighted likes, reposts, replies, and audience signals with shared decay.',
  },
  {
    id: 'advanced',
    label: 'Advanced scoring',
    hint: 'Engagement plus media, ratios, and content signals — fixed formula layout.',
  },
  {
    id: 'builder',
    label: 'Formula builder',
    hint: 'Write the full sort formula yourself.',
  },
]

export function exprKey(expr: L2Expr): string {
  return JSON.stringify(expr)
}

export function rankExprForMode(
  mode: SortMode,
  weights: EngagementWeights = DEFAULT_ENGAGEMENT_WEIGHTS,
  tuning: SortTuning = DEFAULT_SORT_TUNING,
): L2Expr | null {
  switch (mode) {
    case 'engagement':
      return compileEngagementSort(weights, tuning)
    case 'advanced':
      return compileAdvancedSort(weights, tuning)
    case 'chronological':
    case 'pack':
    case 'builder':
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
    audienceLikes: { enabled: false, weight: 3 },
    audienceReposts: { enabled: false, weight: 5 },
  }
  detectFieldWeight(expr, 'like_count', w, 'likes')
  detectFieldWeight(expr, 'repost_count', w, 'reposts')
  detectFieldWeight(expr, 'reply_count', w, 'replies')
  detectFieldWeight(expr, 'quote_count', w, 'quotes')
  detectFieldWeight(expr, 'bookmark_count', w, 'bookmarks')
  detectFieldWeight(expr, 'audience_like_count', w, 'audienceLikes')
  detectFieldWeight(expr, 'audience_repost_count', w, 'audienceReposts')
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

function tuningHasAdvancedExtras(tuning?: SortTuning): boolean {
  if (!tuning) return false
  const m = tuning.mediaBonus
  if (m.image.enabled || m.video.enabled || m.linkCard.enabled) return true
  const c = tuning.contentSignals
  if (Object.values(c).some((s) => s.enabled && s.weight !== 0)) return true
  const r = tuning.ratioSignals
  if (Object.values(r).some((s) => s.enabled && s.weight !== 0)) return true
  return false
}

export function detectSortMode(rank: FeedConfig['rank']): SortMode {
  if (rank?.packRef) return 'pack'
  if (!rank?.sortKey) return 'chronological'
  if (rank.sortMode === 'builder') return 'builder'
  if (rank.sortMode === 'advanced' || (rank.sortMode as string | undefined) === 'custom') return 'advanced'
  if (rank.sortMode === 'engagement') return 'engagement'
  if (tuningHasAdvancedExtras(rank.tuning)) return 'advanced'
  const w = detectEngagementWeights(rank.sortKey)
  if (w.likes.enabled || w.reposts.enabled || w.replies.enabled || w.quotes.enabled || w.bookmarks.enabled) {
    return 'engagement'
  }
  return 'builder'
}

export function applySortPack(
  draft: FeedConfig,
  pack: { id: string; version: string; name: string },
  updatePolicy: import('@cfb/core-types').SortPackUpdatePolicy = 'notify',
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

export function setSortPackUpdatePolicy(
  draft: FeedConfig,
  updatePolicy: import('@cfb/core-types').SortPackUpdatePolicy,
): FeedConfig {
  const ref = draft.rank?.packRef
  if (!ref) return draft
  return {
    ...draft,
    rank: {
      ...draft.rank,
      packRef: { ...ref, updatePolicy },
    },
  }
}

export function clearSortPackRef(draft: FeedConfig): FeedConfig {
  if (!draft.rank?.packRef) return draft
  const { packRef: _packRef, ...restRank } = draft.rank
  if (!restRank.sortKey && !restRank.chronologicalOrder && !restRank.sortMode) {
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
  if (mode === 'builder') {
    return clearSortPackRef(draft)
  }
  const expr = rankExprForMode(mode, weights, tuning)
  const cleared = clearSortPackRef(draft)
  if (!expr) {
    const order = draft.rank?.chronologicalOrder ?? cleared.rank?.chronologicalOrder ?? 'newest'
    return { ...cleared, rank: { chronologicalOrder: order } }
  }
  const sortMode = mode === 'engagement' || mode === 'advanced' ? mode : undefined
  return { ...cleared, rank: { sortKey: expr, tuning, sortMode } }
}

export function sortModeBadge(mode: SortMode, _weights: EngagementWeights): string {
  switch (mode) {
    case 'chronological':
      return 'Post time'
    case 'engagement':
      return 'Engagement'
    case 'advanced':
      return 'Advanced scoring'
    case 'pack':
      return 'Sorting formula'
    case 'builder':
      return 'Formula builder'
  }
}

export function rebuildSortRank(
  mode: 'engagement' | 'advanced',
  weights: EngagementWeights,
  tuning: SortTuning,
  draft: FeedConfig,
): FeedConfig {
  const sortKey = mode === 'engagement'
    ? compileEngagementSort(weights, tuning)
    : compileAdvancedSort(weights, tuning)
  return {
    ...draft,
    rank: {
      ...draft.rank,
      sortKey,
      tuning,
      sortMode: mode,
    },
  }
}
