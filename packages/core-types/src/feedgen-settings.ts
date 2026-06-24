export type FeedgenPublishMode = 'cloudflare' | 'duckdns' | 'tailscale' | 'custom'

export interface FeedgenSettings {
  /** How this deployment exposes feedgen to the internet. */
  publishMode?: FeedgenPublishMode
  /** Bluesky account DID that publishes the feed generator record. */
  generatorDid: string
  /** Public HTTPS base URL where Bluesky reaches getFeedSkeleton (no trailing slash). */
  publicBaseUrl: string
  privacyPolicyUrl?: string
  termsOfServiceUrl?: string
  /** Cloudflare Tunnel token (Zero Trust → Tunnels). Stored server-side only. */
  cloudflareTunnelToken?: string
  /** Public HTTPS URL from the tunnel hostname (e.g. https://feeds.example.com). */
  cloudflarePublicUrl?: string
  cloudflareLastCheckAt?: string
  cloudflareLastOk?: boolean
  cloudflareLastMessage?: string
  /** Operator-provided free subdomain (e.g. abc123.feeds.fema.monster) — no user domain required. */
  hostedSlug?: string
  hostedDnsBase?: string
  /** DuckDNS subdomain only (e.g. femafeeds → femafeeds.duckdns.org). */
  duckdnsSubdomain?: string
  /** DuckDNS account token — stored server-side; never returned to the client in full. */
  duckdnsToken?: string
  duckdnsLastSyncAt?: string
  duckdnsLastIp?: string
  duckdnsLastOk?: boolean
  duckdnsLastMessage?: string
}

export const DEFAULT_FEEDGEN_SETTINGS: FeedgenSettings = {
  generatorDid: '',
  publicBaseUrl: '',
}

export function duckdnsPublicHost(subdomain: string): string {
  const slug = subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
  return `${slug}.duckdns.org`
}

export function duckdnsPublicUrl(subdomain: string): string {
  return `https://${duckdnsPublicHost(subdomain)}`
}

export function isDuckDnsConfigured(
  settings: Pick<FeedgenSettings, 'duckdnsSubdomain' | 'duckdnsToken' | 'publishMode'>,
  opts?: { tokenSet?: boolean },
): boolean {
  if (settings.publishMode && settings.publishMode !== 'duckdns') return false
  return Boolean(settings.duckdnsSubdomain?.trim() && (settings.duckdnsToken?.trim() || opts?.tokenSet))
}

/** True when URL is a Tailscale Funnel hostname (https://machine.tailnet.ts.net). */
export function isTailscaleFunnelUrl(url: string | undefined): boolean {
  if (!url?.trim()) return false
  try {
    return new URL(url.trim()).hostname.endsWith('.ts.net')
  } catch {
    return false
  }
}

export function isTailscaleFunnelConfigured(
  settings: Pick<FeedgenSettings, 'publicBaseUrl' | 'publishMode'>,
): boolean {
  if (settings.publishMode && settings.publishMode !== 'tailscale') return false
  return isTailscaleFunnelUrl(settings.publicBaseUrl)
}

export function isCloudflareTunnelConfigured(
  settings: Pick<
    FeedgenSettings,
    'cloudflareTunnelToken' | 'cloudflarePublicUrl' | 'publishMode'
  >,
  opts?: { tokenSet?: boolean },
): boolean {
  if (settings.publishMode && settings.publishMode !== 'cloudflare') return false
  const url = settings.cloudflarePublicUrl?.trim()
  if (!url) return false
  if (settings.publishMode === 'cloudflare') return true
  const hasToken = Boolean(settings.cloudflareTunnelToken?.trim() || opts?.tokenSet)
  return hasToken || Boolean(url)
}

export function inferFeedgenPublishMode(
  settings: Pick<
    FeedgenSettings,
    'publishMode' | 'duckdnsSubdomain' | 'duckdnsToken' | 'cloudflarePublicUrl' | 'publicBaseUrl'
  >,
  opts?: { cloudflareTokenSet?: boolean; duckdnsTokenSet?: boolean },
): FeedgenPublishMode {
  if (settings.publishMode) return settings.publishMode
  if (isDuckDnsConfigured(settings, { tokenSet: opts?.duckdnsTokenSet })) return 'duckdns'
  if (isTailscaleFunnelConfigured(settings)) return 'tailscale'
  if (isCloudflareTunnelConfigured(settings, { tokenSet: opts?.cloudflareTokenSet })) {
    return 'cloudflare'
  }
  if (settings.cloudflarePublicUrl?.trim()) return 'cloudflare'
  return 'custom'
}

/** Resolved HTTPS base URL for Bluesky feedgen (no trailing slash). */
export function resolveFeedgenPublicBaseUrl(
  settings: FeedgenSettings,
  envFallbackUrl: string,
  opts?: { cloudflareTokenSet?: boolean },
): string {
  const mode = inferFeedgenPublishMode(settings, opts)
  if (mode === 'duckdns' && settings.duckdnsSubdomain?.trim()) {
    return duckdnsPublicUrl(settings.duckdnsSubdomain)
  }
  if (mode === 'cloudflare') {
    const url = settings.cloudflarePublicUrl?.trim() || envFallbackUrl.trim()
    return url.replace(/\/$/, '')
  }
  if (mode === 'tailscale') {
    const url = settings.publicBaseUrl?.trim() || envFallbackUrl.trim()
    return url.replace(/\/$/, '')
  }
  const url = settings.publicBaseUrl?.trim() || envFallbackUrl.trim()
  return url.replace(/\/$/, '')
}
