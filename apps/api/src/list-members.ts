import type { Pool } from '@cfb/storage-postgres'
import { fetchAuthorProfilesBatch } from '@cfb/profile-enrich'
import { getAuthorProfilesByDids, upsertAuthorProfile, type AuthorProfileRow } from '@cfb/storage-postgres'

export interface ResolvedListMember {
  did: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
}

const PROFILE_TTL_HOURS = 168

function profileIsComplete(row: AuthorProfileRow | undefined): boolean {
  if (!row) return false
  return Boolean(row.handle?.trim() && row.avatarUrl?.trim())
}

function toMember(row: AuthorProfileRow | undefined, did: string): ResolvedListMember {
  return {
    did,
    handle: row?.handle?.trim() || null,
    displayName: row?.displayName?.trim() || null,
    avatarUrl: row?.avatarUrl?.trim() || null,
  }
}

/** Load member profiles from cache, fetching missing ones from Bluesky (URLs only — no image blobs). */
export async function resolveListMemberProfiles(
  pool: Pool,
  dids: string[],
): Promise<ResolvedListMember[]> {
  if (dids.length === 0) return []
  return resolveActorProfiles(pool, dids)
}

/** Resolve handles or DIDs to profile chips (cache + Bluesky getProfiles). */
export async function resolveActorProfiles(
  pool: Pool,
  actors: string[],
): Promise<ResolvedListMember[]> {
  if (actors.length === 0) return []

  const normalized = actors.map((a) => a.trim().replace(/^@+/, '')).filter(Boolean)
  const didActors = normalized.filter((a) => /^did:[a-z0-9]+:/i.test(a))
  const handleActors = normalized.filter((a) => !/^did:[a-z0-9]+:/i.test(a))

  const cached = didActors.length > 0 ? await getAuthorProfilesByDids(pool, didActors) : []
  const byDid = new Map(cached.map((p) => [p.did, p]))

  const toFetch = [
    ...didActors.filter((did) => !profileIsComplete(byDid.get(did))),
    ...handleActors,
  ]

  if (toFetch.length > 0) {
    try {
      const fetched = await fetchAuthorProfilesBatch(toFetch)
      await Promise.all(
        fetched.map(async (profile) => {
          await upsertAuthorProfile(pool, profile, PROFILE_TTL_HOURS)
          byDid.set(profile.did, {
            ...profile,
            fetchedAt: new Date(),
            expiresAt: null,
          })
        }),
      )
    } catch (err) {
      console.warn('[list-members] actor profile fetch failed:', err)
    }
  }

  const ordered: ResolvedListMember[] = []
  for (const actor of normalized) {
    if (/^did:[a-z0-9]+:/i.test(actor)) {
      ordered.push(toMember(byDid.get(actor), actor))
      continue
    }
    const match = [...byDid.values()].find(
      (p) => p.handle?.toLowerCase() === actor.toLowerCase(),
    )
    if (match) {
      ordered.push(toMember(match, match.did))
    }
  }

  return ordered
}

export function blueskyProfileUrl(member: Pick<ResolvedListMember, 'did' | 'handle'>): string {
  const actor = member.handle ?? member.did
  return `https://bsky.app/profile/${encodeURIComponent(actor)}`
}
