import type pg from 'pg'

export interface IngestSmokeTestRecord {
  id: number
  durationSec: number
  finishedAt: string
  ignorePrefilters: boolean
  seen: number
  wouldSave: number
  passRatePct: string
  postsPerSec: string
  enabledProjects: number
  byProject: Record<string, number>
}

export interface InsertIngestSmokeTestInput {
  durationSec: number
  finishedAt: string
  ignorePrefilters: boolean
  seen: number
  wouldSave: number
  passRatePct: string
  postsPerSec: string
  enabledProjects: number
  byProject: Record<string, number>
}

type SmokeRow = {
  id: string
  finished_at: Date
  duration_sec: number
  ignore_prefilters?: boolean
  seen: number
  would_save: number
  pass_rate_pct: string
  posts_per_sec: string
  enabled_projects: number
  by_project: Record<string, number> | null
}

function rowToRecord(row: SmokeRow): IngestSmokeTestRecord {
  return {
    id: Number(row.id),
    durationSec: row.duration_sec,
    finishedAt: row.finished_at.toISOString(),
    ignorePrefilters: row.ignore_prefilters ?? false,
    seen: row.seen,
    wouldSave: row.would_save,
    passRatePct: row.pass_rate_pct,
    postsPerSec: row.posts_per_sec,
    enabledProjects: row.enabled_projects,
    byProject: row.by_project ?? {},
  }
}

export async function insertIngestSmokeTest(
  pool: pg.Pool,
  input: InsertIngestSmokeTestInput,
): Promise<IngestSmokeTestRecord> {
  const res = await pool.query<SmokeRow>(
    `INSERT INTO ingest_smoke_tests (
       finished_at, duration_sec, ignore_prefilters, seen, would_save, pass_rate_pct,
       posts_per_sec, enabled_projects, by_project
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING *`,
    [
      input.finishedAt,
      input.durationSec,
      input.ignorePrefilters,
      input.seen,
      input.wouldSave,
      input.passRatePct,
      input.postsPerSec,
      input.enabledProjects,
      JSON.stringify(input.byProject),
    ],
  )
  const row = res.rows[0]
  if (!row) throw new Error('Failed to insert ingest smoke test')
  return rowToRecord(row)
}

export async function getLatestIngestSmokeTest(
  pool: pg.Pool,
): Promise<IngestSmokeTestRecord | null> {
  const res = await pool.query<SmokeRow>(
    `SELECT * FROM ingest_smoke_tests
     ORDER BY finished_at DESC, id DESC
     LIMIT 1`,
  )
  const row = res.rows[0]
  return row ? rowToRecord(row) : null
}

export async function listIngestSmokeTests(
  pool: pg.Pool,
  limit = 10,
): Promise<IngestSmokeTestRecord[]> {
  const capped = Math.min(Math.max(limit, 1), 50)
  const res = await pool.query<SmokeRow>(
    `SELECT * FROM ingest_smoke_tests
     ORDER BY finished_at DESC, id DESC
     LIMIT $1`,
    [capped],
  )
  return res.rows.map(rowToRecord)
}
