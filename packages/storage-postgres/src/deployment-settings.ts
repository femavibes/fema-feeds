import type { DeploymentAccessSettings, DeploymentInfo } from '@cfb/core-types'
import {
  DEFAULT_DEPLOYMENT_ACCESS,
  publicHostForSlug,
  publicUrlForSlug,
} from '@cfb/core-types'
import type pg from 'pg'

async function getSettingsJson<T>(pool: pg.Pool, key: string): Promise<Partial<T> | undefined> {
  const res = await pool.query(
    `SELECT value_json FROM deployment_settings WHERE key = $1`,
    [key],
  )
  return res.rows[0]?.value_json as Partial<T> | undefined
}

async function saveSettingsJson(pool: pg.Pool, key: string, value: unknown): Promise<void> {
  await pool.query(
    `INSERT INTO deployment_settings (key, value_json, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [key, JSON.stringify(value)],
  )
}

export async function getDeploymentInfo(pool: pg.Pool): Promise<DeploymentInfo | null> {
  const row = await getSettingsJson<DeploymentInfo>(pool, 'deployment')
  if (!row?.slug || !row.publicUrl) return null
  return {
    slug: row.slug,
    dnsBase: row.dnsBase ?? 'feeds.fema.monster',
    publicUrl: row.publicUrl,
    publicHost: row.publicHost ?? publicHostForSlug(row.slug, row.dnsBase ?? 'feeds.fema.monster'),
    registeredAt: row.registeredAt,
  }
}

export async function saveDeploymentInfo(pool: pg.Pool, info: DeploymentInfo): Promise<void> {
  await saveSettingsJson(pool, 'deployment', info)
}

export async function getDeploymentAccess(pool: pg.Pool): Promise<DeploymentAccessSettings> {
  const row = await getSettingsJson<DeploymentAccessSettings>(pool, 'access')
  return { ...DEFAULT_DEPLOYMENT_ACCESS, ...row, allowedDids: row?.allowedDids ?? [] }
}

export async function saveDeploymentAccess(
  pool: pg.Pool,
  access: DeploymentAccessSettings,
): Promise<void> {
  await saveSettingsJson(pool, 'access', access)
}

/** Seed deployment URL from env on boot (operator runs provision-feed-url before login). */
export async function bootstrapDeploymentFromEnv(pool: pg.Pool): Promise<DeploymentInfo | null> {
  const existing = await getDeploymentInfo(pool)
  if (existing) return existing

  const slug = process.env.CFB_DEPLOYMENT_SLUG?.trim()
  const dnsBase = process.env.CFB_DNS_BASE?.trim() || 'feeds.fema.monster'
  const envUrl = process.env.OAUTH_PUBLIC_URL?.trim() || process.env.FEEDGEN_PUBLIC_URL?.trim()

  if (slug) {
    const info: DeploymentInfo = {
      slug,
      dnsBase,
      publicHost: publicHostForSlug(slug, dnsBase),
      publicUrl: envUrl || publicUrlForSlug(slug, dnsBase),
      registeredAt: new Date().toISOString(),
    }
    await saveDeploymentInfo(pool, info)
    return info
  }

  if (envUrl) {
    try {
      const host = new URL(envUrl).hostname
      const info: DeploymentInfo = {
        slug: host.split('.')[0] ?? 'deploy',
        dnsBase,
        publicHost: host,
        publicUrl: envUrl.replace(/\/$/, ''),
        registeredAt: new Date().toISOString(),
      }
      await saveDeploymentInfo(pool, info)
      return info
    } catch {
      return null
    }
  }

  return null
}

export async function bootstrapMasterFromEnv(pool: pg.Pool): Promise<void> {
  const masterDid = process.env.CFB_MASTER_DID?.trim()
  if (!masterDid) return
  const access = await getDeploymentAccess(pool)
  if (access.masterDid) return
  await saveDeploymentAccess(pool, { ...access, masterDid })
}
