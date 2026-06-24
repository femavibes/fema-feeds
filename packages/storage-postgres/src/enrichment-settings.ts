import type { EnrichmentSettings } from '@cfb/core-types'
import { DEFAULT_ENRICHMENT_SETTINGS } from '@cfb/core-types'
import type pg from 'pg'

export async function getEnrichmentSettings(pool: pg.Pool): Promise<EnrichmentSettings> {
  const res = await pool.query(
    `SELECT value_json FROM deployment_settings WHERE key = 'enrichment'`,
  )
  const row = res.rows[0]?.value_json as Partial<EnrichmentSettings> | undefined
  return { ...DEFAULT_ENRICHMENT_SETTINGS, ...row }
}

export async function saveEnrichmentSettings(
  pool: pg.Pool,
  settings: EnrichmentSettings,
): Promise<void> {
  await pool.query(
    `INSERT INTO deployment_settings (key, value_json, updated_at)
     VALUES ('enrichment', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [JSON.stringify(settings)],
  )
}
