import type { FeedConfig } from '@cfb/core-types'
import type pg from 'pg'
import { getIngestedPost, getProjectIdsForPost, normalizedPostFromRow } from '@cfb/storage-postgres'
import { processPostForFeeds, type ProcessPostResult } from './process-post.js'

/** Re-run L2 for one pooled post (e.g. after engagement changes). */
export async function reevalPostInPool(
  pool: pg.Pool,
  postUri: string,
  feeds: FeedConfig[],
): Promise<ProcessPostResult | null> {
  const row = await getIngestedPost(pool, postUri)
  if (!row) return null
  const post = normalizedPostFromRow(row)
  const projectIds = await getProjectIdsForPost(pool, postUri)
  return processPostForFeeds(pool, post, projectIds, feeds)
}
