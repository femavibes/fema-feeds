import { api, type ListMemberEntry, type ListMembersResponse } from '../../api/client'

/** Session cache for Bluesky actor resolves — shared by canvas teasers, expand, and editors. */
const TTL_MS = 30 * 60 * 1000

/** Default page size for list member profile previews (never pull a full mega-list). */
export const LIST_MEMBERS_PREVIEW_LIMIT = 48

type Timed<T> = { value: T; at: number }

const byRef = new Map<string, Timed<ListMemberEntry>>()
const byList = new Map<string, Timed<ListMembersResponse>>()
const byListName = new Map<string, Timed<string>>()
const inflightActors = new Map<string, Promise<ListMemberEntry | null>>()
const inflightLists = new Map<string, Promise<ListMembersResponse>>()

function now() {
  return Date.now()
}

function fresh<T>(entry: Timed<T> | undefined): T | undefined {
  if (!entry) return undefined
  if (now() - entry.at > TTL_MS) return undefined
  return entry.value
}

export function normalizeActorRef(ref: string): string {
  return ref.trim().replace(/^@+/, '').toLowerCase()
}

function remember(member: ListMemberEntry) {
  const at = now()
  byRef.set(member.did.toLowerCase(), { value: member, at })
  if (member.handle?.trim()) {
    byRef.set(normalizeActorRef(member.handle), { value: member, at })
  }
}

export function peekActorCached(ref: string): ListMemberEntry | undefined {
  return fresh(byRef.get(normalizeActorRef(ref)))
}

/** Resolve actors with a shared in-memory TTL cache (dedupes concurrent lookups). */
export async function resolveActorsCached(refs: string[]): Promise<ListMemberEntry[]> {
  const unique = [...new Set(refs.map(normalizeActorRef).filter(Boolean))]
  if (unique.length === 0) return []

  const out: ListMemberEntry[] = []
  const missing: string[] = []

  for (const ref of unique) {
    const hit = fresh(byRef.get(ref))
    if (hit) out.push(hit)
    else missing.push(ref)
  }

  if (missing.length === 0) {
    return dedupeByDid(out)
  }

  const stillMissing: string[] = []
  const waiting: Promise<ListMemberEntry | null>[] = []

  for (const ref of missing) {
    const pending = inflightActors.get(ref)
    if (pending) waiting.push(pending)
    else stillMissing.push(ref)
  }

  if (stillMissing.length > 0) {
    const batch = api
      .resolveActors(stillMissing)
      .then((res) => {
        for (const member of res.members ?? []) remember(member)
        return res.members ?? []
      })
      .catch(() => [] as ListMemberEntry[])

    for (const ref of stillMissing) {
      const p = batch
        .then((members) => {
          const hit =
            members.find((m) => m.did.toLowerCase() === ref) ??
            members.find((m) => m.handle && normalizeActorRef(m.handle) === ref) ??
            fresh(byRef.get(ref)) ??
            null
          return hit
        })
        .finally(() => {
          inflightActors.delete(ref)
        })
      inflightActors.set(ref, p)
      waiting.push(p)
    }
  }

  const resolved = await Promise.all(waiting)
  for (const m of resolved) {
    if (m) out.push(m)
  }
  return dedupeByDid(out)
}

function listCacheKey(listId: string, limit: number, offset: number): string {
  return `${listId.trim()}::${offset}::${limit}`
}

/**
 * Fetch a *page* of list member profiles (default {@link LIST_MEMBERS_PREVIEW_LIMIT}).
 * Never requests the full list — mega-lists (50k+) would freeze the builder.
 */
export async function listMembersCached(
  listId: string,
  opts?: { limit?: number; offset?: number; extraDids?: string[] },
): Promise<ListMembersResponse> {
  const id = listId.trim()
  const limit = opts?.limit ?? LIST_MEMBERS_PREVIEW_LIMIT
  const offset = opts?.offset ?? 0
  if (!id) {
    return {
      listId: '',
      graphName: null,
      memberCount: 0,
      refreshedAt: null,
      members: [],
      limit,
      offset,
      truncated: false,
    }
  }

  const key = listCacheKey(id, limit, offset)
  const hit = fresh(byList.get(key))
  if (hit) return hit

  const pending = inflightLists.get(key)
  if (pending) return pending

  const p = api
    .listMembers(id, { limit, offset, extraDids: opts?.extraDids })
    .then((res) => {
      for (const member of res.members ?? []) remember(member)
      byList.set(key, { value: res, at: now() })
      if (res.graphName?.trim()) {
        byListName.set(id, { value: res.graphName.trim(), at: now() })
      }
      return res
    })
    .catch(() => ({
      listId: id,
      graphName: null,
      memberCount: 0,
      refreshedAt: null,
      members: [] as ListMemberEntry[],
      limit,
      offset,
      truncated: false,
    }))
    .finally(() => {
      inflightLists.delete(key)
    })

  inflightLists.set(key, p)
  return p
}

export function peekListGraphNameCached(listId: string): string | undefined {
  return fresh(byListName.get(listId.trim()))
}

export function invalidateListMembersCache(listId: string): void {
  const id = listId.trim()
  byListName.delete(id)
  for (const key of [...byList.keys()]) {
    if (key === id || key.startsWith(`${id}::`)) byList.delete(key)
  }
}

function dedupeByDid(members: ListMemberEntry[]): ListMemberEntry[] {
  const seen = new Set<string>()
  const out: ListMemberEntry[] = []
  for (const m of members) {
    const key = m.did.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(m)
  }
  return out
}
