import type { FeedConfig } from '@cfb/core-types'
import type pg from 'pg'

export async function getFeedDraft(
  pool: pg.Pool,
  feedId: string,
): Promise<FeedConfig | null> {
  const res = await pool.query<{ draft_json: FeedConfig }>(
    `SELECT draft_json FROM feed_drafts WHERE feed_id = $1`,
    [feedId],
  )
  return res.rows[0]?.draft_json ?? null
}

export async function saveFeedDraft(
  pool: pg.Pool,
  feedId: string,
  ownerDid: string,
  draft: FeedConfig,
): Promise<void> {
  await pool.query(
    `INSERT INTO feed_drafts (feed_id, owner_did, draft_json, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (feed_id) DO UPDATE SET
       owner_did = EXCLUDED.owner_did,
       draft_json = EXCLUDED.draft_json,
       updated_at = NOW()`,
    [feedId, ownerDid, JSON.stringify(draft)],
  )
}

export async function deleteFeedDraft(pool: pg.Pool, feedId: string): Promise<void> {
  await pool.query(`DELETE FROM feed_drafts WHERE feed_id = $1`, [feedId])
}
