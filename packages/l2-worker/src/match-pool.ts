import type { FeedConfig, PostMetrics } from '@cfb/core-types'
import { applyParametersToMatch, resolveFeedMatch } from '@cfb/l2-graph'
import { evaluateFeedL2 } from '@cfb/l2-eval'
import type pg from 'pg'
import {
  countAllPoolPosts,
  countFeedCandidates,
  countPoolPostsFiltered,
  countPostsForProject,
  getAuthorProfilesByDids,
  getIngestedPost,
  getPostEngagementBatch,
  getProjectIdsForPostsBatch,
  listAllPoolPosts,
  listFeedCandidateRows,
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
import { hydrateRepostSubject } from './hydrate-repost.js'
import {
  buildPoolMatchSample,
  enrichPoolMatchAuthors,
  type PoolMatchItem,
  type PoolMatchSample,
} from './pool-match-sample.js'
import { extractPoolPreFilter } from './pool-prefilter.js'

export type PoolMatchPreviewMode = 'live' | 'formula'

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
  substitutedCount: number
  posts: PoolMatchItem[]
  rejects: PoolMatchSample[]
  truncated: boolean
  /** Where ranked matches came from — candidates matches the Bluesky skeleton. */
  previewSource?: 'candidates' | 'scan'
}

/** Live-feed ordering: sort_key DESC, then indexed_at DESC (matches the skeleton query). */
function compareFeedOrder(a: PoolMatchItem, b: PoolMatchItem): number {
  const diff = (b.sortKey ?? 0) - (a.sortKey ?? 0)
  if (diff !== 0) return diff
  return Date.parse(b.indexedAt) - Date.parse(a.indexedAt)
}

function postInFeedScope(feed: FeedConfig, projectIds: string[]): boolean {
  if (feed.poolScope === 'global') return true
  return projectIds.includes(feed.projectId)
}

