/**
 * Optional control plane: VPS calls register with a token; server updates DNS A record.
 * Enable by setting CFB_DEPLOYMENT_REGISTRATION_SECRET + Cloudflare zone credentials on the host.
 */

export interface DeploymentRegisterBody {
  token?: string
  slug?: string
  publicIp?: string
  proxied?: boolean
}

export interface CloudflareDnsEnv {
  apiToken: string
  zoneId: string
  dnsBase: string
}

export function deploymentDnsEnvFromProcess(): CloudflareDnsEnv | null {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim()
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim()
  const dnsBase = process.env.CFB_DNS_BASE?.trim() || 'feeds.fema.monster'
  if (!apiToken || !zoneId) return null
  return { apiToken, zoneId, dnsBase }
}

export function publicHostForSlug(slug: string, dnsBase: string): string {
  const first = dnsBase.split('.')[0] ?? dnsBase
  const rest = dnsBase.includes('.') ? dnsBase.slice(first.length + 1) : ''
  return rest ? `${slug}.${first}.${rest}` : `${slug}.${dnsBase}`
}

export function dnsRecordNameForSlug(slug: string, dnsBase: string): string {
  const first = dnsBase.split('.')[0] ?? dnsBase
  const rest = dnsBase.includes('.') ? dnsBase.slice(first.length + 1) : ''
  return rest ? `${slug}.${first}` : slug
}

export async function upsertCloudflareARecord(
  env: CloudflareDnsEnv,
  recordName: string,
  ip: string,
  proxied: boolean,
): Promise<void> {
  const headers = {
    Authorization: `Bearer ${env.apiToken}`,
    'content-type': 'application/json',
  }
  const listUrl = new URL(`https://api.cloudflare.com/client/v4/zones/${env.zoneId}/dns_records`)
  listUrl.searchParams.set('type', 'A')
  listUrl.searchParams.set('name', recordName)

  const listRes = await fetch(listUrl, { headers })
  if (!listRes.ok) {
    throw new Error(`Cloudflare list failed (${listRes.status})`)
  }
  const listJson = (await listRes.json()) as {
    result?: Array<{ id: string }>
  }
  const existingId = listJson.result?.[0]?.id

  const body = JSON.stringify({
    type: 'A',
    name: recordName,
    content: ip,
    ttl: 120,
    proxied,
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
    const err = (await res.json().catch(() => ({}))) as { errors?: unknown }
    throw new Error(`Cloudflare upsert failed (${res.status}): ${JSON.stringify(err.errors ?? {})}`)
  }
}
