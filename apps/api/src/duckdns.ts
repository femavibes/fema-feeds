import { duckdnsPublicUrl, type FeedgenSettings } from '@cfb/core-types'

export interface DuckDnsSyncResult {
  ok: boolean
  ip: string
  message: string
  publicHost: string
  publicUrl: string
}

export async function detectPublicIpv4(): Promise<string> {
  const urls = [
    'https://api.ipify.org',
    'https://ifconfig.me/ip',
    'https://icanhazip.com',
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const ip = (await res.text()).trim()
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip
    } catch {
      // try next
    }
  }
  throw new Error('Could not detect public IPv4')
}

export async function syncDuckDns(
  subdomain: string,
  token: string,
  ip?: string,
): Promise<DuckDnsSyncResult> {
  const slug = subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
  if (!slug || slug.length < 2) {
    throw new Error('DuckDNS subdomain is required')
  }
  if (!token.trim()) {
    throw new Error('DuckDNS token is required')
  }

  const resolvedIp = ip?.trim() || (await detectPublicIpv4())
  const params = new URLSearchParams({
    domains: slug,
    token: token.trim(),
    ip: resolvedIp,
    clear: '',
  })
  const res = await fetch(`https://www.duckdns.org/update?${params}`, {
    signal: AbortSignal.timeout(15000),
  })
  const text = (await res.text()).trim()
  const ok = text === 'OK'
  const publicHost = `${slug}.duckdns.org`
  return {
    ok,
    ip: resolvedIp,
    message: ok ? 'DuckDNS updated' : `DuckDNS returned: ${text}`,
    publicHost,
    publicUrl: duckdnsPublicUrl(slug),
  }
}

export function mergeFeedgenSettings(
  current: FeedgenSettings,
  patch: Partial<FeedgenSettings>,
): FeedgenSettings {
  const next: FeedgenSettings = { ...current, ...patch }
  if (patch.duckdnsToken === undefined) {
    next.duckdnsToken = current.duckdnsToken
  }
  if (patch.cloudflareTunnelToken === undefined) {
    next.cloudflareTunnelToken = current.cloudflareTunnelToken
  }

  const mode = patch.publishMode ?? next.publishMode
  if (mode === 'cloudflare') {
    next.duckdnsSubdomain = undefined
    next.duckdnsToken = undefined
    next.duckdnsLastSyncAt = undefined
    next.duckdnsLastIp = undefined
    next.duckdnsLastOk = undefined
    next.duckdnsLastMessage = undefined
    const url = next.cloudflarePublicUrl?.trim()
    if (url) next.publicBaseUrl = url.replace(/\/$/, '')
  } else if (mode === 'duckdns') {
    next.cloudflarePublicUrl = undefined
    next.cloudflareTunnelToken = undefined
    next.cloudflareLastCheckAt = undefined
    next.cloudflareLastOk = undefined
    next.cloudflareLastMessage = undefined
    next.hostedSlug = undefined
    next.hostedDnsBase = undefined
    const subdomain = next.duckdnsSubdomain?.trim()
    if (subdomain && next.duckdnsToken?.trim()) {
      next.publicBaseUrl = duckdnsPublicUrl(subdomain)
    }
  } else if (mode === 'tailscale') {
    next.duckdnsSubdomain = undefined
    next.duckdnsToken = undefined
    next.duckdnsLastSyncAt = undefined
    next.duckdnsLastIp = undefined
    next.duckdnsLastOk = undefined
    next.duckdnsLastMessage = undefined
    next.cloudflarePublicUrl = undefined
    next.cloudflareTunnelToken = undefined
    next.cloudflareLastCheckAt = undefined
    next.cloudflareLastOk = undefined
    next.cloudflareLastMessage = undefined
    next.hostedSlug = undefined
    next.hostedDnsBase = undefined
    if (next.publicBaseUrl?.trim()) {
      next.publicBaseUrl = next.publicBaseUrl.trim().replace(/\/$/, '')
    }
  } else if (mode === 'custom') {
    next.duckdnsSubdomain = undefined
    next.duckdnsToken = undefined
    next.duckdnsLastSyncAt = undefined
    next.duckdnsLastIp = undefined
    next.duckdnsLastOk = undefined
    next.duckdnsLastMessage = undefined
    next.cloudflarePublicUrl = undefined
    next.cloudflareTunnelToken = undefined
    next.cloudflareLastCheckAt = undefined
    next.cloudflareLastOk = undefined
    next.cloudflareLastMessage = undefined
    next.hostedSlug = undefined
    next.hostedDnsBase = undefined
    if (next.publicBaseUrl?.trim()) {
      next.publicBaseUrl = next.publicBaseUrl.trim().replace(/\/$/, '')
    }
  } else if (next.publicBaseUrl?.trim()) {
    next.publicBaseUrl = next.publicBaseUrl.trim().replace(/\/$/, '')
  }

  if (patch.publishMode) {
    next.publishMode = patch.publishMode
  }

  return next
}

export function maskFeedgenSettings(
  settings: FeedgenSettings,
): FeedgenSettings & { duckdnsTokenSet: boolean; cloudflareTunnelTokenSet: boolean } {
  const { duckdnsToken, cloudflareTunnelToken, ...rest } = settings
  return {
    ...rest,
    duckdnsToken: undefined,
    cloudflareTunnelToken: undefined,
    duckdnsTokenSet: Boolean(duckdnsToken?.trim()),
    cloudflareTunnelTokenSet: Boolean(cloudflareTunnelToken?.trim()),
  }
}

export async function applyDuckDnsSync(settings: FeedgenSettings): Promise<FeedgenSettings> {
  const subdomain = settings.duckdnsSubdomain?.trim()
  const token = settings.duckdnsToken?.trim()
  if (!subdomain || !token) return settings

  const result = await syncDuckDns(subdomain, token)
  return {
    ...settings,
    publicBaseUrl: result.publicUrl,
    duckdnsLastSyncAt: new Date().toISOString(),
    duckdnsLastIp: result.ip,
    duckdnsLastOk: result.ok,
    duckdnsLastMessage: result.message,
  }
}
