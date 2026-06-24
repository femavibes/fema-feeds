import type { FeedConfig } from '@cfb/core-types'
import type pg from 'pg'
import {
  getProjectIdsForPost,
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

export async function reevalPoolForFeeds(
  pool: pg.Pool,
  feeds: FeedConfig[],
  options: { projectId?: string; batchSize?: number } = {},
): Promise<ReevalResult> {
  const batchSize = options.batchSize ?? 200
  let offset = 0
  let posts = 0
  let evaluated = 0
  let matched = 0
  let written = 0

  for (;;) {
    const rows = options.projectId
      ? await listPostsForProject(pool, options.projectId, batchSize, offset)
      : await listAllPoolPosts(pool, batchSize, offset)
    if (rows.length === 0) break

    for (const row of rows) {
      posts++
      const post = normalizedPostFromRow(row)
      const projectIds = options.projectId
        ? [options.projectId]
        : await getProjectIdsForPost(pool, post.uri)
      const result = await processPostForFeeds(pool, post, projectIds, feeds)
      evaluated += result.evaluated
      matched += result.matched
      written += result.written
    }

    if (rows.length < batchSize) break
    offset += batchSize
  }

  return { posts, evaluated, matched, written }
}
