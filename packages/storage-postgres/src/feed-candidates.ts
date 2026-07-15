import type pg from 'pg'

export interface FeedCandidateInput {
  feedId: string
  postUri: string
  score: number
  sortKey: number
  expiresAt?: Date | null
}

export interface SkeletonPost {
  post: string
}

export async function upsertFeedCandidate(
  pool: pg.Pool,
  input: FeedCandidateInput,
): Promise<void> {
  await pool.query(
    `INSERT INTO feed_candidates (feed_id, post_uri, score, sort_key, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (feed_id, post_uri) DO UPDATE SET
       score = EXCLUDED.score,
       sort_key = EXCLUDED.sort_key,
       expires_at = COALESCE(EXCLUDED.expires_at, feed_candidates.expires_at)`,
    [input.feedId, input.postUri, input.score, input.sortKey, input.expiresAt ?? null],
  )
}

export async function deleteFeedCandidate(
  pool: pg.Pool,
  feedId: string,
  postUri: string,
): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM feed_candidates WHERE feed_id = $1 AND post_uri = $2`,
    [feedId, postUri],
  )
  return (res.rowCount ?? 0) > 0
}

export async function deleteFeedCandidatesForFeed(
  pool: pg.Pool,
  feedId: string,
): Promise<number> {
  const res = await pool.query(`DELETE FROM feed_candidates WHERE feed_id = $1`, [feedId])
  return res.rowCount ?? 0
}

export async function deleteFeedCandidatesForFeeds(
  pool: pg.Pool,
  feedIds: string[],
): Promise<number> {
  if (feedIds.length === 0) return 0
  const res = await pool.query(`DELETE FROM feed_candidates WHERE feed_id = ANY($1::text[])`, [
    feedIds,
  ])
  return res.rowCount ?? 0
}

export async function countFeedCandidates(pool: pg.Pool, feedId: string): Promise<number> {
  const res = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM feed_candidates WHERE feed_id = $1`,
    [feedId],
  )
  return Number(res.rows[0]?.count ?? 0)
}

/** Get post URIs from active feed candidates that have stale engagement data. */
export async function getStaleFeedCandidateUris(
  pool: pg.Pool,
  feedIds: string[],
  staleMinutes: number,
  limit: number,
): Promise<string[]> {
  if (feedIds.length === 0) return []
  const res = await pool.query<{ post_uri: string }>(
    `SELECT DISTINCT fc.post_uri
     FROM feed_candidates fc
     LEFT JOIN post_engagement pe ON pe.post_uri = fc.post_uri
     WHERE fc.feed_id = ANY($1::text[])
       AND (pe.updated_at IS NULL OR pe.updated_at < NOW() - INTERVAL '1 minute' * $2)
     ORDER BY fc.post_uri
     LIMIT $3`,
    [feedIds, staleMinutes, limit],
  )
  return res.rows.map((r) => r.post_uri)
}

/** Count stale feed candidate posts (for progress estimation). */
export async function countStaleFeedCandidates(
  pool: pg.Pool,
  feedIds: string[],
  staleMinutes: number,
): Promise<number> {
  if (feedIds.length === 0) return 0
  const res = await pool.query<{ n: string }>(
    `SELECT COUNT(DISTINCT fc.post_uri)::text AS n
     FROM feed_candidates fc
     LEFT JOIN post_engagement pe ON pe.post_uri = fc.post_uri
     WHERE fc.feed_id = ANY($1::text[])
       AND (pe.updated_at IS NULL OR pe.updated_at < NOW() - INTERVAL '1 minute' * $2)`,
    [feedIds, staleMinutes],
  )
  return Number(res.rows[0]?.n ?? 0)
}

/** Cursor = sort_key from last item (descending pagination). */
export async function getFeedSkeleton(
  pool: pg.Pool,
  feedId: string,
  limit: number,
  cursor?: string,
): Promise<{ feed: SkeletonPost[]; cursor?: string }> {
  const params: unknown[] = [feedId]
  let sql = `SELECT post_uri, sort_key FROM feed_candidates WHERE feed_id = $1`
  if (cursor) {
    params.push(Number(cursor))
    sql += ` AND sort_key < $${params.length}`
  }
  params.push(limit + 1)
  sql += ` ORDER BY sort_key DESC LIMIT $${params.length}`

  const res = await pool.query<{ post_uri: string; sort_key: string }>(sql, params)
  const hasMore = res.rows.length > limit
  const rows = hasMore ? res.rows.slice(0, limit) : res.rows
  const feed = rows.map((r) => ({ post: r.post_uri }))
  const last = rows[rows.length - 1]
  const nextCursor = hasMore && last ? String(last.sort_key) : undefined
  return { feed, cursor: nextCursor }
}

/** Remove candidates for a feed whose posts are not in the given project's pool. */
export async function purgeOutOfScopeCandidates(
  pool: pg.Pool,
  feedId: string,
  projectId: string,
): Promise<number> {
  const res = await pool.query(
    `DELETE FROM feed_candidates
     WHERE feed_id = $1
       AND post_uri NOT IN (
         SELECT post_uri FROM ingested_post_projects WHERE project_id = $2
       )`,
    [feedId, projectId],
  )
  return res.rowCount ?? 0
}
