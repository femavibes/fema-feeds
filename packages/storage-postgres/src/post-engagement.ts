import type { EngagementCounter, PostEngagement } from '@cfb/core-types'
import type pg from 'pg'

const COLUMN: Record<EngagementCounter, string> = {
  like: 'like_count',
  repost: 'repost_count',
  quote: 'quote_count',
  reply: 'reply_count',
  bookmark: 'bookmark_count',
}

export async function isPostInPool(pool: pg.Pool, postUri: string): Promise<boolean> {
  const res = await pool.query(`SELECT 1 FROM ingested_posts WHERE post_uri = $1`, [postUri])
  return res.rowCount !== null && res.rowCount > 0
}

/** Ensure row exists (zeros) when a post enters the pool. */
export async function ensurePostEngagement(pool: pg.Pool, postUri: string): Promise<void> {
  await pool.query(
    `INSERT INTO post_engagement (post_uri) VALUES ($1)
     ON CONFLICT (post_uri) DO NOTHING`,
    [postUri],
  )
}

export async function adjustEngagement(
  pool: pg.Pool,
  postUri: string,
  counter: EngagementCounter,
  delta: number,
): Promise<boolean> {
  const col = COLUMN[counter]
  const res = await pool.query(
    `UPDATE post_engagement
     SET ${col} = GREATEST(0, ${col} + $2), updated_at = NOW()
     WHERE post_uri = $1`,
    [postUri, delta],
  )
  return (res.rowCount ?? 0) > 0
}

/**
 * Increment engagement only if post is in pool.
 * Creates engagement row on first bump.
 */
export async function bumpEngagementIfInPool(
  pool: pg.Pool,
  postUri: string,
  counter: EngagementCounter,
  delta = 1,
): Promise<boolean> {
  const inPool = await isPostInPool(pool, postUri)
  if (!inPool) return false
  await ensurePostEngagement(pool, postUri)
  return adjustEngagement(pool, postUri, counter, delta)
}

export async function getPostEngagement(
  pool: pg.Pool,
  postUri: string,
): Promise<PostEngagement | null> {
  const res = await pool.query(
    `SELECT post_uri, like_count, repost_count, quote_count, reply_count, bookmark_count, updated_at
     FROM post_engagement WHERE post_uri = $1`,
    [postUri],
  )
  const r = res.rows[0]
  if (!r) return null
  return {
    postUri: r.post_uri as string,
    likeCount: Number(r.like_count),
    repostCount: Number(r.repost_count),
    quoteCount: Number(r.quote_count),
    replyCount: Number(r.reply_count),
    bookmarkCount: Number(r.bookmark_count),
    updatedAt: new Date(r.updated_at as string).toISOString(),
  }
}

/** Batch-fetch engagement for multiple post URIs. */
export async function getPostEngagementBatch(
  pool: pg.Pool,
  postUris: string[],
): Promise<Map<string, PostEngagement>> {
  if (postUris.length === 0) return new Map()
  const res = await pool.query(
    `SELECT post_uri, like_count, repost_count, quote_count, reply_count, bookmark_count, updated_at
     FROM post_engagement WHERE post_uri = ANY($1::text[])`,
    [postUris],
  )
  const map = new Map<string, PostEngagement>()
  for (const r of res.rows) {
    map.set(r.post_uri as string, {
      postUri: r.post_uri as string,
      likeCount: Number(r.like_count),
      repostCount: Number(r.repost_count),
      quoteCount: Number(r.quote_count),
      replyCount: Number(r.reply_count),
      bookmarkCount: Number(r.bookmark_count),
      updatedAt: new Date(r.updated_at as string).toISOString(),
    })
  }
  return map
}

/** Set absolute engagement counts (used for backfill from Bluesky API). */
export async function setPostEngagement(
  pool: pg.Pool,
  postUri: string,
  counts: { likeCount: number; repostCount: number; replyCount: number; quoteCount: number },
): Promise<void> {
  await pool.query(
    `UPDATE post_engagement
     SET like_count = GREATEST(like_count, $2),
         repost_count = GREATEST(repost_count, $3),
         reply_count = GREATEST(reply_count, $4),
         quote_count = GREATEST(quote_count, $5),
         updated_at = NOW()
     WHERE post_uri = $1`,
    [postUri, counts.likeCount, counts.repostCount, counts.replyCount, counts.quoteCount],
  )
}

/** Fetch recent pool posts needing engagement refresh. */
export async function getPoolPostsForEngagementRefresh(
  pool: pg.Pool,
  limit: number,
  maxAgeHours: number,
): Promise<string[]> {
  const res = await pool.query<{ post_uri: string }>(
    `SELECT pe.post_uri FROM post_engagement pe
     JOIN ingested_posts ip ON ip.post_uri = pe.post_uri
     WHERE ip.indexed_at > NOW() - INTERVAL '1 hour' * $2
     ORDER BY pe.updated_at ASC
     LIMIT $1`,
    [limit, maxAgeHours],
  )
  return res.rows.map((r) => r.post_uri)
}
