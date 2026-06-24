import type { FeedgenSettings } from '@cfb/core-types'

export interface DidWebDocument {
  '@context': string[]
  id: string
  service: Array<{
    id: string
    type: 'BskyFeedGenerator'
    serviceEndpoint: string
  }>
}

/** Public HTTPS hostname → did:web service DID (required for self-hosted feedgens). */
export function didWebFromPublicUrl(publicBaseUrl: string): string | null {
  try {
    const url = new URL(publicBaseUrl.trim())
    if (url.protocol !== 'https:') return null
    const host = url.hostname.toLowerCase()
    if (!host || host === 'localhost' || host === '127.0.0.1') return null
    return `did:web:${host}`
  } catch {
    return null
  }
}

export function buildDidWebDocument(publicBaseUrl: string): DidWebDocument | null {
  const serviceDid = didWebFromPublicUrl(publicBaseUrl)
  if (!serviceDid) return null
  const base = publicBaseUrl.replace(/\/$/, '')
  return {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: serviceDid,
    service: [
      {
        id: '#bsky_fg',
        type: 'BskyFeedGenerator',
        serviceEndpoint: base,
      },
    ],
  }
}

/**
 * DID of the feedgen HTTP service (describeFeedGenerator + getFeedSkeleton).
 * Prefer did:web from the public URL; account PLC DIDs cannot host feedgen.
 */
export function resolveFeedgenServiceDid(
  settings: Pick<FeedgenSettings, 'publicBaseUrl' | 'generatorDid'>,
  ownerDid?: string | null,
): string {
  const fromUrl = didWebFromPublicUrl(settings.publicBaseUrl)
  if (fromUrl) return fromUrl
  return settings.generatorDid?.trim() || ownerDid?.trim() || ''
}
