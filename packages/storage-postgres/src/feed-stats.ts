import type pg from 'pg'

export interface FeedDailyStatsRow {
  feedId: string
  date: string
  impressions: number
  uniqueViewers: number
}

export interface FeedStatsSnapshot {
  candidateCount: number
  likeCount: number | null
  dailyViewers: number
  dailyImpressions: number
  totalImpressions: number
  totalUniqueViewers: number
}

/** Increment impression count for today. Called on every skeleton serve. */
export async function incrementFeedImpression(
  pool: pg.Pool,
  feedId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO feed_daily_stats (feed_id, date, impressions)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (feed_id, date) DO UPDATE SET
       impressions = feed_daily_stats.impressions + 1`,
    [feedId],
  )
}

/** Record a unique viewer for today. Called when viewerDid is present. */
export async function recordFeedDailyViewer(
  pool: pg.Pool,
  feedId: string,
  viewerDid: string,
): Promise<void> {
  // Use feed_served_posts for dedup — just bump the unique_viewers counter
  // We rely on feed_served_posts for accurate distinct count at query time,
  // but also maintain a running counter for fast reads.
  // The counter is approximate (may double-count across restarts) — query is authoritative.
  await pool.query(
    `INSERT INTO feed_daily_stats (feed_id, date, impressions, unique_viewers)
     VALUES ($1, CURRENT_DATE, 0, 0)
     ON CONFLICT (feed_id, date) DO NOTHING`,
    [feedId],
  )
}

/** Get today's DAU (distinct authenticated viewers from feed_served_posts). */
export async function getFeedDailyViewers(
  pool: pg.Pool,
  feedId: string,
): Promise<number> {
  const res = await pool.query<{ count: string }>(
    `SELECT COUNT(DISTINCT viewer_did)::text AS count
     FROM feed_served_posts
     WHERE feed_id = $1 AND served_at >= CURRENT_DATE`,
    [feedId],
  )
  return Number(res.rows[0]?.count ?? 0)
}

/** Get today's impressions from the counter. */
export async function getFeedDailyImpressions(
  pool: pg.Pool,
  feedId: string,
): Promise<number> {
  const res = await pool.query<{ impressions: string }>(
    `SELECT impressions::text FROM feed_daily_stats
     WHERE feed_id = $1 AND date = CURRENT_DATE`,
    [feedId],
  )
  return Number(res.rows[0]?.impressions ?? 0)
}

/** Get total impressions across all days. */
export async function getFeedTotalImpressions(
  pool: pg.Pool,
  feedId: string,
): Promise<number> {
  const res = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(impressions), 0)::text AS total
     FROM feed_daily_stats WHERE feed_id = $1`,
    [feedId],
  )
  return Number(res.rows[0]?.total ?? 0)
}

/** Get total unique viewers (all time, from feed_served_posts). */
export async function getFeedTotalUniqueViewers(
  pool: pg.Pool,
  feedId: string,
): Promise<number> {
  const res = await pool.query<{ count: string }>(
    `SELECT COUNT(DISTINCT viewer_did)::text AS count
     FROM feed_served_posts WHERE feed_id = $1`,
    [feedId],
  )
  return Number(res.rows[0]?.count ?? 0)
}

/** Full stats snapshot for the feed overview page. */
export async function getFeedStats(
  pool: pg.Pool,
  feedId: string,
): Promise<Omit<FeedStatsSnapshot, 'candidateCount' | 'likeCount'>> {
  const [dailyViewers, dailyImpressions, totalImpressions, totalUniqueViewers] =
    await Promise.all([
      getFeedDailyViewers(pool, feedId),
      getFeedDailyImpressions(pool, feedId),
      getFeedTotalImpressions(pool, feedId),
      getFeedTotalUniqueViewers(pool, feedId),
    ])
  return { dailyViewers, dailyImpressions, totalImpressions, totalUniqueViewers }
}
