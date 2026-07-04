import type pg from 'pg'
import { setPostEngagement, getPoolPostsForEngagementRefresh, getStaleFeedCandidateUris, countStaleFeedCandidates } from '@cfb/storage-postgres'

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

export interface EngagementCatchUpResult {
  postsRefreshed: number
  batches: number
  errors: number
}

// --- Background job tracking ---

export interface EngagementRefreshProgress {
  active: boolean
  scope: string // projectId or '__all__'
  total: number
  refreshed: number
  errors: number
  startedAt: string
  finishedAt: string | null
}

const activeJobs = new Map<string, EngagementRefreshProgress>()

export function getEngagementRefreshStatus(scope: string): EngagementRefreshProgress | null {
  return activeJobs.get(scope) ?? null
}

export function clearEngagementRefreshStatus(scope: string): void {
  activeJobs.delete(scope)
}

/**
 * Start a background engagement refresh. Returns immediately.
 * Poll getEngagementRefreshStatus(scope) for progress.
 */
export function startBackgroundEngagementRefresh(
  pool: pg.Pool,
  feedIds: string[],
  options: { scope: string; staleMinutes?: number; delayMs?: number },
): EngagementRefreshProgress {
  const scope = options.scope
  const existing = activeJobs.get(scope)
  if (existing?.active) return existing

  const progress: EngagementRefreshProgress = {
    active: true,
    scope,
    total: 0,
    refreshed: 0,
    errors: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  }
  activeJobs.set(scope, progress)

  void runBackgroundRefresh(pool, feedIds, options, progress).catch((err) => {
    console.error(`[engagement-refresh] background job failed for ${scope}:`, err)
    progress.active = false
    progress.finishedAt = new Date().toISOString()
  })

  return progress
}

async function runBackgroundRefresh(
  pool: pg.Pool,
  feedIds: string[],
  options: { staleMinutes?: number; delayMs?: number },
  progress: EngagementRefreshProgress,
): Promise<void> {
  const staleMinutes = options.staleMinutes ?? 60
  const delayMs = options.delayMs ?? 200
  const maxRetries = 3 // give up on a batch after this many consecutive empty responses

  // Count total stale posts for progress bar
  progress.total = await countStaleFeedCandidates(pool, feedIds, staleMinutes)

  let consecutiveEmpty = 0

  for (;;) {
    const uris = await getStaleFeedCandidateUris(pool, feedIds, staleMinutes, BATCH_SIZE)
    if (uris.length === 0) break
    try {
      const views = await fetchEngagementFromBsky(uris)
      if (views.length === 0) {
        // Bluesky returned nothing — these posts are likely deleted/blocked.
        // Touch their updated_at so we don't loop forever.
        for (const uri of uris) {
          await setPostEngagement(pool, uri, { likeCount: 0, repostCount: 0, replyCount: 0, quoteCount: 0 })
        }
        consecutiveEmpty++
        if (consecutiveEmpty >= maxRetries) break
      } else {
        consecutiveEmpty = 0
        // Update posts that Bluesky returned
        const returnedUris = new Set(views.map(v => v.uri))
        for (const view of views) {
          await setPostEngagement(pool, view.uri, {
            likeCount: view.likeCount ?? 0,
            repostCount: view.repostCount ?? 0,
            replyCount: view.replyCount ?? 0,
            quoteCount: view.quoteCount ?? 0,
          })
          progress.refreshed++
        }
        // Posts we asked for but Bluesky didn't return — mark them so we don't loop
        for (const uri of uris) {
          if (!returnedUris.has(uri)) {
            await setPostEngagement(pool, uri, { likeCount: 0, repostCount: 0, replyCount: 0, quoteCount: 0 })
            progress.refreshed++
          }
        }
      }
    } catch {
      progress.errors++
      // On error, still mark these URIs to avoid infinite loop
      for (const uri of uris) {
        try {
          await setPostEngagement(pool, uri, { likeCount: 0, repostCount: 0, replyCount: 0, quoteCount: 0 })
        } catch { /* best effort */ }
      }
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
  }

  progress.active = false
  progress.finishedAt = new Date().toISOString()
}

/**
 * Synchronous catch-up (for startup / CLI). Blocks until done.
 */
export async function catchUpFeedEngagement(
  pool: pg.Pool,
  feedIds: string[],
  options: { staleMinutes?: number; delayMs?: number } = {},
): Promise<EngagementCatchUpResult> {
  const staleMinutes = options.staleMinutes ?? 60
  const delayMs = options.delayMs ?? 200
  const result: EngagementCatchUpResult = { postsRefreshed: 0, batches: 0, errors: 0 }

  for (;;) {
    const uris = await getStaleFeedCandidateUris(pool, feedIds, staleMinutes, BATCH_SIZE)
    if (uris.length === 0) break
    result.batches++
    try {
      const views = await fetchEngagementFromBsky(uris)
      const returnedUris = new Set(views.map(v => v.uri))
      for (const view of views) {
        await setPostEngagement(pool, view.uri, {
          likeCount: view.likeCount ?? 0,
          repostCount: view.repostCount ?? 0,
          replyCount: view.replyCount ?? 0,
          quoteCount: view.quoteCount ?? 0,
        })
        result.postsRefreshed++
      }
      // Mark missing posts so we don't loop forever
      for (const uri of uris) {
        if (!returnedUris.has(uri)) {
          await setPostEngagement(pool, uri, { likeCount: 0, repostCount: 0, replyCount: 0, quoteCount: 0 })
          result.postsRefreshed++
        }
      }
    } catch {
      result.errors++
      for (const uri of uris) {
        try {
          await setPostEngagement(pool, uri, { likeCount: 0, repostCount: 0, replyCount: 0, quoteCount: 0 })
        } catch { /* best effort */ }
      }
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
  }
  return result
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
