/**
 * Process-local TTL cache for huge DID arrays (author lists / follow rings).
 * Reloading 10k–50k DID rows from Postgres on every matched post ballooned ingest RSS.
 */

type Entry = { at: number; dids: string[]; set: ReadonlySet<string> }

const DEFAULT_TTL_MS = Math.max(
  5_000,
  Number(process.env.CFB_DID_LIST_CACHE_TTL_MS ?? 60_000) || 60_000,
)

const cache = new Map<string, Entry>()

export function getCachedDidList(
  key: string,
  ttlMs = DEFAULT_TTL_MS,
): { dids: string[]; set: ReadonlySet<string> } | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at >= ttlMs) {
    cache.delete(key)
    return null
  }
  return { dids: hit.dids, set: hit.set }
}

export function setCachedDidList(key: string, dids: string[]): {
  dids: string[]
  set: ReadonlySet<string>
} {
  const entry: Entry = { at: Date.now(), dids, set: new Set(dids) }
  cache.set(key, entry)
  return { dids: entry.dids, set: entry.set }
}

export function invalidateDidListCache(key?: string): void {
  if (key) cache.delete(key)
  else cache.clear()
}
