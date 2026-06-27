import type { FeedConfig, L2NodeTrace, PostMetrics } from '@cfb/core-types'
import { resolveFeedMatch } from '@cfb/l2-graph'
import { evaluateFeedL2 } from '@cfb/l2-eval'
import type pg from 'pg'
import {
  countAllPoolPosts,
  countPostsForProject,
  getAuthorProfilesByDids,
  getPostEngagementBatch,
  getProjectIdsForPostsBatch,
  listAllPoolPosts,
  listPostsForProject,
  normalizedPostFromRow,
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

  const poolTotal =
    feed.poolScope === 'global'
      ? await countAllPoolPosts(pool)
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
  let dbOffset = 0
  const batchSize = 200

  while (scanned < scanLimit) {
    const rows =
      feed.poolScope === 'global'
        ? await listAllPoolPosts(pool, batchSize, dbOffset)
        : await listPostsForProject(pool, feed.projectId, batchSize, dbOffset)
    if (rows.length === 0) break

    const posts = rows.map(normalizedPostFromRow)
    const postUris = posts.map((p) => p.uri)
    const authorDids = [...new Set(posts.map((p) => p.authorDid))]

    // Batch-load all metrics in 3 queries instead of 2*N
    const [engagementMap, projectIdsMap, authorProfiles] = await Promise.all([
      getPostEngagementBatch(pool, postUris),
      feed.poolScope === 'global'
        ? getProjectIdsForPostsBatch(pool, postUris)
        : Promise.resolve(null),
      getAuthorProfilesByDids(pool, authorDids),
    ])

    const profileMap = new Map(authorProfiles.map((p) => [p.did, p]))

    for (const post of posts) {
      if (scanned >= scanLimit) break
      scanned++

      if (feed.poolScope === 'global' && projectIdsMap) {
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
    dbOffset += batchSize
  }

  const allSamples = [...matches, ...rejects]
  await enrichPoolMatchPreviews(allSamples)
  await enrichPoolMatchAuthors(pool, allSamples)

  const truncated = scanned >= scanLimit && scanned < poolTotal

  return { poolTotal, scanned, matchCount, rejectCount, posts: matches, rejects, truncated }
}
