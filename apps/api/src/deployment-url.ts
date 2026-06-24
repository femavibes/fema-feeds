import { isIP } from 'node:net'
import type { Pool } from '@cfb/storage-postgres'
import {
  bootstrapDeploymentFromEnv,
  getDeploymentInfo,
} from '@cfb/storage-postgres'
import { publicUrlForSlug } from '@cfb/core-types'

export function isValidOAuthPublicUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && !isIP(u.hostname)
  } catch {
    return false
  }
}

export async function resolveOAuthPublicUrl(
  pool: Pool | null,
  rootDir?: string,
): Promise<string | null> {
  void rootDir
  const explicit =
    process.env.OAUTH_PUBLIC_URL?.trim() || process.env.FEEDGEN_PUBLIC_URL?.trim()
  if (explicit) {
    const normalized = explicit.replace(/\/$/, '')
    if (isValidOAuthPublicUrl(normalized)) return normalized
  }

  const slug = process.env.CFB_DEPLOYMENT_SLUG?.trim()
  const dnsBase = process.env.CFB_DNS_BASE?.trim() || 'feeds.fema.monster'
  if (slug) {
    const url = publicUrlForSlug(slug, dnsBase)
    if (isValidOAuthPublicUrl(url)) return url
  }

  if (pool) {
    await bootstrapDeploymentFromEnv(pool)
    const dep = await getDeploymentInfo(pool)
    if (dep?.publicUrl && isValidOAuthPublicUrl(dep.publicUrl)) {
      return dep.publicUrl.replace(/\/$/, '')
    }
  }

  return null
}

export function oauthSetupError(): string {
  return (
    'OAuth needs a public HTTPS URL on fema.monster (or your own domain). ' +
    'The VPS operator runs provision-feed-url before anyone logs in, e.g. ' +
    'CFB_DEPLOYMENT_SLUG=myfeeds ./scripts/provision-feed-url.sh — ' +
    'then open https://myfeeds.feeds.fema.monster (not localhost).'
  )
}
