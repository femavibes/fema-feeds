import type pg from 'pg'

export type IngestSettings = {
  /** Whether the operator wants Jetstream ingest running (survives API restarts). */
  desiredRunning: boolean
}

export async function getIngestSettings(pool: pg.Pool): Promise<IngestSettings> {
  const res = await pool.query(
    `SELECT value_json FROM deployment_settings WHERE key = 'ingest'`,
  )
  const row = res.rows[0]?.value_json as Partial<IngestSettings> | undefined
  return { desiredRunning: row?.desiredRunning === true }
}

export async function saveIngestSettings(
  pool: pg.Pool,
  settings: IngestSettings,
): Promise<void> {
  await pool.query(
    `INSERT INTO deployment_settings (key, value_json, updated_at)
     VALUES ('ingest', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [JSON.stringify(settings)],
  )
}
