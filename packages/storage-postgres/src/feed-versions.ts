import type { FeedConfig } from '@cfb/core-types'
import type pg from 'pg'

export type FeedVersionKind = 'live' | 'milestone'

export interface FeedVersionRow {
  version: number
  createdAt: string
  createdByDid: string | null
  label: string | null
  kind: FeedVersionKind
}

export async function getNextFeedVersion(pool: pg.Pool, feedId: string): Promise<number> {
  const res = await pool.query<{ max: string | null }>(
    `SELECT MAX(version)::text AS max FROM feed_versions WHERE feed_id = $1`,
    [feedId],
  )
  return Number(res.rows[0]?.max ?? 0) + 1
}

export async function saveFeedVersion(
  pool: pg.Pool,
  feedId: string,
  version: number,
  config: FeedConfig,
  createdByDid: string | null,
  options?: { label?: string | null; kind?: FeedVersionKind },
): Promise<void> {
  const kind = options?.kind ?? 'live'
  const label = options?.label?.trim() || null
  await pool.query(
    `INSERT INTO feed_versions (feed_id, version, config_json, created_by_did, label, kind)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
    [feedId, version, JSON.stringify(config), createdByDid, label, kind],
  )
}

export async function listFeedVersions(
  pool: pg.Pool,
  feedId: string,
  limit = 20,
): Promise<FeedVersionRow[]> {
  const res = await pool.query<{
    version: number
    created_at: Date
    created_by_did: string | null
    label: string | null
    kind: string
  }>(
    `SELECT version, created_at, created_by_did, label, kind
     FROM feed_versions
     WHERE feed_id = $1
     ORDER BY version DESC
     LIMIT $2`,
    [feedId, limit],
  )
  return res.rows.map((r) => ({
    version: r.version,
    createdAt: r.created_at.toISOString(),
    createdByDid: r.created_by_did,
    label: r.label,
    kind: r.kind === 'milestone' ? 'milestone' : 'live',
  }))
}

export async function getFeedVersion(
  pool: pg.Pool,
  feedId: string,
  version: number,
): Promise<FeedConfig | null> {
  const res = await pool.query<{ config_json: FeedConfig }>(
    `SELECT config_json FROM feed_versions WHERE feed_id = $1 AND version = $2`,
    [feedId, version],
  )
  return res.rows[0]?.config_json ?? null
}

export async function updateFeedVersionLabel(
  pool: pg.Pool,
  feedId: string,
  version: number,
  label: string | null,
): Promise<boolean> {
  const trimmed = label?.trim() || null
  const res = await pool.query(
    `UPDATE feed_versions SET label = $3 WHERE feed_id = $1 AND version = $2`,
    [feedId, version, trimmed],
  )
  return (res.rowCount ?? 0) > 0
}

export async function deleteFeedVersions(pool: pg.Pool, feedId: string): Promise<void> {
  await pool.query(`DELETE FROM feed_versions WHERE feed_id = $1`, [feedId])
}
