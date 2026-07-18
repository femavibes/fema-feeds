import { api, type ListMemberEntry } from '../../api/client'

/** Session cache for Bluesky actor resolves — shared by canvas teasers, expand, and editors. */
const TTL_MS = 30 * 60 * 1000

type Timed<T> = { value: T; at: number }

const byRef = new Map<string, Timed<ListMemberEntry>>()
const byList = new Map<string, Timed<ListMemberEntry[]>>()
const inflightActors = new Map<string, Promise<ListMemberEntry | null>>()
const inflightLists = new Map<string, Promise<ListMemberEntry[]>>()

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

  // Coalesce concurrent identical batches loosely: per-ref inflight + one API call for misses.
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

export async function listMembersCached(listId: string): Promise<ListMemberEntry[]> {
  const id = listId.trim()
  if (!id) return []

  const hit = fresh(byList.get(id))
  if (hit) return hit

  const pending = inflightLists.get(id)
  if (pending) return pending

  const p = api
    .listMembers(id)
    .then((res) => {
      const members = res.members ?? []
      for (const member of members) remember(member)
      byList.set(id, { value: members, at: now() })
      return members
    })
    .catch(() => [] as ListMemberEntry[])
    .finally(() => {
      inflightLists.delete(id)
    })

  inflightLists.set(id, p)
  return p
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
