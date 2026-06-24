import type {
  RemoteInjectorRequest,
  RemoteInjectorResponse,
  RemoteRankerRequest,
  RemoteRankerResponse,
} from '@cfb/core-types'
import createPlugin, { type Plugin } from '@extism/extism'

export type WasmHook = 'on_sort' | 'on_inject'

export interface WasmInvokeOptions {
  /** Run inside a worker thread when the host supports it (`runtime: worker`). */
  useWorker?: boolean
  timeoutMs?: number
  maxMemoryBytes?: number
}

const DEFAULT_TIMEOUT_MS = 50
const DEFAULT_MAX_MEMORY = 8 * 1024 * 1024
const MAX_WASM_BYTES = 2 * 1024 * 1024

const pluginCache = new Map<string, Promise<Plugin>>()

function cacheKey(sha256: string, useWorker: boolean): string {
  return `${sha256}:${useWorker ? 'worker' : 'wasm'}`
}

async function loadPlugin(
  wasmBytes: Uint8Array,
  sha256: string,
  opts: WasmInvokeOptions,
): Promise<Plugin> {
  const key = cacheKey(sha256, opts.useWorker === true)
  const existing = pluginCache.get(key)
  if (existing) return existing

  const pending = createPlugin(wasmBytes, {
    useWasi: true,
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    memory: { maxPages: Math.ceil((opts.maxMemoryBytes ?? DEFAULT_MAX_MEMORY) / 65536) },
    runInWorker: opts.useWorker === true,
  })
  pluginCache.set(key, pending)
  try {
    return await pending
  } catch (err) {
    pluginCache.delete(key)
    throw err
  }
}

export function assertWasmArtifactSize(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) throw new Error('wasm artifact is empty')
  if (bytes.byteLength > MAX_WASM_BYTES) {
    throw new Error(`wasm artifact exceeds ${MAX_WASM_BYTES} byte limit`)
  }
}

export async function invokeWasmJsonHook<T>(
  wasmBytes: Uint8Array,
  sha256: string,
  hook: WasmHook,
  input: unknown,
  opts: WasmInvokeOptions = {},
): Promise<T> {
  assertWasmArtifactSize(wasmBytes)
  const plugin = await loadPlugin(wasmBytes, sha256, opts)
  const out = await plugin.call(hook, JSON.stringify(input))
  if (!out) throw new Error(`wasm hook ${hook} returned no output`)
  const text = out.text()
  return JSON.parse(text) as T
}

export async function invokeWasmRanker(
  wasmBytes: Uint8Array,
  sha256: string,
  request: RemoteRankerRequest,
  useWorker: boolean,
): Promise<string[]> {
  const body = await invokeWasmJsonHook<RemoteRankerResponse>(wasmBytes, sha256, 'on_sort', request, {
    useWorker,
  })
  if (!Array.isArray(body.uris)) return request.candidates
  return body.uris.filter((u: unknown): u is string => typeof u === 'string' && u.startsWith('at://'))
}

export async function invokeWasmInjector(
  wasmBytes: Uint8Array,
  sha256: string,
  request: RemoteInjectorRequest,
  useWorker: boolean,
): Promise<string[]> {
  const body = await invokeWasmJsonHook<RemoteInjectorResponse>(wasmBytes, sha256, 'on_inject', request, {
    useWorker,
  })
  if (!Array.isArray(body.uris)) return []
  return body.uris.filter((u: unknown): u is string => typeof u === 'string' && u.startsWith('at://'))
}

/** Drop cached module (e.g. after artifact upload). */
export function evictWasmCache(sha256: string): void {
  pluginCache.delete(cacheKey(sha256, false))
  pluginCache.delete(cacheKey(sha256, true))
}

export { MAX_WASM_BYTES }
