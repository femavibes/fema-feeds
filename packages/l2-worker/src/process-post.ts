import type { FeedConfig, L1ProjectResult, NormalizedPost } from '@cfb/core-types'
import { resolveFeedMatch } from '@cfb/l2-graph'
import { evaluateFeedL2 } from '@cfb/l2-eval'
import type pg from 'pg'
import { deleteFeedCandidate, upsertFeedCandidate } from '@cfb/storage-postgres'
import { loadAuthorListsForFeeds } from './author-lists.js'
import { loadFollowRingsForFeeds } from './follow-ring-cache.js'
import { loadMentionDidsForFeeds } from './mention-accounts.js'
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

function defaultSortKey(post: NormalizedPost): number {
  const t = Date.parse(post.indexedAt)
  return Number.isFinite(t) ? t / 1000 : 0
}

/**
 * When a formula-based sortKey is used (e.g. engagement sorting),
 * combine the formula score with a time-based tiebreaker so that:
 * - Posts with equal scores sort chronologically
 * - Each unit of engagement score is worth ~1 hour of recency
 */
function composeSortKey(formulaScore: number, post: NormalizedPost): number {
  const t = Date.parse(post.indexedAt)
  const epochSec = Number.isFinite(t) ? t / 1000 : 0
  // Normalize time to hours since epoch for a reasonable scale
  const timeHours = epochSec / 3600
  // Each engagement point = 1 hour of boost
  return timeHours + formulaScore
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
    loadAuthorListsForFeeds(pool, applicable),
    loadMentionDidsForFeeds(pool, applicable),
    loadFollowRingsForFeeds(pool, applicable),
  ])

  let matched = 0
  let written = 0
  const matchedFeedIds: string[] = []
  for (const feed of applicable) {
    const feedForEval = await resolveFeedSortPack(pool, feed)
    const evalInput = await buildLogicBlockEvalInput(pool, feedForEval, {
      metrics,
      authorLists,
      mentionDids: mentionByFeed[feed.feedId],
      followRings: followRingByFeed[feed.feedId],
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
    const sortKey = result.sortKey != null
      ? composeSortKey(result.sortKey, post)
      : defaultSortKey(post)
    await upsertFeedCandidate(pool, {
      feedId: feed.feedId,
      postUri: post.uri,
      score: sortKey,
      sortKey,
    })
    written++
  }

  return { evaluated: applicable.length, matched, written, matchedFeedIds }
}

export function matchedProjectIdsFromL1(matches: L1ProjectResult[]): string[] {
  return matches.map((m) => m.projectId)
}
