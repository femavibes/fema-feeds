import type { FeedConfig, L2NodeTrace, PostMetrics } from '@cfb/core-types'
import { resolveFeedMatch } from '@cfb/l2-graph'
import { evaluateFeedL2 } from '@cfb/l2-eval'
import type pg from 'pg'
import {
  countAllPoolPosts,
  countPoolPostsFiltered,
  countPostsForProject,
  getAuthorProfilesByDids,
  getPostEngagementBatch,
  getProjectIdsForPostsBatch,
  listAllPoolPosts,
  listPoolPostsFiltered,
  listPostsForProject,
  normalizedPostFromRow,
  type IngestedPostRow,
} from '@cfb/storage-postgres'
import { loadAuthorListsForFeeds } from './author-lists.js'
import { loadFollowRingsForFeed } from './follow-ring-cache.js'
import { loadMentionDidsForFeed } from './mention-accounts.js'
import { buildLogicBlockEvalInput } from './logic-block-eval.js'
import { enrichPoolMatchPreviews } from './pool-match-enrich.js'
import {
  buildPoolMatchSample,
  enrichPoolMatchAuthors,
  type PoolMatchItem,
  type PoolMatchSample,
} from './pool-match-sample.js'
import { extractPoolPreFilter } from './pool-prefilter.js'

export type {
  PoolMatchAuthor,
  PoolMatchItem,
  PoolMatchMediaPreview,
  PoolMatchQuotePreview,
  PoolMatchSample,
} from './pool-match-sample.js'

export interface PoolMatchResult {
  poolTotal: number
  scanned: number
  matchCount: number
  rejectCount: number
  posts: PoolMatchItem[]
  rejects: PoolMatchSample[]
  truncated: boolean
}

function defaultSortKey(indexedAt: string): number {
  const t = Date.parse(indexedAt)
  return Number.isFinite(t) ? t / 1000 : 0
}

function postInFeedScope(feed: FeedConfig, projectIds: string[]): boolean {
  if (feed.poolScope === 'global') return true
  return projectIds.includes(feed.projectId)
}

/** Evaluate draft feed rules against recent pool posts (read-only; does not write candidates). */
export async function previewFeedPoolMatches(
  pool: pg.Pool,
  feed: FeedConfig,
  options: { limit?: number; scanLimit?: number; rejectLimit?: number } = {},
): Promise<PoolMatchResult> {
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100)
  const scanLimit = Math.min(Math.max(options.scanLimit ?? 500, 1), 250_000)
  const rejectLimit = Math.min(Math.max(options.rejectLimit ?? 8, 0), 50)

  const preFilter = extractPoolPreFilter(feed)

  const poolTotal =
    feed.poolScope === 'global'
      ? preFilter
        ? await countPoolPostsFiltered(pool, preFilter.where, preFilter.params)
        : await countAllPoolPosts(pool)
      : await countPostsForProject(pool, feed.projectId)

  if (poolTotal === 0) {
    return {
      poolTotal: 0,
      scanned: 0,
      matchCount: 0,
      rejectCount: 0,
      posts: [],
      rejects: [],
      truncated: false,
    }
  }

  const [authorLists, mentionDids, followRings] = await Promise.all([
    loadAuthorListsForFeeds(pool, [feed]),
    loadMentionDidsForFeed(pool, feed),
    loadFollowRingsForFeed(pool, feed),
  ])
  const evalInput = await buildLogicBlockEvalInput(pool, feed, {
    authorLists,
    mentionDids,
    followRings,
  })
  const resolvedMatch = resolveFeedMatch(feed)
  const matches: PoolMatchItem[] = []
  const rejects: PoolMatchSample[] = []
  let scanned = 0
  let matchCount = 0
  let rejectCount = 0
  let cursor: string | undefined
  const batchSize = 200

  while (scanned < scanLimit) {
    // Early termination: stop if we have enough results to display
    if (matches.length >= limit && rejects.length >= rejectLimit) break

    let rows: IngestedPostRow[]
    if (preFilter) {
      rows = await listPoolPostsFiltered(
        pool, batchSize, 0, preFilter.where, preFilter.params, cursor,
      )
    } else if (feed.poolScope === 'global') {
      rows = await listAllPoolPosts(pool, batchSize, cursor)
    } else {
      rows = await listPostsForProject(pool, feed.projectId, batchSize, cursor)
    }
    if (rows.length === 0) break

    const posts = rows.map(normalizedPostFromRow)
    // Update cursor to the last row's indexedAt for next batch
    cursor = posts[posts.length - 1]!.indexedAt

    const postUris = posts.map((p) => p.uri)
    const authorDids = [...new Set(posts.map((p) => p.authorDid))]

    // Batch-load all metrics in 3 queries instead of 2*N
    const [engagementMap, projectIdsMap, authorProfiles] = await Promise.all([
      getPostEngagementBatch(pool, postUris),
      feed.poolScope === 'global' && !preFilter
        ? getProjectIdsForPostsBatch(pool, postUris)
        : Promise.resolve(null),
      getAuthorProfilesByDids(pool, authorDids),
    ])

    const profileMap = new Map(authorProfiles.map((p) => [p.did, p]))

    for (const post of posts) {
      if (scanned >= scanLimit) break
      scanned++

      if (feed.poolScope === 'global' && !preFilter && projectIdsMap) {
        const projectIds = projectIdsMap.get(post.uri) ?? []
        if (!postInFeedScope(feed, projectIds)) continue
      }

      const engagement = engagementMap.get(post.uri)
      const profile = profileMap.get(post.authorDid)
      const metrics: PostMetrics = {
        likeCount: engagement?.likeCount ?? 0,
        repostCount: engagement?.repostCount ?? 0,
        replyCount: engagement?.replyCount ?? 0,
        quoteCount: engagement?.quoteCount ?? 0,
        bookmarkCount: engagement?.bookmarkCount ?? 0,
        authorFollowerCount: profile?.followersCount ?? 0,
        authorFollowsCount: profile?.followsCount ?? 0,
        authorPostsCount: profile?.postsCount ?? 0,
      }

      const result = evaluateFeedL2(
        post,
        { ...feed, match: resolvedMatch },
        { ...evalInput, metrics, preview: true },
      )

      if (!result.matched) {
        rejectCount++
        if (rejects.length < rejectLimit) {
          rejects.push(buildPoolMatchSample(post, result.trace))
        }
        continue
      }

      matchCount++
      if (matches.length < limit) {
        matches.push({
          ...buildPoolMatchSample(post, result.trace),
          sortKey: result.sortKey ?? defaultSortKey(post.indexedAt),
          editorScore: result.editorScore,
        })
      }
    }

    if (rows.length < batchSize) break
  }

  const allSamples = [...matches, ...rejects]
  await enrichPoolMatchPreviews(allSamples)
  await enrichPoolMatchAuthors(pool, allSamples)

  const truncated = scanned >= scanLimit && scanned < poolTotal

  return { poolTotal, scanned, matchCount, rejectCount, posts: matches, rejects, truncated }
}
