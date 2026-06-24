import type { AuthorProfile } from '@cfb/core-types'

const PUBLIC_API = process.env.BSKY_PUBLIC_API ?? 'https://public.api.bsky.app'

export interface FetchProfileOptions {
  publicApiBase?: string
  fetch?: typeof fetch
}

interface ProfileResponse {
  did: string
  handle?: string
  displayName?: string
  description?: string
  avatar?: string
  banner?: string
  createdAt?: string
  indexedAt?: string
  followersCount?: number
  followsCount?: number
  postsCount?: number
  labels?: Array<{ val?: string }>
}

export function mapProfileResponse(data: ProfileResponse): AuthorProfile {
  return {
    did: data.did,
    handle: data.handle ?? null,
    displayName: data.displayName ?? null,
    description: data.description ?? null,
    avatarUrl: data.avatar ?? null,
    bannerUrl: data.banner ?? null,
    accountCreatedAt: data.createdAt ?? null,
    indexedAt: data.indexedAt ?? null,
    followersCount: data.followersCount ?? 0,
    followsCount: data.followsCount ?? 0,
    postsCount: data.postsCount ?? 0,
    labels: (data.labels ?? []).map((l) => l.val).filter((v): v is string => Boolean(v)),
  }
}

export async function fetchAuthorProfile(
  did: string,
  options: FetchProfileOptions = {},
): Promise<AuthorProfile> {
  const [one] = await fetchAuthorProfilesBatch([did], options)
  if (!one) throw new Error(`getProfile returned no data for ${did}`)
  return one
}

/** Resolve up to 25 actors per request via app.bsky.actor.getProfiles. */
export async function fetchAuthorProfilesBatch(
  actors: string[],
  options: FetchProfileOptions = {},
): Promise<AuthorProfile[]> {
  if (actors.length === 0) return []
  const fetchFn = options.fetch ?? fetch
  const base = options.publicApiBase ?? PUBLIC_API
  const out: AuthorProfile[] = []
  const CHUNK = 25

  for (let i = 0; i < actors.length; i += CHUNK) {
    const chunk = actors.slice(i, i + CHUNK)
    const url = new URL(`${base}/xrpc/app.bsky.actor.getProfiles`)
    for (const actor of chunk) url.searchParams.append('actors', actor)
    const res = await fetchFn(url)
    if (!res.ok) {
      throw new Error(`getProfiles failed: ${res.status}`)
    }
    const data = (await res.json()) as { profiles?: ProfileResponse[] }
    for (const profile of data.profiles ?? []) {
      if (profile?.did) out.push(mapProfileResponse(profile))
    }
  }

  return out
}

export function normalizeActorRef(raw: string): string {
  return raw.trim().replace(/^@+/, '')
}

export function isActorDid(actor: string): boolean {
  return /^did:[a-z0-9]+:/i.test(normalizeActorRef(actor))
}

/** Resolve handles or DIDs to canonical DIDs via getProfiles. */
export async function resolveActorsToDids(
  actors: string[],
  options: FetchProfileOptions = {},
): Promise<string[]> {
  const refs = [...new Set(actors.map(normalizeActorRef).filter(Boolean))]
  if (refs.length === 0) return []
  const profiles = await fetchAuthorProfilesBatch(refs, options)
  return profiles.map((p) => p.did)
}
