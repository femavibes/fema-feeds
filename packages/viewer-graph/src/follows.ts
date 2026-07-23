const DEFAULT_PDS = 'https://public.api.bsky.app'

export interface FetchGraphOptions {
  pdsUrl?: string
  maxActors?: number
  /** Stop paginating after this many milliseconds (returns partial results). */
  maxMs?: number
  fetchImpl?: typeof fetch
}

export interface GraphFetchResult {
  dids: string[]
  /** True when pagination stopped early (time budget or maxActors). */
  partial: boolean
}

/** @deprecated Use FetchGraphOptions */
export type FetchFollowsOptions = FetchGraphOptions

async function paginateGraphDids(
  path: 'getFollows' | 'getFollowers',
  actorDid: string,
  options: FetchGraphOptions = {},
): Promise<GraphFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const base = (options.pdsUrl ?? DEFAULT_PDS).replace(/\/$/, '')
  const maxActors = options.maxActors ?? 3000
  const deadline = options.maxMs != null ? Date.now() + Math.max(1, options.maxMs) : null
  const out: string[] = []
  let cursor: string | undefined
  const rowKey = path === 'getFollows' ? 'follows' : 'followers'
  let partial = false

  while (out.length < maxActors) {
    if (deadline != null && Date.now() >= deadline) {
      partial = out.length > 0
      break
    }

    const params = new URLSearchParams({ actor: actorDid, limit: '100' })
    if (cursor) params.set('cursor', cursor)
    const res = await fetchImpl(`${base}/xrpc/app.bsky.graph.${path}?${params}`)
    if (!res.ok) break

    const body = (await res.json()) as {
      follows?: Array<{ did?: string }>
      followers?: Array<{ did?: string }>
      cursor?: string
    }
    const rows = body[rowKey] ?? []
    for (const row of rows) {
      if (typeof row.did === 'string' && row.did.startsWith('did:')) {
        out.push(row.did)
        if (out.length >= maxActors) {
          partial = Boolean(body.cursor) || rows.length === 100
          break
        }
      }
    }
    cursor = body.cursor
    if (!cursor || rows.length === 0) break
  }

  if (out.length >= maxActors && cursor) partial = true

  return { dids: out, partial }
}

/** Paginate app.bsky.graph.getFollows for an actor (public API). */
export async function fetchActorFollowsDids(
  actorDid: string,
  options: FetchGraphOptions = {},
): Promise<string[]> {
  return (await paginateGraphDids('getFollows', actorDid, options)).dids
}

export async function fetchActorFollowsDidsWithMeta(
  actorDid: string,
  options: FetchGraphOptions = {},
): Promise<GraphFetchResult> {
  return paginateGraphDids('getFollows', actorDid, options)
}

/** Paginate app.bsky.graph.getFollowers for an actor (public API). */
export async function fetchActorFollowersDids(
  actorDid: string,
  options: FetchGraphOptions = {},
): Promise<string[]> {
  return (await paginateGraphDids('getFollowers', actorDid, options)).dids
}

export async function fetchActorFollowersDidsWithMeta(
  actorDid: string,
  options: FetchGraphOptions = {},
): Promise<GraphFetchResult> {
  return paginateGraphDids('getFollowers', actorDid, options)
}

/** @deprecated Use fetchActorFollowsDids */
export async function fetchViewerFollowedDids(
  viewerDid: string,
  options: FetchGraphOptions = {},
): Promise<string[]> {
  return fetchActorFollowsDids(viewerDid, options)
}
