import type pg from 'pg'

export async function ensureEngagementEventsTable(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS engagement_events (
      id          BIGSERIAL PRIMARY KEY,
      post_uri    TEXT NOT NULL,
      actor_did   TEXT NOT NULL,
      collection  TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_engagement_events_post
      ON engagement_events(post_uri);
    CREATE INDEX IF NOT EXISTS idx_engagement_events_actor
      ON engagement_events(actor_did);
  `)
}

/** Record an engagement event (only for pool posts). */
export async function insertEngagementEvent(
  pool: pg.Pool,
  postUri: string,
  actorDid: string,
  collection: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO engagement_events (post_uri, actor_did, collection) VALUES ($1, $2, $3)`,
    [postUri, actorDid, collection],
  )
}

/** Prune old engagement events. */
export async function pruneEngagementEvents(
  pool: pg.Pool,
  maxAgeHours: number,
): Promise<number> {
  const res = await pool.query(
    `DELETE FROM engagement_events WHERE created_at < NOW() - interval '1 hour' * $1`,
    [maxAgeHours],
  )
  return res.rowCount ?? 0
}
