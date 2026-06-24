import type {
  PluginPackage,
  RankerCandidate,
  RankerRef,
  RemoteRankerRequest,
  RemoteRankerResponse,
  ViewerContext,
} from '@cfb/core-types'

import { invokeWasmRanker } from '@cfb/plugin-wasm'

export interface SkeletonPost {
  post: string
}

const AT_URI_RE = /^at:\/\//

export function isAtUri(value: string): boolean {
  return AT_URI_RE.test(value.trim())
}

export function pinnedUrisFromNativeConfig(config: Record<string, unknown> | undefined): string[] {
  const raw = config?.pinnedUris
  if (!Array.isArray(raw)) return []
  return raw.filter((u: unknown): u is string => typeof u === 'string' && isAtUri(u))
}

/** Move configured URIs to the front; preserve relative order of remaining posts. */
export function applyPinnedUriRanker(organic: SkeletonPost[], pinnedUris: string[]): SkeletonPost[] {
  if (pinnedUris.length === 0) return organic

  const byUri = new Map(organic.map((row) => [row.post, row]))
  const pinnedSet = new Set(pinnedUris)
  const result: SkeletonPost[] = []
  const used = new Set<string>()

  for (const uri of pinnedUris) {
    const row = byUri.get(uri)
    if (!row || used.has(uri)) continue
    used.add(uri)
    result.push(row)
  }

  for (const row of organic) {
    if (pinnedSet.has(row.post) && used.has(row.post)) continue
    if (used.has(row.post)) continue
    used.add(row.post)
    result.push(row)
  }

  return result
}

/** Keep remote reorder safe: only known candidates, append any missing at the end. */
export function validateRankerReorder(original: string[], reordered: string[]): string[] {
  const allowed = new Set(original)
  const seen = new Set<string>()
  const result: string[] = []

  for (const uri of reordered) {
    if (!allowed.has(uri) || seen.has(uri)) continue
    seen.add(uri)
    result.push(uri)
  }

  for (const uri of original) {
    if (seen.has(uri)) continue
    result.push(uri)
  }

  return result
}

export async function fetchRemoteRankerUris(
  endpoint: string,
  request: RemoteRankerRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!res.ok) {
    throw new Error(`remote ranker failed (${res.status})`)
  }
  const body = (await res.json()) as RemoteRankerResponse
  if (!Array.isArray(body.uris)) return request.candidates
  return validateRankerReorder(
    request.candidates,
    body.uris.filter((u: unknown): u is string => typeof u === 'string' && isAtUri(u)),
  )
}

export interface ApplyRankerInput {
  feedId: string
  limit: number
  ranker: RankerRef
  pkg: PluginPackage
  fetchImpl?: typeof fetch
  wasmBytes?: Uint8Array
  wasmSha256?: string
  /** Host-loaded enrichment for scoring plugins. */
  candidatePosts?: RankerCandidate[]
  viewerDid?: string
  viewer?: ViewerContext
}

function buildRankerRequest(
  input: ApplyRankerInput,
  candidates: string[],
  config: Record<string, unknown>,
): RemoteRankerRequest {
  return {
    feedId: input.feedId,
    limit: input.limit,
    candidates,
    candidatePosts: input.candidatePosts,
    viewerDid: input.viewerDid,
    viewer: input.viewer,
    config,
  }
}

export async function resolveRankerOrder(
  organic: SkeletonPost[],
  input: ApplyRankerInput,
): Promise<SkeletonPost[]> {
  const config = input.ranker.config ?? {}
  const candidates = organic.map((row) => row.post)
  const request = buildRankerRequest(input, candidates, config)

  if (input.pkg.runtime === 'remote' && input.pkg.remoteEndpoint) {
    try {
      const ordered = await fetchRemoteRankerUris(input.pkg.remoteEndpoint, request, input.fetchImpl)
      const byUri = new Map(organic.map((row) => [row.post, row]))
      return ordered
        .map((uri) => byUri.get(uri))
        .filter((row): row is SkeletonPost => row != null)
    } catch {
      return organic
    }
  }

  if (input.pkg.runtime === 'native') {
    return applyPinnedUriRanker(organic, pinnedUrisFromNativeConfig(config))
  }

  if (
    (input.pkg.runtime === 'wasm' || input.pkg.runtime === 'worker') &&
    input.wasmBytes &&
    input.wasmSha256
  ) {
    try {
      const ordered = await invokeWasmRanker(
        input.wasmBytes,
        input.wasmSha256,
        request,
        input.pkg.runtime === 'worker',
      )
      const byUri = new Map(organic.map((row) => [row.post, row]))
      const validated = validateRankerReorder(candidates, ordered)
      return validated
        .map((uri) => byUri.get(uri))
        .filter((row): row is SkeletonPost => row != null)
    } catch {
      return organic
    }
  }

  return organic
}

export async function applyRankerToSkeleton(
  organic: SkeletonPost[],
  input: ApplyRankerInput,
): Promise<SkeletonPost[]> {
  return resolveRankerOrder(organic, input)
}
