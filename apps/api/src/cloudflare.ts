import type { FeedgenSettings } from '@cfb/core-types'

export interface CloudflareProbeResult {
  ok: boolean
  message: string
}

export async function probeCloudflarePublicUrl(publicUrl: string): Promise<CloudflareProbeResult> {
  const base = publicUrl.trim().replace(/\/$/, '')
  if (!base.startsWith('https://')) {
    return { ok: false, message: 'Public URL must start with https://' }
  }
  try {
    const res = await fetch(`${base}/.well-known/did.json`, {
      signal: AbortSignal.timeout(15000),
      headers: { accept: 'application/json' },
    })
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status} from ${base}/.well-known/did.json` }
    }
    const json = (await res.json()) as { id?: string }
    if (!json.id?.startsWith('did:web:')) {
      return { ok: false, message: 'did.json reachable but missing did:web service id' }
    }
    return { ok: true, message: 'Public URL reachable — did.json OK' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not reach public URL'
    return {
      ok: false,
      message: `${msg}. Is your public tunnel (Cloudflare or Tailscale Funnel) running and pointing at this API?`,
    }
  }
}

export async function applyCloudflareCheck(settings: FeedgenSettings): Promise<FeedgenSettings> {
  const url = settings.cloudflarePublicUrl?.trim() || settings.publicBaseUrl?.trim()
  if (!url || settings.publishMode === 'duckdns') return settings
  const result = await probeCloudflarePublicUrl(url)
  return {
    ...settings,
    cloudflareLastCheckAt: new Date().toISOString(),
    cloudflareLastOk: result.ok,
    cloudflareLastMessage: result.message,
  }
}
