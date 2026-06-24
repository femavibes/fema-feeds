import type { FeedConfig } from '@cfb/core-types'
import { applyRankerToSkeleton } from '@cfb/feed-rank'
import { fetchViewerFollowedDids } from '@cfb/viewer-graph'
import type pg from 'pg'
import {
  getPluginPackageById,
  loadRankerCandidates,
  loadViewerContext,
} from '@cfb/storage-postgres'
import type { SkeletonPost } from '@cfb/storage-postgres'
import { wasmArtifactForPlugin } from './plugin-artifact.js'

export async function applyFeedRanker(
  pool: pg.Pool,
  config: FeedConfig,
  organic: SkeletonPost[],
  limit: number,
  viewerDid?: string,
): Promise<SkeletonPost[]> {
  const rankerRef = config.rank?.rankerRef
  if (!rankerRef?.packageId) return organic

  const pkg = await getPluginPackageById(pool, rankerRef.packageId, rankerRef.versionPin)
  if (!pkg || pkg.kind !== 'ranker') return organic

  const uris = organic.map((row) => row.post)
  let candidatePosts: Awaited<ReturnType<typeof loadRankerCandidates>> | undefined

  if (pkg.runtime === 'remote' || pkg.runtime === 'wasm' || pkg.runtime === 'worker') {
    try {
      candidatePosts = await loadRankerCandidates(pool, uris)
    } catch {
      candidatePosts = undefined
    }
  }

  let viewer
  if (viewerDid && candidatePosts?.length) {
    try {
      const authorDids = [...new Set(candidatePosts.map((p) => p.authorDid))]
      viewer = await loadViewerContext(pool, {
        viewerDid,
        feedId: config.feedId,
        candidateAuthorDids: authorDids,
        fetchFollows: fetchViewerFollowedDids,
      })
    } catch {
      viewer = undefined
    }
  }

  try {
    const wasm = await wasmArtifactForPlugin(pool, pkg, rankerRef.versionPin)
    return await applyRankerToSkeleton(organic, {
      feedId: config.feedId,
      limit,
      ranker: rankerRef,
      pkg,
      wasmBytes: wasm?.wasmBytes,
      wasmSha256: wasm?.wasmSha256,
      candidatePosts,
      viewerDid,
      viewer,
    })
  } catch {
    return organic
  }
}
