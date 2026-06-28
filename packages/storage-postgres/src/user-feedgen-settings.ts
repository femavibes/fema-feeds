import type { FeedgenSettings } from '@cfb/core-types'
import { DEFAULT_FEEDGEN_SETTINGS } from '@cfb/core-types'
import type pg from 'pg'
import type { FeedgenEnvFallback } from './feedgen-settings.js'
import { mergeResolvedFeedgenSettings } from './feedgen-resolve.js'
import { getDeploymentAccess } from './deployment-settings.js'

export async function getUserFeedgenSettings(
  pool: pg.Pool,
  ownerDid: string,
): Promise<FeedgenSettings> {
  const res = await pool.query(
    `SELECT value_json FROM user_settings WHERE owner_did = $1 AND key = 'feedgen'`,
    [ownerDid],
  )
  const row = res.rows[0]?.value_json as Partial<FeedgenSettings> | undefined
  return { ...DEFAULT_FEEDGEN_SETTINGS, ...row }
}

export async function saveUserFeedgenSettings(
  pool: pg.Pool,
  ownerDid: string,
  settings: FeedgenSettings,
): Promise<void> {
  await pool.query(
    `INSERT INTO user_settings (owner_did, key, value_json, updated_at)
     VALUES ($1, 'feedgen', $2::jsonb, NOW())
     ON CONFLICT (owner_did, key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [ownerDid, JSON.stringify(settings)],
  )
}

export async function resolveUserFeedgenSettings(
  pool: pg.Pool,
  ownerDid: string,
  env: FeedgenEnvFallback,
): Promise<FeedgenSettings> {
  const fromDb = await getUserFeedgenSettings(pool, ownerDid)
  const resolved = mergeResolvedFeedgenSettings(fromDb, env, {
    cloudflareTokenSet: Boolean(fromDb.cloudflareTunnelToken?.trim()),
  })

  // If user has no publicBaseUrl, inherit from the master's settings
  let publicBaseUrl = resolved.publicBaseUrl
  if (!publicBaseUrl || publicBaseUrl === `http://localhost:${env.apiPort ?? '3000'}`) {
    const access = await getDeploymentAccess(pool)
    if (access.masterDid && access.masterDid !== ownerDid) {
      const masterSettings = await getUserFeedgenSettings(pool, access.masterDid)
      publicBaseUrl = masterSettings.cloudflarePublicUrl?.trim() || masterSettings.publicBaseUrl?.trim() || publicBaseUrl
    }
  }

  return {
    ...resolved,
    publicBaseUrl,
    generatorDid: resolved.generatorDid?.trim() || ownerDid,
  }
}

/** Find user by DuckDNS public host (e.g. femafeeds.duckdns.org). */
export async function findOwnerDidByDuckdnsHost(
  pool: pg.Pool,
  host: string,
): Promise<string | null> {
  const normalized = host.toLowerCase().split(':')[0]!
  if (!normalized.endsWith('.duckdns.org')) return null
  const subdomain = normalized.replace(/\.duckdns\.org$/, '')
  const res = await pool.query<{ owner_did: string }>(
    `SELECT owner_did FROM user_settings
     WHERE key = 'feedgen'
       AND LOWER(value_json->>'duckdnsSubdomain') = $1
     LIMIT 1`,
    [subdomain],
  )
  return res.rows[0]?.owner_did ?? null
}

/** Find user by public feedgen host (DuckDNS or Cloudflare tunnel URL). */
export async function findOwnerDidByPublicHost(
  pool: pg.Pool,
  host: string,
): Promise<string | null> {
  const fromDuck = await findOwnerDidByDuckdnsHost(pool, host)
  if (fromDuck) return fromDuck

  const normalized = host.toLowerCase().split(':')[0]!
  const res = await pool.query<{ owner_did: string }>(
    `SELECT owner_did FROM user_settings
     WHERE key = 'feedgen'
       AND (
         LOWER(REPLACE(value_json->>'cloudflarePublicUrl', 'https://', '')) LIKE $1 || '%'
         OR LOWER(REPLACE(value_json->>'publicBaseUrl', 'https://', '')) LIKE $1 || '%'
       )
     LIMIT 1`,
    [normalized],
  )
  return res.rows[0]?.owner_did ?? null
}

export async function listUsersWithDuckDns(pool: pg.Pool): Promise<
  Array<{ ownerDid: string; settings: FeedgenSettings }>
> {
  const res = await pool.query<{ owner_did: string; value_json: Partial<FeedgenSettings> }>(
    `SELECT owner_did, value_json FROM user_settings
     WHERE key = 'feedgen'
       AND value_json->>'duckdnsSubdomain' IS NOT NULL
       AND value_json->>'duckdnsSubdomain' <> ''
       AND value_json->>'duckdnsToken' IS NOT NULL
       AND value_json->>'duckdnsToken' <> ''`,
  )
  return res.rows.map((r) => ({
    ownerDid: r.owner_did,
    settings: { ...DEFAULT_FEEDGEN_SETTINGS, ...r.value_json },
  }))
}
