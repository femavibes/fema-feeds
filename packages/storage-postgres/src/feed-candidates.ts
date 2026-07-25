import type {
  FeedCandidateMatchVia,
  FeedRankConfig,
  SubstitutionDirection,
} from '@cfb/core-types'
import {
  isChronologicalRank,
  preferMatchVia,
  resolveChronologicalOrder,
} from '@cfb/core-types'
import type pg from 'pg'

export interface FeedCandidateSortOptions {
  /** Chronological feeds only — oldest indexed posts first. */
  oldestFirst?: boolean
}

export function feedCandidateSortOptions(rank?: FeedRankConfig): FeedCandidateSortOptions {
  return {
    oldestFirst: isChronologicalRank(rank) && resolveChronologicalOrder(rank) === 'oldest',
  }
}

function orderClause(options?: FeedCandidateSortOptions): string {
  if (options?.oldestFirst) {
    return 'ORDER BY sort_key ASC, post_indexed_at ASC NULLS LAST'
  }
  return 'ORDER BY sort_key DESC, post_indexed_at DESC NULLS LAST'
}

function cursorPredicate(options?: FeedCandidateSortOptions): string | null {
  if (options?.oldestFirst) {
    return ' AND (sort_key > $2 OR (sort_key = $2 AND post_indexed_at > $3))'
  }
  return null
}

export interface FeedCandidateInput {
  feedId: string
  postUri: string
  score: number
  sortKey: number
  expiresAt?: Date | null
  /** Post indexed_at — recency tiebreaker for equal sort keys. */
  postIndexedAt?: Date | null
  /** Ingress that matched this candidate (pool, scout, substitute, …). */
  matchedVia?: FeedCandidateMatchVia
  /** Set when matchedVia is substitute — granular stats breakdown. */
  substituteDirection?: SubstitutionDirection
}

export interface FeedCandidateMatchViaCounts {
  pool: number
  scout: number
  substitute: number
  feed: number
  project_pool: number
  static_uri: number
  subscribed: number
  /** Rows with null matched_via (legacy / not yet attributed). */
  unknown: number
}

const EMPTY_MATCH_VIA_COUNTS: FeedCandidateMatchViaCounts = {
  pool: 0,
  scout: 0,
  substitute: 0,
  feed: 0,
  project_pool: 0,
  static_uri: 0,
  subscribed: 0,
  unknown: 0,
}

export interface SkeletonPost {
  post: string
}

export async function upsertFeedCandidate(
  pool: pg.Pool,
  input: FeedCandidateInput,
): Promise<void> {
  await pool.query(
    `INSERT INTO feed_candidates (
       feed_id, post_uri, score, sort_key, expires_at, post_indexed_at,
       matched_via, substitute_direction, last_eval_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (feed_id, post_uri) DO UPDATE SET
       score = EXCLUDED.score,
       sort_key = EXCLUDED.sort_key,
       expires_at = COALESCE(EXCLUDED.expires_at, feed_candidates.expires_at),
       post_indexed_at = COALESCE(EXCLUDED.post_indexed_at, feed_candidates.post_indexed_at),
       matched_via = COALESCE(EXCLUDED.matched_via, feed_candidates.matched_via),
       substitute_direction = COALESCE(EXCLUDED.substitute_direction, feed_candidates.substitute_direction),
       last_eval_at = NOW()`,
    [
      input.feedId,
      input.postUri,
      input.score,
      input.sortKey,
      input.expiresAt ?? null,
      input.postIndexedAt ?? null,
      input.matchedVia ?? null,
      input.substituteDirection ?? null,
    ],
  )
}

/** Candidate counts grouped by ingress source — for future feed stats UI. */
export async function countFeedCandidatesByMatchVia(
  pool: pg.Pool,
  feedId: string,
): Promise<FeedCandidateMatchViaCounts> {
  const res = await pool.query<{ matched_via: string | null; count: string }>(
    `SELECT matched_via, count(*)::text AS count
     FROM feed_candidates
     WHERE feed_id = $1
     GROUP BY matched_via`,
    [feedId],
  )
  const counts = { ...EMPTY_MATCH_VIA_COUNTS }
  for (const row of res.rows) {
    const n = Number(row.count)
    if (!row.matched_via) {
      counts.unknown += n
      continue
    }
    const key = row.matched_via as keyof FeedCandidateMatchViaCounts
    if (key in counts && key !== 'unknown') {
      counts[key] += n
    } else {
      counts.unknown += n
    }
  }
  return counts
}

/** Substitute candidates broken down by promotion direction. */
export async function countSubstituteCandidatesByDirection(
  pool: pg.Pool,
  feedId: string,
): Promise<Partial<Record<SubstitutionDirection, number>>> {
  const res = await pool.query<{ substitute_direction: string; count: string }>(
    `SELECT substitute_direction, count(*)::text AS count
     FROM feed_candidates
     WHERE feed_id = $1 AND matched_via = 'substitute' AND substitute_direction IS NOT NULL
     GROUP BY substitute_direction`,
    [feedId],
  )
  const out: Partial<Record<SubstitutionDirection, number>> = {}
  for (const row of res.rows) {
    out[row.substitute_direction as SubstitutionDirection] = Number(row.count)
  }
  return out
}

/** Resolve which matched_via to persist when re-upserting the same post. */
export function resolveCandidateMatchVia(
  current: FeedCandidateMatchVia | null | undefined,
  incoming: FeedCandidateMatchVia,
): FeedCandidateMatchVia {
  return preferMatchVia(current, incoming)
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

/** Paginate post URIs in feed_candidates for lightweight rescore jobs. */
export async function listFeedCandidatePostUris(
  pool: pg.Pool,
  feedId: string,
  limit: number,
  afterUri?: string,
): Promise<string[]> {
  const params: unknown[] = [feedId, limit]
  const cursorSql = afterUri ? ' AND post_uri > $3' : ''
  if (afterUri) params.push(afterUri)
  const res = await pool.query<{ post_uri: string }>(
    `SELECT post_uri FROM feed_candidates
     WHERE feed_id = $1${cursorSql}
     ORDER BY post_uri ASC
     LIMIT $2`,
    params,
  )
  return res.rows.map((r) => r.post_uri)
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
  sortOptions?: FeedCandidateSortOptions,
): Promise<FeedCandidateRow[]> {
  const res = await pool.query<{ post_uri: string; sort_key: string; post_indexed_at: Date | null }>(
    `SELECT post_uri, sort_key, post_indexed_at FROM feed_candidates
     WHERE feed_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
     ${orderClause(sortOptions)}
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
  sortOptions?: FeedCandidateSortOptions,
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
      const oldest = cursorPredicate(sortOptions)
      if (oldest) {
        sql += oldest
      } else {
        sql += ` AND (sort_key < $2 OR (sort_key = $2 AND (post_indexed_at IS NULL OR post_indexed_at < $3)))`
      }
    } else {
      params.push(Number(cursor))
      sql += ` AND sort_key < $${params.length}`
    }
  }
  params.push(limit + 1)
  sql += ` ${orderClause(sortOptions)} LIMIT $${params.length}`

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
  sortOptions?: FeedCandidateSortOptions,
): Promise<FeedCandidateWindowRow[]> {
  const res = await pool.query<{ post_uri: string; sort_key: string }>(
    `SELECT post_uri, sort_key FROM feed_candidates
     WHERE feed_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
     ${orderClause(sortOptions)}
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

/** Delete candidates past their expiry (legacy rows from removed maxAgeHours tuning). */
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
