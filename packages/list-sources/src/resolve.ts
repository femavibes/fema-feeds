import type { ListSource } from '@cfb/core-types'
import { parseGraphUri } from './parse-list-uri.js'

const PUBLIC_API = process.env.BSKY_PUBLIC_API ?? 'https://public.api.bsky.app'

export interface ListResolveOptions {
  publicApiBase?: string
  fetch?: typeof fetch
}

/** Bluesky graph.list purpose values (moderation vs curation). */
export type BlueskyListPurpose = 'curatelist' | 'modlist' | 'referencelist' | string

export type BlueskyListKind = 'list' | 'starterpack'

export interface BlueskyGraphResolveMeta {
  /** Bluesky members only — never includes manual extras. */
  dids: string[]
  graphName: string | null
  /** Backing list at:// URI (canonical membership key). */
  graphUri: string
  /** How the user attached it. */
  kind: BlueskyListKind
  purpose: BlueskyListPurpose | null
  ownerDid: string | null
  /** Starter pack at:// when kind === starterpack. */
  starterPackUri?: string | null
}

function extractSubjectDid(subject: unknown): string | undefined {
  if (typeof subject === 'string') return subject
  if (subject && typeof subject === 'object' && 'did' in subject) {
    const did = (subject as { did?: string }).did
    if (typeof did === 'string') return did
  }
  return undefined
}

function ownerDidFromAtUri(atUri: string): string | null {
  const m = /^at:\/\/(did:[^/]+)\//i.exec(atUri)
  return m?.[1] ?? null
}

function normalizePurpose(raw: unknown): BlueskyListPurpose | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const v = raw.trim()
  if (v.endsWith('#modlist') || v === 'modlist') return 'modlist'
  if (v.endsWith('#curatelist') || v === 'curatelist') return 'curatelist'
  if (v.endsWith('#referencelist') || v === 'referencelist') return 'referencelist'
  return v
}

async function resolveActorToDid(actor: string, base: string, fetchFn: typeof fetch): Promise<string> {
  const url = `${base}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`Failed to resolve actor ${actor}: ${res.status}`)
  const data = (await res.json()) as { did?: string }
  if (!data.did) throw new Error(`No DID for actor ${actor}`)
  return data.did
}

async function fetchListMembers(
  listAtUri: string,
  base: string,
  fetchFn: typeof fetch,
): Promise<{
  dids: string[]
  graphName: string | null
  purpose: BlueskyListPurpose | null
}> {
  const dids: string[] = []
  let graphName: string | null = null
  let purpose: BlueskyListPurpose | null = null
  let cursor: string | undefined

  do {
    const params = new URLSearchParams({ list: listAtUri, limit: '100' })
    if (cursor) params.set('cursor', cursor)
    const url = `${base}/xrpc/app.bsky.graph.getList?${params}`
    const res = await fetchFn(url)
    if (!res.ok) throw new Error(`getList failed for ${listAtUri}: ${res.status}`)
    const data = (await res.json()) as {
      list?: { name?: string; purpose?: string }
      items?: Array<{ subject?: unknown }>
      cursor?: string
    }
    if (graphName == null && data.list?.name?.trim()) {
      graphName = data.list.name.trim()
    }
    if (purpose == null) purpose = normalizePurpose(data.list?.purpose)
    for (const item of data.items ?? []) {
      const did = extractSubjectDid(item.subject)
      if (did) dids.push(did)
    }
    cursor = data.cursor
  } while (cursor)

  return { dids, graphName, purpose }
}

async function resolveStarterPackToListUri(
  starterAtUri: string,
  base: string,
  fetchFn: typeof fetch,
): Promise<{ listUri: string; graphName: string | null }> {
  const params = new URLSearchParams({ starterPack: starterAtUri })
  const url = `${base}/xrpc/app.bsky.graph.getStarterPack?${params}`
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`getStarterPack failed for ${starterAtUri}: ${res.status}`)
  const data = (await res.json()) as {
    starterPack?: {
      list?: string
      record?: { list?: string; name?: string }
    }
  }
  const listUri = data.starterPack?.list ?? data.starterPack?.record?.list
  if (typeof listUri !== 'string' || !listUri.startsWith('at://')) {
    throw new Error(`Starter pack has no list reference: ${starterAtUri}`)
  }
  const graphName = data.starterPack?.record?.name?.trim() ?? null
  return { listUri, graphName }
}

async function resolveParsedGraph(
  parsed: NonNullable<ReturnType<typeof parseGraphUri>>,
  base: string,
  fetchFn: typeof fetch,
): Promise<BlueskyGraphResolveMeta> {
  let atUri = parsed.atUri
  let kind: BlueskyListKind = parsed.kind === 'starterpack' ? 'starterpack' : 'list'
  let starterPackUri: string | null = null

  if (parsed.resolveActor) {
    const did = await resolveActorToDid(parsed.resolveActor.actor, base, fetchFn)
    const collection =
      parsed.resolveActor.kind === 'starterpack'
        ? 'app.bsky.graph.starterpack'
        : 'app.bsky.graph.list'
    atUri = `at://${did}/${collection}/${parsed.resolveActor.rkey}`
  }

  if (parsed.kind === 'starterpack' || atUri.includes('app.bsky.graph.starterpack')) {
    kind = 'starterpack'
    starterPackUri = atUri
    const { listUri, graphName: starterName } = await resolveStarterPackToListUri(atUri, base, fetchFn)
    const list = await fetchListMembers(listUri, base, fetchFn)
    return {
      dids: list.dids,
      graphName: starterName ?? list.graphName,
      graphUri: listUri,
      kind,
      purpose: list.purpose,
      ownerDid: ownerDidFromAtUri(listUri),
      starterPackUri,
    }
  }

  const list = await fetchListMembers(atUri, base, fetchFn)
  return {
    dids: list.dids,
    graphName: list.graphName,
    graphUri: atUri,
    kind: 'list',
    purpose: list.purpose,
    ownerDid: ownerDidFromAtUri(atUri),
    starterPackUri: null,
  }
}

