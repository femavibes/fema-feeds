import type { FeedConfig, NormalizedPost } from '@cfb/core-types'
import type pg from 'pg'
import {
  getProjectIdsForPostsBatch,
  listAllPoolPosts,
  listPostsForProject,
  normalizedPostFromRow,
  persistL1Matches,
  purgeOutOfScopeCandidates,
} from '@cfb/storage-postgres'
import { processPostForFeeds } from './process-post.js'
import { collectSubstituteNodes, processSubstitution, resolveTargetPost } from './substitution.js'

/** Fetch a post from Bluesky public API for substitution target resolution. */
async function fetchPostFromApi(uri: string): Promise<NormalizedPost | null> {
  try {
    const res = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0&parentHeight=0`,
    )
    if (!res.ok) return null
    const data = await res.json() as { thread?: { post?: { uri: string; cid: string; author?: { did: string }; record?: Record<string, unknown>; indexedAt?: string } } }
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
  }
}

export interface ReevalResult {
  posts: number
  evaluated: number
  matched: number
  written: number
}

export interface ReevalProgress {
  active: boolean
  feedId: string
  processed: number
  total: number
  matched: number
  startedAt: string
  finishedAt: string | null
  result: ReevalResult | null
}

const activeRebuilds = new Map<string, ReevalProgress>()

export function getRebuildStatus(feedId: string): ReevalProgress | null {
  return activeRebuilds.get(feedId) ?? null
}

export function clearRebuildStatus(feedId: string): void {
  activeRebuilds.delete(feedId)
}

/** Cancel a running rebuild. The loop will stop at the next batch boundary. */
export function cancelRebuild(feedId: string): boolean {
  const progress = activeRebuilds.get(feedId)
  if (!progress?.active) return false
  progress.active = false
  progress.finishedAt = new Date().toISOString()
  return true
}

/** Count posts that will be scanned (for progress denominator). */
async function countPoolForFeed(
  pool: pg.Pool,
  projectId: string | undefined,
): Promise<number> {
  const query = projectId
    ? `SELECT COUNT(*)::int AS n FROM ingested_post_projects WHERE project_id = $1`
    : `SELECT COUNT(*)::int AS n FROM ingested_posts`
  const params = projectId ? [projectId] : []
  const res = await pool.query<{ n: number }>(query, params)
  return res.rows[0]?.n ?? 0
}

/** Start a background rebuild. Returns immediately. Poll getRebuildStatus() for progress. */
export function startBackgroundReeval(
  pool: pg.Pool,
  feeds: FeedConfig[],
  options: { projectId?: string; feedId: string },
): void {
  const feedId = options.feedId
  // If already running for this feed, skip
  if (activeRebuilds.get(feedId)?.active) return

  const progress: ReevalProgress = {
    active: true,
    feedId,
    processed: 0,
    total: 0,
    matched: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    result: null,
  }
  activeRebuilds.set(feedId, progress)

  void runReeval(pool, feeds, options, progress).catch((err) => {
    console.error(`[reeval] background rebuild failed for ${feedId}:`, err)
    progress.active = false
    progress.finishedAt = new Date().toISOString()
  })
}

async function runReeval(
  pool: pg.Pool,
  feeds: FeedConfig[],
  options: { projectId?: string; feedId: string },
  progress: ReevalProgress,
): Promise<void> {
  const batchSize = 500
  let cursor: string | undefined
  let posts = 0
  let evaluated = 0
  let matched = 0
  let written = 0

  // Check if any feed has substitute nodes
  const hasSubNodes = feeds.some((f) => collectSubstituteNodes(f).length > 0)

  // Get total count for progress
  progress.total = await countPoolForFeed(pool, options.projectId)

  // Purge candidates that are no longer in the feed's pool scope
  if (options.projectId) {
    await purgeOutOfScopeCandidates(pool, options.feedId, options.projectId)
  }

  for (;;) {
    // Check if cancelled between batches
    if (!progress.active) return

    const rows = options.projectId
      ? await listPostsForProject(pool, options.projectId, batchSize, cursor)
      : await listAllPoolPosts(pool, batchSize, cursor)
    if (rows.length === 0) break

    // Batch-fetch project IDs
    const projectIdsMap = !options.projectId
      ? await getProjectIdsForPostsBatch(pool, rows.map((r) => r.postUri))
      : null

    for (const row of rows) {
      posts++
      const post = normalizedPostFromRow(row)
      const projectIds = options.projectId
        ? [options.projectId]
        : projectIdsMap?.get(post.uri) ?? []
      const result = await processPostForFeeds(pool, post, projectIds, feeds)
      evaluated += result.evaluated
      matched += result.matched
      written += result.written

      // Process substitution for existing replies
      if (hasSubNodes) {
        const sub = await processSubstitution(pool, post, projectIds, feeds)
        for (const targetUri of sub.resolvedTargets) {
          const target = await resolveTargetPost(pool, targetUri, fetchPostFromApi)
          if (!target) continue
          await persistL1Matches(pool, {
            post: target,
            matches: projectIds.map((pid) => ({ projectId: pid, matched: true, matchedVia: 'jetstream' as const, trace: [] })),
          }).catch(() => {})
          const tr = await processPostForFeeds(pool, target, projectIds, feeds, { skipDiscovery: true })
          evaluated += tr.evaluated
          matched += tr.matched
          written += tr.written
        }
      }
    }

    // Update progress
    progress.processed = posts
    progress.matched = matched

    if (rows.length < batchSize) break
    cursor = rows[rows.length - 1]!.indexedAt
  }

  progress.active = false
  progress.processed = posts
  progress.matched = matched
  progress.finishedAt = new Date().toISOString()
  progress.result = { posts, evaluated, matched, written }
}

/** Synchronous full reeval (legacy — for cases where caller awaits). */
export async function reevalPoolForFeeds(
  pool: pg.Pool,
  feeds: FeedConfig[],
  options: { projectId?: string; batchSize?: number } = {},
): Promise<ReevalResult> {
  const batchSize = options.batchSize ?? 500
  let cursor: string | undefined
  let posts = 0
  let evaluated = 0
  let matched = 0
  let written = 0

  for (;;) {
    const rows = options.projectId
      ? await listPostsForProject(pool, options.projectId, batchSize, cursor)
      : await listAllPoolPosts(pool, batchSize, cursor)
    if (rows.length === 0) break

    const projectIdsMap = !options.projectId
      ? await getProjectIdsForPostsBatch(pool, rows.map((r) => r.postUri))
      : null

    for (const row of rows) {
      posts++
      const post = normalizedPostFromRow(row)
      const projectIds = options.projectId
        ? [options.projectId]
        : projectIdsMap?.get(post.uri) ?? []
      const result = await processPostForFeeds(pool, post, projectIds, feeds)
      evaluated += result.evaluated
      matched += result.matched
      written += result.written
    }

    if (rows.length < batchSize) break
    cursor = rows[rows.length - 1]!.indexedAt
  }

  return { posts, evaluated, matched, written }
}
