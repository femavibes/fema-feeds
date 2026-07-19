import type { FeedConfig, L1ProjectResult, NormalizedPost } from '@cfb/core-types'
import { resolveFeedMatch } from '@cfb/l2-graph'
import { evaluateFeedL2 } from '@cfb/l2-eval'
import type pg from 'pg'
import { deleteFeedCandidate, upsertFeedCandidate } from '@cfb/storage-postgres'
import { loadAuthorListSetsForFeeds } from './author-lists.js'
import { loadFollowRingsForFeeds } from './follow-ring-cache.js'
import { loadMentionDidsForFeeds } from './mention-accounts.js'
import { getCachedDidList } from './did-list-mem-cache.js'
import { buildLogicBlockEvalInput } from './logic-block-eval.js'
import { resolveFeedSortPack } from './sort-pack-eval.js'
import { loadPostMetrics } from './metrics.js'

export interface ProcessPostResult {
  evaluated: number
  matched: number
  written: number
  /** Feed IDs that matched (for feed intelligence recording). */
  matchedFeedIds: string[]
}

/**
 * sort_key is purely the formula result. Recency is handled by the secondary
 * sort column (post_indexed_at DESC) in the skeleton query, so equal scores
 * sort newest-first without a hidden time term dominating the formula.
 * Chronological feeds (no formula) write 0 and rely entirely on the tiebreaker.
 */
function postIndexedAtDate(post: NormalizedPost): Date | null {
  const t = Date.parse(post.indexedAt)
  return Number.isFinite(t) ? new Date(t) : null
}

/** Candidate expiry from tuning.maxAgeHours (replaces the old score multiplier). */
function candidateExpiresAt(feed: FeedConfig, post: NormalizedPost): Date | null {
  const maxAgeHours = feed.rank?.tuning?.maxAgeHours ?? 0
  if (maxAgeHours <= 0) return null
  const t = Date.parse(post.indexedAt)
  if (!Number.isFinite(t)) return null
  return new Date(t + maxAgeHours * 60 * 60 * 1000)
}

function feedsForPost(
  feeds: FeedConfig[],
  matchedProjectIds: string[],
): FeedConfig[] {
  const projectSet = new Set(matchedProjectIds)
  return feeds.filter(
    (f) =>
      f.enabled &&
      (f.poolScope === 'global' || projectSet.has(f.projectId)),
  )
}

export interface ProcessPostOptions {
  /** When true, discovery nodes auto-pass (for substitution targets). */
  skipDiscovery?: boolean
}

export async function processPostForFeeds(
  pool: pg.Pool,
  post: NormalizedPost,
  matchedProjectIds: string[],
  feeds: FeedConfig[],
  options?: ProcessPostOptions,
): Promise<ProcessPostResult> {
  const applicable = feedsForPost(feeds, matchedProjectIds)
  if (applicable.length === 0) {
    return { evaluated: 0, matched: 0, written: 0, matchedFeedIds: [] }
  }

  const [metrics, authorLists, mentionByFeed, followRingByFeed] = await Promise.all([
    loadPostMetrics(pool, post.uri, post.authorDid, applicable[0]?.feedId),
    loadAuthorListSetsForFeeds(pool, applicable),
    loadMentionDidsForFeeds(pool, applicable),
    loadFollowRingsForFeeds(pool, applicable),
  ])

  // Prefer mem-cached Sets for follow rings (avoid new Set(49k) per post).
  const followRingSetsByFeed: Record<string, Record<string, ReadonlySet<string>>> = {}
  for (const [feedId, rings] of Object.entries(followRingByFeed)) {
    const sets: Record<string, ReadonlySet<string>> = {}
    for (const [nodeId, dids] of Object.entries(rings)) {
      const mem = getCachedDidList(`ring:${nodeId}`)
      sets[nodeId] = mem?.set ?? new Set(dids)
    }
    followRingSetsByFeed[feedId] = sets
  }
  let matched = 0
  let written = 0
  const matchedFeedIds: string[] = []
  for (const feed of applicable) {
    const feedForEval = await resolveFeedSortPack(pool, feed)
    const evalInput = await buildLogicBlockEvalInput(pool, feedForEval, {
      metrics,
      authorLists,
      mentionDids: mentionByFeed[feed.feedId],
      followRings: followRingSetsByFeed[feed.feedId],
    })
    const result = evaluateFeedL2(post, { ...feedForEval, match: resolveFeedMatch(feedForEval) }, {
      ...evalInput,
      ...(options?.skipDiscovery ? { skipDiscovery: true } : {}),
    })
    if (!result.matched) {
      await deleteFeedCandidate(pool, feed.feedId, post.uri)
      continue
    }
    matched++
    matchedFeedIds.push(feed.feedId)
    const sortKey = result.sortKey ?? 0
    await upsertFeedCandidate(pool, {
      feedId: feed.feedId,
      postUri: post.uri,
      score: sortKey,
      sortKey,
      postIndexedAt: postIndexedAtDate(post),
      expiresAt: candidateExpiresAt(feed, post),
    })
    written++
  }

  return { evaluated: applicable.length, matched, written, matchedFeedIds }
}

export function matchedProjectIdsFromL1(matches: L1ProjectResult[]): string[] {
  return matches.map((m) => m.projectId)
}
