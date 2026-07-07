import type { BackfillJob, BackfillJobConfig, BackfillJobStatus, BackfillSettings } from '@cfb/core-types'
import { DEFAULT_BACKFILL_SETTINGS } from '@cfb/core-types'
import type pg from 'pg'

// --- Settings ---

export async function getBackfillSettings(pool: pg.Pool): Promise<BackfillSettings> {
  const res = await pool.query(
    `SELECT value_json FROM deployment_settings WHERE key = 'backfill'`,
  )
  const row = res.rows[0]?.value_json as Partial<BackfillSettings> | undefined
  return { ...DEFAULT_BACKFILL_SETTINGS, ...row }
}

export async function saveBackfillSettings(pool: pg.Pool, settings: BackfillSettings): Promise<void> {
  await pool.query(
    `INSERT INTO deployment_settings (key, value_json, updated_at)
     VALUES ('backfill', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [JSON.stringify(settings)],
  )
}

// --- Jetstream cursor persistence ---

export async function getJetstreamCursor(pool: pg.Pool): Promise<number | null> {
  const res = await pool.query(
    `SELECT value_json->>'cursor' AS cursor FROM deployment_settings WHERE key = 'jetstream_cursor'`,
  )
  const val = res.rows[0]?.cursor
  return val ? Number(val) : null
}

export async function saveJetstreamCursor(pool: pg.Pool, cursorUs: number): Promise<void> {
  await pool.query(
    `INSERT INTO deployment_settings (key, value_json, updated_at)
     VALUES ('jetstream_cursor', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [JSON.stringify({ cursor: cursorUs, savedAt: new Date().toISOString() })],
  )
}

// --- Backfill jobs ---

export async function ensureBackfillJobsTable(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS backfill_jobs (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id    TEXT NOT NULL,
      owner_did     TEXT,
      method        TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'queued',
      config_json   JSONB NOT NULL,
      candidates_scanned  INT NOT NULL DEFAULT 0,
      candidate_limit     INT NOT NULL,
      matches_found       INT NOT NULL DEFAULT 0,
      match_limit         INT NOT NULL,
      l2_written          INT NOT NULL DEFAULT 0,
      errors              INT NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      started_at    TIMESTAMPTZ,
      finished_at   TIMESTAMPTZ
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_backfill_jobs_project ON backfill_jobs(project_id, created_at DESC)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_backfill_jobs_status ON backfill_jobs(status) WHERE status IN ('queued', 'running')
  `)
}

export async function createBackfillJob(
  pool: pg.Pool,
  projectId: string,
  ownerDid: string | null,
  config: BackfillJobConfig,
): Promise<BackfillJob> {
  const res = await pool.query<{
    id: string
    created_at: Date
  }>(
    `INSERT INTO backfill_jobs (project_id, owner_did, method, config_json, candidate_limit, match_limit)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     RETURNING id, created_at`,
    [projectId, ownerDid, config.method, JSON.stringify(config), config.candidateLimit, config.matchLimit],
  )
  const row = res.rows[0]!
  return {
    id: row.id,
    projectId,
    ownerDid,
    method: config.method,
    status: 'queued',
    config,
    candidatesScanned: 0,
    candidateLimit: config.candidateLimit,
    matchesFound: 0,
    matchLimit: config.matchLimit,
    l2Written: 0,
    errors: 0,
    createdAt: row.created_at.toISOString(),
    startedAt: null,
    finishedAt: null,
  }
}

export async function getBackfillJob(pool: pg.Pool, id: string): Promise<BackfillJob | null> {
  const res = await pool.query(
    `SELECT * FROM backfill_jobs WHERE id = $1`,
    [id],
  )
  return res.rows[0] ? rowToJob(res.rows[0]) : null
}

export async function listBackfillJobs(
  pool: pg.Pool,
  projectId: string,
  limit = 10,
): Promise<BackfillJob[]> {
  const res = await pool.query(
    `SELECT * FROM backfill_jobs WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [projectId, limit],
  )
  return res.rows.map(rowToJob)
}

export async function getActiveBackfillCount(pool: pg.Pool): Promise<number> {
  const res = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM backfill_jobs WHERE status IN ('queued', 'running')`,
  )
  return Number(res.rows[0]?.count ?? 0)
}

export async function getLastBackfillForProject(pool: pg.Pool, projectId: string): Promise<BackfillJob | null> {
  const res = await pool.query(
    `SELECT * FROM backfill_jobs WHERE project_id = $1 AND status IN ('completed', 'running') ORDER BY created_at DESC LIMIT 1`,
    [projectId],
  )
  return res.rows[0] ? rowToJob(res.rows[0]) : null
}

export async function updateBackfillJobStatus(
  pool: pg.Pool,
  id: string,
  status: BackfillJobStatus,
): Promise<void> {
  const extra =
    status === 'running' ? `, started_at = NOW()` :
    status === 'completed' || status === 'failed' || status === 'cancelled' ? `, finished_at = NOW()` : ''
  await pool.query(
    `UPDATE backfill_jobs SET status = $1${extra} WHERE id = $2`,
    [status, id],
  )
}

export async function updateBackfillJobProgress(
  pool: pg.Pool,
  id: string,
  progress: { candidatesScanned: number; matchesFound: number; l2Written: number; errors: number },
): Promise<void> {
  await pool.query(
    `UPDATE backfill_jobs SET candidates_scanned = $1, matches_found = $2, l2_written = $3, errors = $4 WHERE id = $5`,
    [progress.candidatesScanned, progress.matchesFound, progress.l2Written, progress.errors, id],
  )
}

function rowToJob(row: any): BackfillJob {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerDid: row.owner_did,
    method: row.method,
    status: row.status,
    config: row.config_json,
    candidatesScanned: row.candidates_scanned,
    candidateLimit: row.candidate_limit,
    matchesFound: row.matches_found,
    matchLimit: row.match_limit,
    l2Written: row.l2_written,
    errors: row.errors,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    startedAt: row.started_at ? (row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at) : null,
    finishedAt: row.finished_at ? (row.finished_at instanceof Date ? row.finished_at.toISOString() : row.finished_at) : null,
  }
}
