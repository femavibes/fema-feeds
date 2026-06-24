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
