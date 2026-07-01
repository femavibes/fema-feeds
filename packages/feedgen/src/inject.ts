import type { FeedConfig, NativeInjectorConfig, NativePinnedInjector, NativeRotatingInjector } from '@cfb/core-types'
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
  viewerDid?: string,
): Promise<SkeletonPost[]> {
  let result = organic

  // 1. Apply native injectors (pinned + rotating)
  if (config.nativeInjectors?.length) {
    result = applyNativeInjectors(result, config.nativeInjectors, limit)
  }

  // 2. Apply custom code injector (WASM/remote)
  const injector = config.injector
  if (injector?.packageId) {
    const pkg = await getPluginPackageById(pool, injector.packageId, injector.versionPin)
    if (pkg && pkg.kind === 'injector') {
      try {
        const wasm = await wasmArtifactForPlugin(pool, pkg, injector.versionPin)
        result = await applyInjectorToSkeleton(result, {
          feedId: config.feedId,
          limit,
          injector,
          pkg,
          wasmBytes: wasm?.wasmBytes,
          wasmSha256: wasm?.wasmSha256,
        })
      } catch {
        /* custom injector failure must not break skeleton serve */
      }
    }
  }

  return result.slice(0, limit)
}

function applyNativeInjectors(
  organic: SkeletonPost[],
  injectors: NativeInjectorConfig[],
  limit: number,
): SkeletonPost[] {
  let result = [...organic]

  for (const inj of injectors) {
    if (inj.type === 'pinned') {
      result = applyPinnedInjector(result, inj, limit)
    } else if (inj.type === 'rotating') {
      result = applyRotatingInjector(result, inj, limit)
    }
  }

  return result
}

function applyPinnedInjector(
  posts: SkeletonPost[],
  config: NativePinnedInjector,
  limit: number,
): SkeletonPost[] {
  const now = Date.now()
  const result = [...posts]

  for (const pinned of config.posts) {
    // Check expiry
    if (pinned.expiresAt && Date.parse(pinned.expiresAt) < now) continue

    // Don't inject duplicates
    if (result.some((p) => p.post === pinned.uri)) continue

    // Insert at position (clamped to array bounds)
    const pos = Math.min(pinned.position, result.length)
    result.splice(pos, 0, { post: pinned.uri })
  }

  return result.slice(0, limit)
}

function applyRotatingInjector(
  posts: SkeletonPost[],
  config: NativeRotatingInjector,
  limit: number,
): SkeletonPost[] {
  const now = Date.now()

  // Check expiry
  if (config.expiresAt && Date.parse(config.expiresAt) < now) return posts
  if (config.pool.length === 0) return posts

  const result = [...posts]
  let injected = 0
  const maxInject = config.maxPerPage

  // Pick posts from pool based on rotation strategy
  const poolUris = pickFromPool(config.pool, config.rotation, maxInject)

  // Insert at intervals
  let organicCount = 0
  let poolIdx = 0
  const final: SkeletonPost[] = []

  for (const post of result) {
    final.push(post)
    organicCount++

    if (organicCount % config.interval === 0 && injected < maxInject && poolIdx < poolUris.length) {
      const uri = poolUris[poolIdx]!
      // Don't inject duplicates
      if (!final.some((p) => p.post === uri)) {
        final.push({ post: uri })
        injected++
      }
      poolIdx++
    }
  }

  return final.slice(0, limit)
}

function pickFromPool(
  pool: string[],
  rotation: 'round-robin' | 'random' | 'least-shown',
  count: number,
): string[] {
  if (pool.length === 0) return []

  switch (rotation) {
    case 'random': {
      const shuffled = [...pool].sort(() => Math.random() - 0.5)
      return shuffled.slice(0, count)
    }
    case 'least-shown':
      // Without viewer impression data at this level, fall through to round-robin
      // (impression-aware rotation would need viewer context passed in)
      return pool.slice(0, count)
    case 'round-robin':
    default:
      // Simple: take first N (stateless — true round-robin would need cursor state)
      return pool.slice(0, count)
  }
}
