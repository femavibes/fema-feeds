import type {
  FeedInjectorConfig,
  FeedInjectorSlots,
  PluginPackage,
  RemoteInjectorRequest,
  RemoteInjectorResponse,
} from '@cfb/core-types'
import { invokeWasmInjector } from '@cfb/plugin-wasm'

export interface SkeletonPost {
  post: string
}

const AT_URI_RE = /^at:\/\//

export function isAtUri(value: string): boolean {
  return AT_URI_RE.test(value.trim())
}

export function normalizeSlots(slots: FeedInjectorSlots): FeedInjectorSlots {
  return {
    every: Math.max(1, Math.floor(slots.every) || 8),
    maxPerPage: Math.max(0, Math.floor(slots.maxPerPage) || 1),
  }
}

/** URIs from native injector config (`config.uris` string array). */
export function urisFromNativeConfig(config: Record<string, unknown> | undefined): string[] {
  const raw = config?.uris
  if (!Array.isArray(raw)) return []
  return raw.filter((u): u is string => typeof u === 'string' && isAtUri(u))
}

export async function fetchRemoteInjectorUris(
  endpoint: string,
  request: RemoteInjectorRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!res.ok) {
    throw new Error(`remote injector failed (${res.status})`)
  }
  const body = (await res.json()) as RemoteInjectorResponse
  if (!Array.isArray(body.uris)) return []
  return body.uris.filter((u: unknown): u is string => typeof u === 'string' && isAtUri(u))
}

/** Merge injected URIs into organic skeleton respecting slot caps. */
export function mergeInjectorSlots(
  organic: SkeletonPost[],
  injectedUris: string[],
  slots: FeedInjectorSlots,
): SkeletonPost[] {
  const rules = normalizeSlots(slots)
  if (rules.maxPerPage === 0 || injectedUris.length === 0) return organic

  const organicUris = new Set(organic.map((p) => p.post))
  const result: SkeletonPost[] = []
  let injectIdx = 0
  let injectedCount = 0

  for (let i = 0; i < organic.length; i++) {
    const row = organic[i]
    if (!row) continue
    result.push(row)
    const organicPosition = i + 1
    if (injectedCount >= rules.maxPerPage) continue
    if (organicPosition % rules.every !== 0) continue

    let attempts = 0
    while (attempts < injectedUris.length) {
      const uri = injectedUris[injectIdx % injectedUris.length]
      injectIdx++
      attempts++
      if (!uri || organicUris.has(uri)) continue
      result.push({ post: uri })
      injectedCount++
      break
    }
  }

  return result
}

export interface ApplyInjectorInput {
  feedId: string
  limit: number
  injector: FeedInjectorConfig
  pkg: PluginPackage
  fetchImpl?: typeof fetch
  wasmBytes?: Uint8Array
  wasmSha256?: string
}

export async function resolveInjectorUris(input: ApplyInjectorInput): Promise<string[]> {
  const config = input.injector.config ?? {}
  if (input.pkg.runtime === 'remote' && input.pkg.remoteEndpoint) {
    try {
      return await fetchRemoteInjectorUris(
        input.pkg.remoteEndpoint,
        {
          feedId: input.feedId,
          limit: input.limit,
          slots: normalizeSlots(input.injector.slots),
          config,
        },
        input.fetchImpl,
      )
    } catch {
      return []
    }
  }
  if (input.pkg.runtime === 'native') {
    return urisFromNativeConfig(config)
  }
  if (
    (input.pkg.runtime === 'wasm' || input.pkg.runtime === 'worker') &&
    input.wasmBytes &&
    input.wasmSha256
  ) {
    try {
      return await invokeWasmInjector(
        input.wasmBytes,
        input.wasmSha256,
        {
          feedId: input.feedId,
          limit: input.limit,
          slots: normalizeSlots(input.injector.slots),
          config,
        },
        input.pkg.runtime === 'worker',
      )
    } catch {
      return []
    }
  }
  return []
}

export async function applyInjectorToSkeleton(
  organic: SkeletonPost[],
  input: ApplyInjectorInput,
): Promise<SkeletonPost[]> {
  const uris = await resolveInjectorUris(input)
  return mergeInjectorSlots(organic, uris, input.injector.slots)
}
