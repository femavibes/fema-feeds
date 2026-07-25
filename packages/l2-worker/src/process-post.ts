import type {
  FeedCandidateMatchVia,
  FeedConfig,
  FeedIngressOrigin,
  L1ProjectResult,
  NormalizedPost,
  SubstitutionDirection,
} from '@cfb/core-types'
import { matchedViaForIngress, scoutSourceEnabled, substituteSourceEnabled } from '@cfb/core-types'
import { resolveFeedMatchForIngress } from '@cfb/l2-graph'
import { evaluateFeedL2 } from '@cfb/l2-eval'
import type pg from 'pg'
import { deleteFeedCandidate, upsertFeedCandidate, recordFeedParamMatch } from '@cfb/storage-postgres'
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
 * sort column (post_indexed_at DESC/ASC per chronologicalOrder) in the skeleton
 * query, so equal scores sort by time without a hidden time term in the formula.
 * Chronological feeds (no formula) write 0 and rely entirely on the tiebreaker.
 */
function postIndexedAtDate(post: NormalizedPost): Date | null {
  const t = Date.parse(post.indexedAt)
  return Number.isFinite(t) ? new Date(t) : null
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

function feedsForIngress(
  feeds: FeedConfig[],
  matchedProjectIds: string[],
  ingress: FeedIngressOrigin,
): FeedConfig[] {
  const applicable = feedsForPost(feeds, matchedProjectIds)
  switch (ingress) {
    case 'scout':
      return applicable.filter((f) => scoutSourceEnabled(f.sources))
    case 'substitute':
      return applicable.filter((f) => substituteSourceEnabled(f.sources))
    default:
      if (/^source-\d+$/.test(ingress)) {
        const index = Number(ingress.slice('source-'.length))
        return applicable.filter((f) => {
          const native = f.sources?.native
          if (!native?.[index]) return false
          const nodeId = `source-${index}`
          const edges = f.visualLayout?.edges ?? []
          return edges.some((e) => e.source === nodeId)
        })
      }
      return applicable
  }
}

export function resolveMatchForEval(feed: FeedConfig, ingress: FeedIngressOrigin = 'pool') {
  return resolveFeedMatchForIngress(feed, ingress)
}

export interface ProcessPostOptions {
  /** Ingress path to evaluate (default pool / START). */
  ingress?: FeedIngressOrigin
  /** Override matched_via (defaults from ingress). */
  matchedVia?: FeedCandidateMatchVia
  substituteDirection?: SubstitutionDirection
}

export async function processPostForFeeds(
  pool: pg.Pool,
  post: NormalizedPost,
  matchedProjectIds: string[],
  feeds: FeedConfig[],
  options?: ProcessPostOptions,
): Promise<ProcessPostResult> {
  const ingress = options?.ingress ?? 'pool'
  const applicable = feedsForIngress(feeds, matchedProjectIds, ingress)
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
    const match = resolveMatchForEval(feedForEval, ingress)
    const result = evaluateFeedL2(post, { ...feedForEval, match }, evalInput)
    if (!result.matched) {
      if (ingress === 'pool') {
        await deleteFeedCandidate(pool, feed.feedId, post.uri)
      }
      continue
    }
    matched++
    matchedFeedIds.push(feed.feedId)
    void recordFeedParamMatch(pool, feed.feedId, result.trace, post.authorDid).catch(() => undefined)
    const sortKey = result.sortKey ?? 0
    await upsertFeedCandidate(pool, {
      feedId: feed.feedId,
      postUri: post.uri,
      score: sortKey,
      sortKey,
      postIndexedAt: postIndexedAtDate(post),
      matchedVia: options?.matchedVia ?? matchedViaForIngress(ingress, feed),
      substituteDirection: options?.substituteDirection,
    })
    written++
  }

  return { evaluated: applicable.length, matched, written, matchedFeedIds }
}

export function matchedProjectIdsFromL1(matches: L1ProjectResult[]): string[] {
  return matches.map((m) => m.projectId)
}
