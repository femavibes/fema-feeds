/**
 * Provision Cloudflare Tunnel hostnames on an operator zone (e.g. slug.feeds.fema.monster).
 * Lets home deployers get a stable HTTPS URL without owning a domain.
 */

import {
  dnsRecordNameForSlug,
  publicHostForSlug,
  type CloudflareDnsEnv,
} from './deployment-register.js'

export interface CloudflareTunnelEnv extends CloudflareDnsEnv {
  accountId: string
}

export function cloudflareTunnelEnvFromProcess(): CloudflareTunnelEnv | null {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim()
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim()
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const dnsBase = process.env.CFB_DNS_BASE?.trim() || 'feeds.fema.monster'
  if (!apiToken || !zoneId || !accountId) return null
  return { apiToken, zoneId, accountId, dnsBase }
}

export function isHostedHostnameAvailable(): boolean {
  return cloudflareTunnelEnvFromProcess() !== null
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  }
}

export interface ProvisionedHomeTunnel {
  slug: string
  publicHost: string
  publicUrl: string
  tunnelId: string
  tunnelToken: string
}

export async function provisionHomeTunnelHostname(
  env: CloudflareTunnelEnv,
  slug: string,
  opts?: { localService?: string },
): Promise<ProvisionedHomeTunnel> {
  const service = opts?.localService ?? 'http://127.0.0.1:3000'
  const publicHost = publicHostForSlug(slug, env.dnsBase)
  const recordName = dnsRecordNameForSlug(slug, env.dnsBase)
  const tunnelName = `cfb-${slug}`.slice(0, 63)

  const createRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.accountId}/cfd_tunnel`,
    {
      method: 'POST',
      headers: authHeaders(env.apiToken),
      body: JSON.stringify({ name: tunnelName, config_src: 'cloudflare' }),
    },
  )
  const createJson = (await createRes.json()) as {
    success?: boolean
    result?: { id: string }
    errors?: Array<{ message: string }>
  }
  if (!createRes.ok || !createJson.result?.id) {
    const msg = createJson.errors?.[0]?.message ?? `HTTP ${createRes.status}`
    throw new Error(`Cloudflare tunnel create failed: ${msg}`)
  }
  const tunnelId = createJson.result.id

  const tokenRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.accountId}/cfd_tunnel/${tunnelId}/token`,
    { method: 'POST', headers: authHeaders(env.apiToken) },
  )
  const tokenJson = (await tokenRes.json()) as { success?: boolean; result?: string }
  if (!tokenRes.ok || !tokenJson.result) {
    throw new Error(`Cloudflare tunnel token failed (HTTP ${tokenRes.status})`)
  }

  const configRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.accountId}/cfd_tunnel/${tunnelId}/configurations`,
    {
      method: 'PUT',
      headers: authHeaders(env.apiToken),
      body: JSON.stringify({
        config: {
          ingress: [
            { hostname: publicHost, service, originRequest: {} },
            { service: 'http_status:404' },
          ],
        },
      }),
    },
  )
  if (!configRes.ok) {
    throw new Error(`Cloudflare tunnel ingress failed (HTTP ${configRes.status})`)
  }

  await upsertTunnelCname(env, recordName, tunnelId)

  return {
    slug,
    publicHost,
    publicUrl: `https://${publicHost}`,
    tunnelId,
    tunnelToken: tokenJson.result,
  }
}

async function upsertTunnelCname(
  env: CloudflareDnsEnv,
  recordName: string,
  tunnelId: string,
): Promise<void> {
  const content = `${tunnelId}.cfargotunnel.com`
  const headers = authHeaders(env.apiToken)
  const listUrl = new URL(`https://api.cloudflare.com/client/v4/zones/${env.zoneId}/dns_records`)
  listUrl.searchParams.set('type', 'CNAME')
  listUrl.searchParams.set('name', recordName)

  const listRes = await fetch(listUrl, { headers })
  if (!listRes.ok) throw new Error(`Cloudflare DNS list failed (${listRes.status})`)
  const listJson = (await listRes.json()) as { result?: Array<{ id: string }> }
  const existingId = listJson.result?.[0]?.id

  const body = JSON.stringify({
    type: 'CNAME',
    name: recordName,
    content,
    proxied: true,
    ttl: 1,
  })

  const url = existingId
    ? `https://api.cloudflare.com/client/v4/zones/${env.zoneId}/dns_records/${existingId}`
    : `https://api.cloudflare.com/client/v4/zones/${env.zoneId}/dns_records`

  const res = await fetch(url, {
    method: existingId ? 'PUT' : 'POST',
    headers,
    body,
  })
  if (!res.ok) {
    throw new Error(`Cloudflare CNAME upsert failed (${res.status})`)
  }
}

export function slugFromHandle(handle: string | null | undefined): string {
  const base = (handle ?? 'feed')
    .replace(/^@/, '')
    .split('.')[0]
    ?.toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
  const slug = base && base.length >= 3 ? base.slice(0, 24) : ''
  return slug || randomSlug()
}

export function randomSlug(): string {
  return Math.random().toString(36).slice(2, 10)
}

export async function pickAvailableHostedSlug(
  pool: import('@cfb/storage-postgres').Pool,
  preferred: string,
  dnsBase: string,
): Promise<string> {
  let slug = preferred.slice(0, 24).toLowerCase().replace(/[^a-z0-9-]/g, '') || randomSlug()
  for (let attempt = 0; attempt < 8; attempt++) {
    const host = publicHostForSlug(slug, dnsBase)
    const res = await pool.query(
      `SELECT 1 FROM user_settings
       WHERE key = 'feedgen'
         AND (
           LOWER(value_json->>'cloudflarePublicUrl') LIKE '%' || LOWER($1) || '%'
           OR LOWER(value_json->>'hostedSlug') = LOWER($2)
         )
       LIMIT 1`,
      [host, slug],
    )
    if (!res.rows.length) return slug
    slug = `${preferred.slice(0, 16)}-${randomSlug()}`.replace(/[^a-z0-9-]/g, '')
  }
  return `feed-${randomSlug()}`
}
