import type pg from 'pg'

export interface FeedCandidateInput {
  feedId: string
  postUri: string
  score: number
  sortKey: number
  expiresAt?: Date | null
  /** Post indexed_at — recency tiebreaker for equal sort keys. */
  postIndexedAt?: Date | null
}

export interface SkeletonPost {
  post: string
}

export async function upsertFeedCandidate(
  pool: pg.Pool,
  input: FeedCandidateInput,
): Promise<void> {
  await pool.query(
    `INSERT INTO feed_candidates (feed_id, post_uri, score, sort_key, expires_at, post_indexed_at, last_eval_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (feed_id, post_uri) DO UPDATE SET
       score = EXCLUDED.score,
       sort_key = EXCLUDED.sort_key,
       expires_at = COALESCE(EXCLUDED.expires_at, feed_candidates.expires_at),
       post_indexed_at = COALESCE(EXCLUDED.post_indexed_at, feed_candidates.post_indexed_at),
       last_eval_at = NOW()`,
    [input.feedId, input.postUri, input.score, input.sortKey, input.expiresAt ?? null, input.postIndexedAt ?? null],
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

export interface FeedCandidateRow {
  postUri: string
  sortKey: number
  postIndexedAt: string | null
}

/** Top-N indexed candidates — same ordering as getFeedSkeleton. */
export async function listFeedCandidateRows(
  pool: pg.Pool,
  feedId: string,
  limit: number,
): Promise<FeedCandidateRow[]> {
  const res = await pool.query<{ post_uri: string; sort_key: string; post_indexed_at: Date | null }>(
    `SELECT post_uri, sort_key, post_indexed_at FROM feed_candidates
     WHERE feed_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY sort_key DESC, post_indexed_at DESC NULLS LAST
     LIMIT $2`,
    [feedId, limit],
  )
  return res.rows.map((r) => ({
    postUri: r.post_uri,
    sortKey: Number(r.sort_key),
    postIndexedAt: r.post_indexed_at ? new Date(r.post_indexed_at).toISOString() : null,
  }))
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

/**
 * Cursor = "sortKey::postIndexedAtEpochMs" from the last item (descending pagination).
 * Legacy single-number cursors (pre-tiebreaker) are still accepted.
 */
export async function getFeedSkeleton(
  pool: pg.Pool,
  feedId: string,
  limit: number,
  cursor?: string,
): Promise<{ feed: SkeletonPost[]; cursor?: string }> {
  const params: unknown[] = [feedId]
  let sql = `SELECT post_uri, sort_key, post_indexed_at FROM feed_candidates
     WHERE feed_id = $1 AND (expires_at IS NULL OR expires_at > NOW())`
  if (cursor) {
    const sep = cursor.indexOf('::')
    if (sep >= 0) {
      const sortKey = Number(cursor.slice(0, sep))
      const indexedMs = Number(cursor.slice(sep + 2))
      params.push(sortKey, new Date(indexedMs))
      sql += ` AND (sort_key < $2 OR (sort_key = $2 AND (post_indexed_at IS NULL OR post_indexed_at < $3)))`
    } else {
      params.push(Number(cursor))
      sql += ` AND sort_key < $${params.length}`
    }
  }
  params.push(limit + 1)
  sql += ` ORDER BY sort_key DESC, post_indexed_at DESC NULLS LAST LIMIT $${params.length}`

  const res = await pool.query<{ post_uri: string; sort_key: string; post_indexed_at: Date | null }>(sql, params)
  const hasMore = res.rows.length > limit
  const rows = hasMore ? res.rows.slice(0, limit) : res.rows
  const feed = rows.map((r) => ({ post: r.post_uri }))
  const last = rows[rows.length - 1]
  const nextCursor = hasMore && last
    ? `${last.sort_key}::${last.post_indexed_at ? new Date(last.post_indexed_at).getTime() : 0}`
    : undefined
  return { feed, cursor: nextCursor }
}

export interface FeedCandidateWindowRow {
  post: string
  sortKey: number
}

/**
 * Top-N candidates by sort order — the personalization window.
 * Returns real sort keys so personalization can use them as base_score.
 */
export async function getFeedCandidateWindow(
  pool: pg.Pool,
  feedId: string,
  depth: number,
): Promise<FeedCandidateWindowRow[]> {
  const res = await pool.query<{ post_uri: string; sort_key: string }>(
    `SELECT post_uri, sort_key FROM feed_candidates
     WHERE feed_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY sort_key DESC, post_indexed_at DESC NULLS LAST
     LIMIT $2`,
    [feedId, depth],
  )
  return res.rows.map((r) => ({ post: r.post_uri, sortKey: Number(r.sort_key) }))
}

/**
 * Posts due for a time re-eval, bucketed by post age: younger posts refresh
 * more often because time-decay changes their score fastest.
 */
export async function getAgeSweepPostUris(
  pool: pg.Pool,
  feedIds: string[],
  limit: number,
): Promise<string[]> {
  if (feedIds.length === 0) return []
  const res = await pool.query<{ post_uri: string }>(
    `SELECT DISTINCT fc.post_uri
     FROM feed_candidates fc
     JOIN ingested_posts ip ON ip.post_uri = fc.post_uri
     WHERE fc.feed_id = ANY($1::text[])
       AND (fc.expires_at IS NULL OR fc.expires_at > NOW())
       AND fc.last_eval_at < NOW() - (CASE
         WHEN ip.indexed_at > NOW() - INTERVAL '1 hour'   THEN INTERVAL '2 minutes'
         WHEN ip.indexed_at > NOW() - INTERVAL '6 hours'  THEN INTERVAL '15 minutes'
         WHEN ip.indexed_at > NOW() - INTERVAL '24 hours' THEN INTERVAL '1 hour'
         WHEN ip.indexed_at > NOW() - INTERVAL '72 hours' THEN INTERVAL '6 hours'
         ELSE INTERVAL '24 hours'
       END)
     ORDER BY fc.post_uri
     LIMIT $2`,
    [feedIds, limit],
  )
  return res.rows.map((r) => r.post_uri)
}

/** Delete candidates past their expiry (maxAgeHours from sort tuning). */
export async function purgeExpiredFeedCandidates(pool: pg.Pool): Promise<number> {
  const res = await pool.query(
    `DELETE FROM feed_candidates WHERE expires_at IS NOT NULL AND expires_at < NOW()`,
  )
  return res.rowCount ?? 0
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

/** Bump audience engagement on a candidate when a feed reader interacts with a post. */
export async function bumpAudienceEngagement(
  pool: pg.Pool,
  feedId: string,
  postUri: string,
  counter: 'like' | 'repost',
  delta = 1,
): Promise<boolean> {
  const col = counter === 'like' ? 'audience_likes' : 'audience_reposts'
  const res = await pool.query(
    `UPDATE feed_candidates SET ${col} = GREATEST(0, ${col} + $3) WHERE feed_id = $1 AND post_uri = $2`,
    [feedId, postUri, delta],
  )
  return (res.rowCount ?? 0) > 0
}
