import type pg from 'pg'

export interface IngestStats {
  poolSize: number
  byProject: Record<string, number>
  listCacheCount: number
  listsDueForPoll: number
}

export async function getIngestStats(pool: pg.Pool): Promise<IngestStats> {
  const [poolRes, byProjectRes, listRes, dueRes] = await Promise.all([
    pool.query<{ count: string }>('SELECT count(*)::text AS count FROM ingested_posts'),
    pool.query<{ project_id: string; count: string }>(
      `SELECT project_id, count(*)::text AS count
       FROM ingested_post_projects GROUP BY project_id ORDER BY project_id`,
    ),
    pool.query<{ count: string }>('SELECT count(*)::text AS count FROM author_list_cache'),
    pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM author_list_cache
       WHERE next_poll_at IS NOT NULL AND next_poll_at <= NOW()`,
    ),
  ])

  const byProject: Record<string, number> = {}
  for (const row of byProjectRes.rows) {
    byProject[row.project_id] = Number(row.count)
  }

  return {
    poolSize: Number(poolRes.rows[0]?.count ?? 0),
    byProject,
    listCacheCount: Number(listRes.rows[0]?.count ?? 0),
    listsDueForPoll: Number(dueRes.rows[0]?.count ?? 0),
  }
}

/** Delete ingested posts past expires_at (and cascaded project links). */
export async function pruneExpiredPosts(pool: pg.Pool): Promise<number> {
  const res = await pool.query(
    `DELETE FROM ingested_posts WHERE expires_at IS NOT NULL AND expires_at <= NOW()`,
  )
  return res.rowCount ?? 0
}
