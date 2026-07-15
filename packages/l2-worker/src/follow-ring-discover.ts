import type { FollowRingFilterConfig, NormalizedPost } from '@cfb/core-types'
import { isViewerFollowRing } from '@cfb/core-types'
import type pg from 'pg'
import { getAuthorListCache } from '@cfb/storage-postgres'
import { followRingCacheListId } from './follow-ring-cache.js'

/** Tracks rotation offset per ring node for round-robin author selection. */
const ringOffsets = new Map<string, number>()

export interface FollowRingDiscoverResult {
  fetched: number
  newPosts: NormalizedPost[]
}

/**
 * Returns true if this follow ring config is in discover mode and valid.
 */
export function isDiscoverRing(cfg: FollowRingFilterConfig): boolean {
  return cfg.role === 'discover' && !isViewerFollowRing(cfg.hubSource)
}

/**
 * Fetch recent posts from ring members via getAuthorFeed API.
 * Returns normalized posts not already in the pool.
 */
export async function discoverFromRing(
  pool: pg.Pool,
  nodeId: string,
  cfg: FollowRingFilterConfig,
  isInPool: (uri: string) => Promise<boolean>,
  options?: { limit?: number },
): Promise<FollowRingDiscoverResult> {
  if (!isDiscoverRing(cfg)) return { fetched: 0, newPosts: [] }

  const cached = await getAuthorListCache(pool, followRingCacheListId(nodeId))
  if (!cached || cached.dids.length === 0) return { fetched: 0, newPosts: [] }

  const limit = options?.limit ?? 5
  // Rotate through ring members
  const offset = ringOffsets.get(nodeId) ?? 0
  const dids: string[] = []
  for (let i = 0; i < limit && i < cached.dids.length; i++) {
    dids.push(cached.dids[(offset + i) % cached.dids.length]!)
  }
  ringOffsets.set(nodeId, (offset + limit) % cached.dids.length)

  const newPosts: NormalizedPost[] = []
  let fetched = 0

  for (const did of dids) {
    const posts = await fetchAuthorRecentPosts(did)
    fetched += posts.length
    for (const post of posts) {
      if (!(await isInPool(post.uri))) {
        newPosts.push(post)
      }
    }
  }

  return { fetched, newPosts }
}

/**
 * Fetch an author's recent posts via Bluesky public API.
 */
async function fetchAuthorRecentPosts(
  did: string,
  limit = 10,
): Promise<NormalizedPost[]> {
  try {
    const res = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&limit=${limit}&filter=posts_no_replies`,
    )
    if (!res.ok) return []
    const data = await res.json() as {
      feed?: Array<{ post: { uri: string; cid: string; author?: { did: string }; record?: Record<string, unknown>; indexedAt?: string } }>
    }
    if (!data.feed?.length) return []

    const { normalizeJetstreamPost } = await import('@cfb/post-normalize')
    return data.feed
      .filter((item) => item.post?.record)
      .map((item) => normalizeJetstreamPost({
        uri: item.post.uri,
        cid: item.post.cid,
        author: item.post.author?.did ?? '',
        record: item.post.record as import('@cfb/post-normalize').JetstreamPostEvent['record'],
        time: item.post.indexedAt,
      }))
  } catch {
    return []
  }
}
