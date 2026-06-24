import type { ListSource } from '@cfb/core-types'
import { parseGraphUri } from './parse-list-uri.js'

const PUBLIC_API = process.env.BSKY_PUBLIC_API ?? 'https://public.api.bsky.app'

export interface ListResolveOptions {
  publicApiBase?: string
  fetch?: typeof fetch
}

function extractSubjectDid(subject: unknown): string | undefined {
  if (typeof subject === 'string') return subject
  if (subject && typeof subject === 'object' && 'did' in subject) {
    const did = (subject as { did?: string }).did
    if (typeof did === 'string') return did
  }
  return undefined
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
): Promise<{ dids: string[]; graphName: string | null }> {
  const dids: string[] = []
  let graphName: string | null = null
  let cursor: string | undefined

  do {
    const params = new URLSearchParams({ list: listAtUri, limit: '100' })
    if (cursor) params.set('cursor', cursor)
    const url = `${base}/xrpc/app.bsky.graph.getList?${params}`
    const res = await fetchFn(url)
    if (!res.ok) throw new Error(`getList failed for ${listAtUri}: ${res.status}`)
    const data = (await res.json()) as {
      list?: { name?: string }
      items?: Array<{ subject?: unknown }>
      cursor?: string
    }
    if (graphName == null && data.list?.name?.trim()) {
      graphName = data.list.name.trim()
    }
    for (const item of data.items ?? []) {
      const did = extractSubjectDid(item.subject)
      if (did) dids.push(did)
    }
    cursor = data.cursor
  } while (cursor)

  return { dids, graphName }
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
  const listUri =
    data.starterPack?.list ??
    data.starterPack?.record?.list
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
): Promise<{ dids: string[]; graphName: string | null }> {
  let atUri = parsed.atUri

  if (parsed.resolveActor) {
    const did = await resolveActorToDid(parsed.resolveActor.actor, base, fetchFn)
    const collection =
      parsed.resolveActor.kind === 'starterpack'
        ? 'app.bsky.graph.starterpack'
        : 'app.bsky.graph.list'
    atUri = `at://${did}/${collection}/${parsed.resolveActor.rkey}`
  }

  if (parsed.kind === 'starterpack' || atUri.includes('app.bsky.graph.starterpack')) {
    const { listUri, graphName: starterName } = await resolveStarterPackToListUri(atUri, base, fetchFn)
    const list = await fetchListMembers(listUri, base, fetchFn)
    return {
      dids: list.dids,
      graphName: starterName ?? list.graphName,
    }
  }

  return fetchListMembers(atUri, base, fetchFn)
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
): Promise<{ dids: string[]; graphName: string | null }> {
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
): Promise<{ dids: string[]; graphName: string | null }> {
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

export async function resolveAuthorListDids(
  list: { sources?: ListSource[]; dids?: string[] },
  options?: ListResolveOptions,
): Promise<string[]> {
  const result = await resolveAuthorListForCache(list, options)
  return result.dids
}

/** Resolve DIDs and Bluesky graph display name for cache storage. */
export async function resolveAuthorListForCache(
  list: { sources?: ListSource[]; dids?: string[] },
  options?: ListResolveOptions,
): Promise<{ dids: string[]; graphName: string | null }> {
  const set = new Set<string>()
  let graphName: string | null = null

  if (list.dids?.length) {
    for (const d of list.dids) set.add(d)
  }

  for (const source of list.sources ?? []) {
    const resolved = await resolveListSourceWithMeta(source, options)
    if (!graphName && resolved.graphName) graphName = resolved.graphName
    for (const d of resolved.dids) set.add(d)
  }

  return { dids: [...set], graphName }
}
