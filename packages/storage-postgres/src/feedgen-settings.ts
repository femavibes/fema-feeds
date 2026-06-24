import type { FeedgenSettings } from '@cfb/core-types'
import { DEFAULT_FEEDGEN_SETTINGS } from '@cfb/core-types'
import type pg from 'pg'
import { envPublicBaseUrl, mergeResolvedFeedgenSettings } from './feedgen-resolve.js'

export interface FeedgenEnvFallback {
  generatorDid?: string
  publicBaseUrl?: string
  privacyPolicyUrl?: string
  termsOfServiceUrl?: string
  apiPort?: string
  cloudflareTunnelToken?: string
}

export async function getFeedgenSettings(pool: pg.Pool): Promise<FeedgenSettings> {
  const res = await pool.query(
    `SELECT value_json FROM deployment_settings WHERE key = 'feedgen'`,
  )
  const row = res.rows[0]?.value_json as Partial<FeedgenSettings> | undefined
  return { ...DEFAULT_FEEDGEN_SETTINGS, ...row }
}

export async function saveFeedgenSettings(
  pool: pg.Pool,
  settings: FeedgenSettings,
): Promise<void> {
  await pool.query(
    `INSERT INTO deployment_settings (key, value_json, updated_at)
     VALUES ('feedgen', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [JSON.stringify(settings)],
  )
}

/** DB values win when set; otherwise fall back to process env. */
export async function resolveFeedgenSettings(
  pool: pg.Pool | null,
  env: FeedgenEnvFallback,
): Promise<FeedgenSettings> {
  const fromDb = pool ? await getFeedgenSettings(pool) : DEFAULT_FEEDGEN_SETTINGS
  return mergeResolvedFeedgenSettings(fromDb, env, {
    cloudflareTokenSet: Boolean(fromDb.cloudflareTunnelToken?.trim()),
  })
}

export function feedgenSettingsFromEnv(env: FeedgenEnvFallback): FeedgenSettings {
  const publicBaseUrl = envPublicBaseUrl(env)
  const mode = env.cloudflareTunnelToken?.trim() && env.publicBaseUrl?.trim() ? 'cloudflare' : undefined
  return {
    publishMode: mode,
    generatorDid: env.generatorDid?.trim() ?? '',
    publicBaseUrl,
    cloudflarePublicUrl: mode === 'cloudflare' ? publicBaseUrl : undefined,
    privacyPolicyUrl: env.privacyPolicyUrl?.trim() || undefined,
    termsOfServiceUrl: env.termsOfServiceUrl?.trim() || undefined,
  }
}
