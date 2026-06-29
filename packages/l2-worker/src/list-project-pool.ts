import type pg from 'pg'
import {
  countPostsForProject,
  listPostsForProject,
  normalizedPostFromRow,
} from '@cfb/storage-postgres'
import { buildPoolMatchSample, enrichPoolMatchAuthors, type PoolMatchSample } from './pool-match-sample.js'
import { enrichPoolMatchPreviews } from './pool-match-enrich.js'

export interface ProjectPoolResult {
  total: number
  posts: PoolMatchSample[]
  cursor: string | null
}

export async function listProjectPoolPosts(
  pool: pg.Pool,
  projectId: string,
  options: { limit?: number; cursor?: string } = {},
): Promise<ProjectPoolResult> {
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100)

  const [total, rows] = await Promise.all([
    countPostsForProject(pool, projectId),
    listPostsForProject(pool, projectId, limit, options.cursor),
  ])

  if (rows.length === 0) {
    return { total, posts: [], cursor: null }
  }

  const posts = rows.map((r) => buildPoolMatchSample(normalizedPostFromRow(r), []))
  await enrichPoolMatchPreviews(posts)
  await enrichPoolMatchAuthors(pool, posts)

  const lastPost = posts[posts.length - 1]
  const cursor = rows.length === limit ? lastPost!.indexedAt : null

  return { total, posts, cursor }
}
