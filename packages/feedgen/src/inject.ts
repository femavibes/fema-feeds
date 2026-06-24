import type { FeedConfig } from '@cfb/core-types'
import { applyInjectorToSkeleton } from '@cfb/feed-inject'
import type pg from 'pg'
import { getPluginPackageById } from '@cfb/storage-postgres'
import type { SkeletonPost } from '@cfb/storage-postgres'
import { wasmArtifactForPlugin } from './plugin-artifact.js'

export async function applyFeedInjector(
  pool: pg.Pool,
  config: FeedConfig,
  organic: SkeletonPost[],
  limit: number,
): Promise<SkeletonPost[]> {
  const injector = config.injector
  if (!injector?.packageId) return organic

  const pkg = await getPluginPackageById(pool, injector.packageId, injector.versionPin)
  if (!pkg || pkg.kind !== 'injector') return organic

  try {
    const wasm = await wasmArtifactForPlugin(pool, pkg, injector.versionPin)
    return await applyInjectorToSkeleton(organic, {
      feedId: config.feedId,
      limit,
      injector,
      pkg,
      wasmBytes: wasm?.wasmBytes,
      wasmSha256: wasm?.wasmSha256,
    })
  } catch {
    return organic
  }
}
