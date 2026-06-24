import type pg from 'pg'
import { BLUESKY_MODERATION_LABELER_DID } from '@cfb/core-types'

export interface LabelerSourceRow {
  did: string
  name: string
  enabled: boolean
  isBuiltin: boolean
  createdAt: Date
}

function rowFromDb(r: pg.QueryResultRow): LabelerSourceRow {
  return {
    did: r.did as string,
    name: r.name as string,
    enabled: r.enabled as boolean,
    isBuiltin: r.is_builtin as boolean,
    createdAt: new Date(r.created_at as string),
  }
}

export async function listLabelerSources(pool: pg.Pool): Promise<LabelerSourceRow[]> {
  const res = await pool.query(
    `SELECT did, name, enabled, is_builtin, created_at
     FROM labeler_sources ORDER BY is_builtin DESC, name ASC`,
  )
  return res.rows.map(rowFromDb)
}

export async function listEnabledLabelerDids(pool: pg.Pool): Promise<string[]> {
  const res = await pool.query<{ did: string }>(
    `SELECT did FROM labeler_sources WHERE enabled = true ORDER BY is_builtin DESC, name ASC`,
  )
  return res.rows.map((r) => r.did)
}

export async function getLabelerSource(
  pool: pg.Pool,
  did: string,
): Promise<LabelerSourceRow | null> {
  const res = await pool.query(
    `SELECT did, name, enabled, is_builtin, created_at FROM labeler_sources WHERE did = $1`,
    [did],
  )
  const row = res.rows[0]
  return row ? rowFromDb(row) : null
}

export async function upsertLabelerSource(
  pool: pg.Pool,
  input: { did: string; name: string; enabled?: boolean; isBuiltin?: boolean },
): Promise<LabelerSourceRow> {
  const res = await pool.query(
    `INSERT INTO labeler_sources (did, name, enabled, is_builtin)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (did) DO UPDATE SET
       name = EXCLUDED.name,
       enabled = COALESCE($3, labeler_sources.enabled)
     RETURNING did, name, enabled, is_builtin, created_at`,
    [input.did, input.name, input.enabled ?? true, input.isBuiltin ?? false],
  )
  return rowFromDb(res.rows[0]!)
}

export async function setLabelerEnabled(
  pool: pg.Pool,
  did: string,
  enabled: boolean,
): Promise<LabelerSourceRow | null> {
  const res = await pool.query(
    `UPDATE labeler_sources SET enabled = $2
     WHERE did = $1
     RETURNING did, name, enabled, is_builtin, created_at`,
    [did, enabled],
  )
  const row = res.rows[0]
  return row ? rowFromDb(row) : null
}

export async function deleteLabelerSource(pool: pg.Pool, did: string): Promise<boolean> {
  if (did === BLUESKY_MODERATION_LABELER_DID) return false
  const res = await pool.query(
    `DELETE FROM labeler_sources WHERE did = $1 AND is_builtin = false`,
    [did],
  )
  return (res.rowCount ?? 0) > 0
}
