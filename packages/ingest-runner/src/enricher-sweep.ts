import type pg from 'pg'
import type { EnricherConfig, PluginPackage, RemoteEnricherRequest, RemoteEnricherResponse } from '@cfb/core-types'
import {
  getIngestedPost,
  listUnenrichedPostUris,
  normalizedPostFromRow,
  upsertPostEnrichmentsBatch,
} from '@cfb/storage-postgres'

export interface EnricherSweepConfig {
  /** Enricher package metadata. */
  package: PluginPackage
  /** Per-project config. */
  config: EnricherConfig
  /** Project ID (for scoped enrichers). */
  projectId?: string
}

export interface EnricherSweepStats {
  enricherId: string
  processed: number
  skipped: number
  errors: number
  lastRunAt: string | null
}

export interface EnricherSweepResult {
  enricherId: string
  processed: number
  skipped: number
  errors: number
  durationMs: number
}

/**
 * Run one sweep cycle for a single enricher.
 * Finds un-enriched posts, batches them, calls the enricher, writes results.
 */
export async function runEnricherSweep(
  pool: pg.Pool,
  config: EnricherSweepConfig,
  options: { batchSize?: number; maxBatches?: number } = {},
): Promise<EnricherSweepResult> {
  const startMs = Date.now()
  const enricherId = config.package.id
  const version = config.config.versionPin
  const batchSize = options.batchSize ?? config.package.manifest?.configSchema?.batchSize as number ?? 50
  const maxBatches = options.maxBatches ?? 10

  let processed = 0
  let skipped = 0
  let errors = 0

  for (let batch = 0; batch < maxBatches; batch++) {
    // Find posts that need enrichment
    const uris = await listUnenrichedPostUris(pool, enricherId, batchSize, config.projectId)
    if (uris.length === 0) break

    // Load full post data
    const posts = await Promise.all(
      uris.map(async (uri) => {
        const row = await getIngestedPost(pool, uri)
        return row ? normalizedPostFromRow(row) : null
      }),
    )
    const validPosts = posts.filter(Boolean) as NonNullable<typeof posts[number]>[]
    if (validPosts.length === 0) break

    // Call the enricher
    try {
      const results = await callEnricher(config, validPosts, pool)

      // Write results
      const toWrite = results
        .filter((r) => !r.skipped && !r.error)
        .map((r) => ({
          postUri: r.uri,
          enricherId,
          version,
          data: r.data,
        }))

      if (toWrite.length > 0) {
        await upsertPostEnrichmentsBatch(pool, toWrite)
      }

      processed += results.filter((r) => !r.skipped && !r.error).length
      skipped += results.filter((r) => r.skipped).length
      errors += results.filter((r) => r.error).length
    } catch (err) {
      errors += validPosts.length
      console.error(`[enricher-sweep] ${enricherId} batch error:`, err instanceof Error ? err.message : err)
    }
  }

  return {
    enricherId,
    processed,
    skipped,
    errors,
    durationMs: Date.now() - startMs,
  }
}

async function callEnricher(
  config: EnricherSweepConfig,
  posts: Array<{ uri: string; text: string; authorDid: string; indexedAt: string; langs: string[]; embed: any }>,
  _pool: pg.Pool,
): Promise<RemoteEnricherResponse['results']> {
  const pkg = config.package

  if (pkg.runtime === 'remote') {
    return callRemoteEnricher(pkg, config, posts)
  }

  if (pkg.runtime === 'wasm' || pkg.runtime === 'worker') {
    // WASM enrichers would be loaded and called here
    // For now, return empty (not yet implemented)
    console.warn(`[enricher-sweep] WASM/worker enrichers not yet implemented: ${pkg.id}`)
    return posts.map((p) => ({ uri: p.uri, data: {}, skipped: true }))
  }

  // Native enrichers (future)
  return posts.map((p) => ({ uri: p.uri, data: {}, skipped: true }))
}

async function callRemoteEnricher(
  pkg: PluginPackage,
  config: EnricherSweepConfig,
  posts: Array<{ uri: string; text: string; authorDid: string; indexedAt: string; langs: string[]; embed: any }>,
): Promise<RemoteEnricherResponse['results']> {
  const endpoint = pkg.remoteEndpoint
  if (!endpoint) {
    throw new Error(`Remote enricher ${pkg.id} has no endpoint configured`)
  }

  const body: RemoteEnricherRequest = {
    enricherId: pkg.id,
    version: config.config.versionPin,
    posts: posts.map((p) => ({
      uri: p.uri,
      text: p.text,
      authorDid: p.authorDid,
      indexedAt: p.indexedAt,
      langs: p.langs,
      embed: p.embed,
    })),
    config: config.config.config,
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    throw new Error(`Remote enricher ${pkg.id} returned ${res.status}: ${await res.text().catch(() => '')}`)
  }

  const json = await res.json() as RemoteEnricherResponse
  return json.results ?? []
}

/**
 * Sweep timer: runs enricher sweeps periodically.
 * Call start() to begin, stop() to halt.
 */
export function createEnricherSweepTimer(
  pool: pg.Pool,
  options: {
    getConfigs: () => Promise<EnricherSweepConfig[]>
    intervalMs?: number
  },
): { start: () => void; stop: () => void; getStats: () => Map<string, EnricherSweepStats> } {
  const intervalMs = options.intervalMs ?? 60_000
  let timer: ReturnType<typeof setInterval> | null = null
  const stats = new Map<string, EnricherSweepStats>()
  let running = false

  async function sweep() {
    if (running) return
    running = true
    try {
      const configs = await options.getConfigs()
      for (const config of configs) {
        if (!config.config.enabled) continue
        const result = await runEnricherSweep(pool, config)
        stats.set(config.package.id, {
          enricherId: config.package.id,
          processed: (stats.get(config.package.id)?.processed ?? 0) + result.processed,
          skipped: (stats.get(config.package.id)?.skipped ?? 0) + result.skipped,
          errors: (stats.get(config.package.id)?.errors ?? 0) + result.errors,
          lastRunAt: new Date().toISOString(),
        })
      }
    } catch (err) {
      console.error('[enricher-sweep] sweep error:', err instanceof Error ? err.message : err)
    } finally {
      running = false
    }
  }

  return {
    start: () => {
      if (timer) return
      void sweep()
      timer = setInterval(() => void sweep(), intervalMs)
    },
    stop: () => {
      if (timer) { clearInterval(timer); timer = null }
    },
    getStats: () => stats,
  }
}
