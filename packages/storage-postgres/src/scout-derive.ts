import type pg from 'pg'
import type { ScoutSource } from '@cfb/core-types'

/**
 * Derive scout DIDs from pool data.
 * - top_pool_authors: authors with the most posts in the project pool
 * - top_engagers: accounts that most frequently like/repost pool posts (from engagement_events if tracked)
 */
export async function deriveScoutDids(
  pool: pg.Pool,
  projectId: string,
  source: ScoutSource,
  count: number,
): Promise<string[]> {
  if (source === 'top_pool_authors') {
    const res = await pool.query<{ author_did: string }>(
      `SELECT p.author_did, COUNT(*) AS cnt
       FROM ingested_posts p
       INNER JOIN ingested_post_projects ip ON ip.post_uri = p.post_uri
       WHERE ip.project_id = $1
       GROUP BY p.author_did
       ORDER BY cnt DESC
       LIMIT $2`,
      [projectId, count],
    )
    return res.rows.map((r) => r.author_did)
  }

  // top_engagers: authors who liked/reposted pool posts most often
  // Falls back to top_pool_authors if engagement tracking isn't available
  try {
    const res = await pool.query<{ actor_did: string }>(
      `SELECT ee.actor_did, COUNT(*) AS cnt
       FROM engagement_events ee
       INNER JOIN ingested_post_projects ip ON ip.post_uri = ee.post_uri
       WHERE ip.project_id = $1
       GROUP BY ee.actor_did
       ORDER BY cnt DESC
       LIMIT $2`,
      [projectId, count],
    )
    if (res.rows.length > 0) {
      return res.rows.map((r) => r.actor_did)
    }
  } catch {
    // engagement_events table may not exist — fall back
  }

  return deriveScoutDids(pool, projectId, 'top_pool_authors', count)
}