/** Resolve any Bluesky graph URI (list, modlist, starter pack) to member DIDs. */
export async function resolveBlueskyGraphUri(
  uri: string,
  options: ListResolveOptions = {},
): Promise<string[]> {
  const result = await resolveBlueskyGraphWithMeta(uri, options)
  return result.dids
}

export async function resolveBlueskyGraphWithMeta(
  uri: string,
  options: ListResolveOptions = {},
): Promise<BlueskyGraphResolveMeta> {
  const fetchFn = options.fetch ?? fetch
  const base = options.publicApiBase ?? PUBLIC_API
  const parsed = parseGraphUri(uri)
  if (!parsed) throw new Error(`Invalid Bluesky graph URI: ${uri}`)
  return resolveParsedGraph(parsed, base, fetchFn)
}

/** @deprecated Use resolveBlueskyGraphUri */
export const resolveBlueskyListUri = resolveBlueskyGraphUri

export async function resolveListSource(
  source: ListSource,
  options?: ListResolveOptions,
): Promise<string[]> {
  const result = await resolveListSourceWithMeta(source, options)
  return result.dids
}

export async function resolveListSourceWithMeta(
  source: ListSource,
  options?: ListResolveOptions,
): Promise<{ dids: string[]; graphName: string | null } & Partial<BlueskyGraphResolveMeta>> {
  switch (source.type) {
    case 'manual_dids':
      return { dids: [...source.dids], graphName: null }
    case 'bluesky_list':
    case 'bluesky_starter_pack': {
      const uri = source.uri?.trim() ?? ''
      if (!uri) return { dids: [], graphName: null }
      return resolveBlueskyGraphWithMeta(uri, options)
    }
    default: {
      const _exhaustive: never = source
      throw new Error(`Unknown list source type: ${(_exhaustive as ListSource).type}`)
    }
  }
}

/**
 * Bluesky-only members for author_list_cache.
 * Manual extras stay on the feed condition / L1 config and are unioned at eval time.
 */
export async function resolveBlueskyMembersForCache(
  list: { sources?: ListSource[] },
  options?: ListResolveOptions,
): Promise<BlueskyGraphResolveMeta | null> {
  for (const source of list.sources ?? []) {
    if (source.type !== 'bluesky_list' && source.type !== 'bluesky_starter_pack') continue
    const uri = source.uri?.trim() ?? ''
    if (!uri) continue
    return resolveBlueskyGraphWithMeta(uri, options)
  }
  return null
}

export async function resolveAuthorListDids(
  list: { sources?: ListSource[]; dids?: string[] },
  options?: ListResolveOptions,
): Promise<string[]> {
  const result = await resolveAuthorListForCache(list, options)
  return result.dids
}

/**
 * Full union for in-memory L1 without DB (manual + bluesky).
 * Prefer resolveBlueskyMembersForCache for DB rows.
 */
export async function resolveAuthorListForCache(
  list: { sources?: ListSource[]; dids?: string[] },
  options?: ListResolveOptions,
): Promise<{ dids: string[]; graphName: string | null } & Partial<BlueskyGraphResolveMeta>> {
  const remote = await resolveBlueskyMembersForCache(list, options)
  const set = new Set<string>(remote?.dids ?? [])
  if (list.dids?.length) {
    for (const d of list.dids) set.add(d)
  }
  for (const source of list.sources ?? []) {
    if (source.type === 'manual_dids') {
      for (const d of source.dids) set.add(d)
    }
  }
  return {
    dids: [...set],
    graphName: remote?.graphName ?? null,
    graphUri: remote?.graphUri,
    kind: remote?.kind,
    purpose: remote?.purpose ?? null,
    ownerDid: remote?.ownerDid ?? null,
    starterPackUri: remote?.starterPackUri,
  }
}

export function formatBlueskyListTypeLabel(input: {
  kind?: string | null
  purpose?: string | null
}): string {
  const kind = input.kind ?? 'list'
  const purpose = input.purpose
  if (kind === 'starterpack') return 'Starter pack'
  if (purpose === 'modlist') return 'Moderation list'
  if (purpose === 'referencelist') return 'Reference list'
  if (purpose === 'curatelist') return 'Curation list'
  return 'Bluesky list'
}
