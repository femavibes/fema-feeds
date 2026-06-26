import type pg from 'pg'
import { setPostEngagement, getPoolPostsForEngagementRefresh } from '@cfb/storage-postgres'

const BSKY_PUBLIC_API = process.env.BSKY_PUBLIC_API ?? 'https://public.api.bsky.app'
const BATCH_SIZE = 25 // getPosts max per call

interface PostEngagementView {
  uri: string
  likeCount?: number
  repostCount?: number
  replyCount?: number
  quoteCount?: number
}

async function fetchEngagementFromBsky(postUris: string[]): Promise<PostEngagementView[]> {
  const params = new URLSearchParams()
  for (const uri of postUris) params.append('uris', uri)
  const url = `${BSKY_PUBLIC_API}/xrpc/app.bsky.feed.getPosts?${params}`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = (await res.json()) as { posts?: Array<{ uri: string; likeCount?: number; repostCount?: number; replyCount?: number; quoteCount?: number }> }
  return (data.posts ?? []).map((p) => ({
    uri: p.uri,
    likeCount: p.likeCount ?? 0,
    repostCount: p.repostCount ?? 0,
    replyCount: p.replyCount ?? 0,
    quoteCount: p.quoteCount ?? 0,
  }))
}

/** Backfill engagement for a single post URI from Bluesky public API. */
export async function backfillPostEngagement(pool: pg.Pool, postUri: string): Promise<boolean> {
  try {
    const views = await fetchEngagementFromBsky([postUri])
    const view = views.find((v) => v.uri === postUri)
    if (!view) return false
    await setPostEngagement(pool, postUri, {
      likeCount: view.likeCount ?? 0,
      repostCount: view.repostCount ?? 0,
      replyCount: view.replyCount ?? 0,
      quoteCount: view.quoteCount ?? 0,
    })
    return true
  } catch {
    return false
  }
}

export interface EngagementRefreshStats {
  runs: number
  postsRefreshed: number
  errors: number
}

/** Periodically refresh engagement counts for recent pool posts. */
export function startEngagementRefresh(
  pool: pg.Pool,
  intervalMs: number = 60_000,
  maxAgeHours: number = 48,
): { stop: () => void; getStats: () => EngagementRefreshStats } {
  const stats: EngagementRefreshStats = { runs: 0, postsRefreshed: 0, errors: 0 }

  async function tick() {
    stats.runs++
    try {
      const uris = await getPoolPostsForEngagementRefresh(pool, BATCH_SIZE, maxAgeHours)
      if (uris.length === 0) return
      const views = await fetchEngagementFromBsky(uris)
      for (const view of views) {
        await setPostEngagement(pool, view.uri, {
          likeCount: view.likeCount ?? 0,
          repostCount: view.repostCount ?? 0,
          replyCount: view.replyCount ?? 0,
          quoteCount: view.quoteCount ?? 0,
        })
        stats.postsRefreshed++
      }
    } catch {
      stats.errors++
    }
  }

  const timer = setInterval(() => { void tick() }, intervalMs)
  return {
    stop: () => clearInterval(timer),
    getStats: () => stats,
  }
}
