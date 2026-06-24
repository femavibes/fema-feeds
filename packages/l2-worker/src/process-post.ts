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
}

function defaultSortKey(post: NormalizedPost): number {
  const t = Date.parse(post.indexedAt)
  return Number.isFinite(t) ? t / 1000 : 0
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

export async function processPostForFeeds(
  pool: pg.Pool,
  post: NormalizedPost,
  matchedProjectIds: string[],
  feeds: FeedConfig[],
): Promise<ProcessPostResult> {
  const applicable = feedsForPost(feeds, matchedProjectIds)
  if (applicable.length === 0) {
    return { evaluated: 0, matched: 0, written: 0 }
  }

  const [metrics, authorLists, mentionByFeed, followRingByFeed] = await Promise.all([
    loadPostMetrics(pool, post.uri, post.authorDid),
    loadAuthorListsForFeeds(pool, applicable),
    loadMentionDidsForFeeds(pool, applicable),
    loadFollowRingsForFeeds(pool, applicable),
  ])

  let matched = 0
  let written = 0
  for (const feed of applicable) {
    const feedForEval = await resolveFeedSortPack(pool, feed)
    const evalInput = await buildLogicBlockEvalInput(pool, feedForEval, {
      metrics,
      authorLists,
      mentionDids: mentionByFeed[feed.feedId],
      followRings: followRingByFeed[feed.feedId],
    })
    const result = evaluateFeedL2(post, { ...feedForEval, match: resolveFeedMatch(feedForEval) }, evalInput)
    if (!result.matched) {
      await deleteFeedCandidate(pool, feed.feedId, post.uri)
      continue
    }
    matched++
    const sortKey = result.sortKey ?? defaultSortKey(post)
    await upsertFeedCandidate(pool, {
      feedId: feed.feedId,
      postUri: post.uri,
      score: sortKey,
      sortKey,
    })
    written++
  }

  return { evaluated: applicable.length, matched, written }
}

export function matchedProjectIdsFromL1(matches: L1ProjectResult[]): string[] {
  return matches.map((m) => m.projectId)
}
