import type { FeedConfig } from '@cfb/core-types'
import type pg from 'pg'
import {
  getProjectIdsForPostsBatch,
  listAllPoolPosts,
  listPostsForProject,
  normalizedPostFromRow,
} from '@cfb/storage-postgres'
import { processPostForFeeds } from './process-post.js'

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

  // Get total count for progress
  progress.total = await countPoolForFeed(pool, options.projectId)

  for (;;) {
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
