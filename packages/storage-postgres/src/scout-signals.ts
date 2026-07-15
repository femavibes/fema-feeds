import type { ScoutInteractionType } from '@cfb/core-types'
import type pg from 'pg'

export interface ScoutSignalRow {
  projectId: string
  targetUri: string
  scoutDid: string
  interaction: ScoutInteractionType
  firstSignalAt: Date
  lastSignalAt: Date
}

export async function ensureScoutSignalsTables(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scout_signals (
      project_id    TEXT NOT NULL,
      target_uri    TEXT NOT NULL,
      scout_did     TEXT NOT NULL,
      interaction   TEXT NOT NULL DEFAULT 'like',
      first_signal_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_signal_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (project_id, target_uri, scout_did)
    );
    CREATE INDEX IF NOT EXISTS idx_scout_signals_target
      ON scout_signals(project_id, target_uri);
    CREATE INDEX IF NOT EXISTS idx_scout_signals_age
      ON scout_signals(first_signal_at);
  `)
}

/** Upsert a signal — returns the new distinct scout count for this target. */
export async function upsertScoutSignal(
  pool: pg.Pool,
  projectId: string,
  targetUri: string,
  scoutDid: string,
  interaction: ScoutInteractionType,
): Promise<number> {
  await pool.query(
    `INSERT INTO scout_signals (project_id, target_uri, scout_did, interaction, first_signal_at, last_signal_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (project_id, target_uri, scout_did)
     DO UPDATE SET interaction = CASE
       WHEN EXCLUDED.interaction > scout_signals.interaction THEN EXCLUDED.interaction
       ELSE scout_signals.interaction
     END, last_signal_at = NOW()`,
    [projectId, targetUri, scoutDid, interaction],
  )
  const res = await pool.query<{ cnt: string }>(
    `SELECT COUNT(DISTINCT scout_did) AS cnt FROM scout_signals
     WHERE project_id = $1 AND target_uri = $2`,
    [projectId, targetUri],
  )
  return Number(res.rows[0]?.cnt ?? 0)
}

/** Load all pending signals for a project (for startup recovery). */
export async function loadScoutSignals(
  pool: pg.Pool,
  projectId: string,
): Promise<Map<string, { scouts: Map<string, ScoutInteractionType>; firstSignalAt: number; lastSignalAt: number }>> {
  const res = await pool.query<{
    target_uri: string
    scout_did: string
    interaction: string
    first_signal_at: string
    last_signal_at: string
  }>(
    `SELECT target_uri, scout_did, interaction, first_signal_at, last_signal_at
     FROM scout_signals WHERE project_id = $1
     ORDER BY first_signal_at ASC`,
    [projectId],
  )
  const map = new Map<string, { scouts: Map<string, ScoutInteractionType>; firstSignalAt: number; lastSignalAt: number }>()
  for (const row of res.rows) {
    let entry = map.get(row.target_uri)
    if (!entry) {
      entry = { scouts: new Map(), firstSignalAt: new Date(row.first_signal_at).getTime(), lastSignalAt: new Date(row.last_signal_at).getTime() }
      map.set(row.target_uri, entry)
    }
    entry.scouts.set(row.scout_did, row.interaction as ScoutInteractionType)
    const ts = new Date(row.last_signal_at).getTime()
    if (ts > entry.lastSignalAt) entry.lastSignalAt = ts
  }
  return map
}

/** Delete signals for a triggered target. */
export async function deleteScoutSignals(
  pool: pg.Pool,
  projectId: string,
  targetUri: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM scout_signals WHERE project_id = $1 AND target_uri = $2`,
    [projectId, targetUri],
  )
}

/** Sweep signals older than maxAgeMs. Returns count deleted. */
export async function sweepScoutSignals(
  pool: pg.Pool,
  projectId: string,
  maxAgeMs: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs)
  const res = await pool.query(
    `DELETE FROM scout_signals WHERE project_id = $1 AND first_signal_at < $2`,
    [projectId, cutoff],
  )
  return res.rowCount ?? 0
}