async function fetchSubjectPostFromApi(uri: string): Promise<import('@cfb/core-types').NormalizedPost | null> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 4_000)
  try {
    const res = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0&parentHeight=0`,
      { signal: ac.signal },
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      thread?: {
        post?: {
          uri: string
          cid: string
          author?: { did: string }
          record?: Record<string, unknown>
          indexedAt?: string
        }
      }
    }
    const post = data.thread?.post
    if (!post?.record) return null
    const { normalizeJetstreamPost } = await import('@cfb/post-normalize')
    return normalizeJetstreamPost({
      uri: post.uri,
      cid: post.cid,
      author: post.author?.did ?? '',
      record: post.record as import('@cfb/post-normalize').JetstreamPostEvent['record'],
      time: post.indexedAt,
    })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fill subject text for a kept Matches row only (never in the hot scan path).
 * Prefer pool DB; remote API is budgeted so Matches can't hang.
 */
async function hydrateKeptRepost(
  pool: pg.Pool,
  post: import('@cfb/core-types').NormalizedPost,
  remoteBudget: { left: number },
): Promise<import('@cfb/core-types').NormalizedPost> {
  if (post.postKind !== 'repost') return post
  const local = await hydrateRepostSubject(pool, post, async () => null, {
    allowRemoteFetch: false,
  })
  if (local.text.trim() || local.embedDetail) return local
  if (remoteBudget.left <= 0) return local
  remoteBudget.left--
  return hydrateRepostSubject(pool, local, fetchSubjectPostFromApi, {
    allowRemoteFetch: true,
  })
}

/** Evaluate draft feed rules against recent pool posts (read-only; does not write candidates). */
export async function previewFeedPoolMatches(
  pool: pg.Pool,
  feed: FeedConfig,
  options: {
    limit?: number
    scanLimit?: number
    rejectLimit?: number
    /** live = indexed feed_candidates (Bluesky skeleton). formula = full pool re-eval. */
    previewMode?: PoolMatchPreviewMode
  } = {},
): Promise<PoolMatchResult> {
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100)
  const scanLimit = Math.min(Math.max(options.scanLimit ?? 500, 1), 250_000)
  const rejectLimit = Math.min(Math.max(options.rejectLimit ?? 8, 0), 50)
  const previewMode = options.previewMode ?? 'live'
  const hasSortFormula = Boolean(feed.rank?.sortKey || feed.rank?.packRef)

  if (hasSortFormula && previewMode === 'live') {
    const candidateCount = await countFeedCandidates(pool, feed.feedId)
    if (candidateCount > 0) {
      return previewMatchesFromCandidates(pool, feed, {
        limit,
        scanLimit,
        rejectLimit,
        candidateCount,
      })
    }
  }

  return previewMatchesFromScan(pool, feed, { limit, scanLimit, rejectLimit, hasSortFormula })
}

async function previewMatchesFromCandidates(
  pool: pg.Pool,
  feed: FeedConfig,
  options: { limit: number; scanLimit: number; rejectLimit: number; candidateCount: number },
): Promise<PoolMatchResult> {
  const { limit, scanLimit, rejectLimit, candidateCount } = options
  const preFilter = extractPoolPreFilter(feed)
  const poolTotal =
    feed.poolScope === 'global'
      ? preFilter
        ? await countPoolPostsFiltered(pool, preFilter.where, preFilter.params)
        : await countAllPoolPosts(pool)
      : await countPostsForProject(pool, feed.projectId)

  const candidateRows = await listFeedCandidateRows(pool, feed.feedId, limit)
  const remoteBudget = { left: 12 }
  const matches: PoolMatchItem[] = []

  for (const row of candidateRows) {
    const ingested = await getIngestedPost(pool, row.postUri)
    if (!ingested) continue
    const post = normalizedPostFromRow(ingested)
    const display = await hydrateKeptRepost(pool, post, remoteBudget)
    matches.push({
      ...buildPoolMatchSample(display, []),
      sortKey: row.sortKey,
      editorScore: 0,
    })
  }

  const rejects = await samplePoolRejects(pool, feed, {
    scanLimit: Math.min(scanLimit, 5000),
    rejectLimit,
    collectMatches: false,
  })

  const allSamples = [...matches, ...rejects.rejects]
  await enrichPoolMatchPreviews(allSamples)
  await enrichPoolMatchAuthors(pool, allSamples)

  return {
    poolTotal,
    scanned: rejects.scanned,
    matchCount: candidateCount,
    rejectCount: rejects.rejectCount,
    substitutedCount: 0,
    posts: matches,
    rejects: rejects.rejects,
    truncated: false,
    previewSource: 'candidates',
  }
}

async function previewMatchesFromScan(
  pool: pg.Pool,
  feed: FeedConfig,
  options: { limit: number; scanLimit: number; rejectLimit: number; hasSortFormula: boolean },
): Promise<PoolMatchResult> {
  const { limit, scanLimit, rejectLimit, hasSortFormula } = options
  const result = await samplePoolRejects(pool, feed, {
    scanLimit,
    rejectLimit,
    collectMatches: true,
    matchLimit: limit,
    hasSortFormula,
  })

  const allSamples = [...result.matches, ...result.rejects]
  await enrichPoolMatchPreviews(allSamples)
  await enrichPoolMatchAuthors(pool, allSamples)

  return {
    poolTotal: result.poolTotal,
    scanned: result.scanned,
    matchCount: result.matchCount,
    rejectCount: result.rejectCount,
    substitutedCount: 0,
    posts: result.matches,
    rejects: result.rejects,
    truncated: result.truncated,
    previewSource: 'scan',
  }
}

async function samplePoolRejects(
  pool: pg.Pool,
  feed: FeedConfig,
  options: {
    scanLimit: number
    rejectLimit: number
    collectMatches: boolean
    matchLimit?: number
    hasSortFormula?: boolean
  },
): Promise<{
  poolTotal: number
  scanned: number
  matchCount: number
  rejectCount: number
  matches: PoolMatchItem[]
  rejects: PoolMatchSample[]
  truncated: boolean
}> {
  const { scanLimit, rejectLimit, collectMatches } = options
  const matchLimit = options.matchLimit ?? 0
  const hasSortFormula = options.hasSortFormula ?? Boolean(feed.rank?.sortKey || feed.rank?.packRef)

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
      matches: [],
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
  const resolvedMatch = applyParametersToMatch(resolveFeedMatch(feed))
  const matches: PoolMatchItem[] = []
  const rejects: PoolMatchSample[] = []

  const pushMatch = (item: PoolMatchItem) => {
    if (!collectMatches || matchLimit <= 0) return
    if (matches.length < matchLimit) {
      matches.push(item)
      return
    }
    let worst = 0
    for (let i = 1; i < matches.length; i++) {
      if (compareFeedOrder(matches[i]!, matches[worst]!) > 0) worst = i
    }
    if (compareFeedOrder(item, matches[worst]!) < 0) matches[worst] = item
  }

  let scanned = 0
  let matchCount = 0
  let rejectCount = 0
  let cursor: string | undefined
  const batchSize = 200
  const remoteBudget = { left: 12 }

  while (scanned < scanLimit) {
    if (!collectMatches && rejects.length >= rejectLimit) break
    if (
      !hasSortFormula &&
      collectMatches &&
      matches.length >= matchLimit &&
      rejects.length >= rejectLimit
    ) {
      break
    }

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
    cursor = posts[posts.length - 1]!.indexedAt

    const postUris = posts.map((p) => p.uri)
    const authorDids = [...new Set(posts.map((p) => p.authorDid))]

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
          const display = await hydrateKeptRepost(pool, post, remoteBudget)
          rejects.push(buildPoolMatchSample(display, result.trace))
        }
        continue
      }

      matchCount++
      if (collectMatches) {
        const display = await hydrateKeptRepost(pool, post, remoteBudget)
        pushMatch({
          ...buildPoolMatchSample(display, result.trace),
          sortKey: result.sortKey ?? null,
          editorScore: result.editorScore,
        })
      }
    }

    if (rows.length < batchSize) break
  }

  if (collectMatches) matches.sort(compareFeedOrder)

  return {
    poolTotal,
    scanned,
    matchCount,
    rejectCount,
    matches,
    rejects,
    truncated: scanned >= scanLimit && scanned < poolTotal,
  }
}
