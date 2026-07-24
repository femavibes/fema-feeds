import type { FeedConfig } from '@cfb/core-types'
import type pg from 'pg'
import { listFeedCandidatePostUris } from '@cfb/storage-postgres'
import { reevalPostInPool } from './reeval-post.js'

const BATCH_SIZE = 200

export interface RescoreProgress {
  active: boolean
  feedId: string
  processed: number
  total: number
  startedAt: string
  finishedAt: string | null
}

const activeRescores = new Map<string, RescoreProgress>()

export function getRescoreStatus(feedId: string): RescoreProgress | null {
  return activeRescores.get(feedId) ?? null
}

/**
 * Recompute sort_key for posts already in feed_candidates — lighter than a full pool reeval.
 * New ingest uses live rank immediately; this refreshes existing candidates.
 */
export function startBackgroundRescoreCandidates(pool: pg.Pool, feed: FeedConfig): void {
  const feedId = feed.feedId
  if (activeRescores.get(feedId)?.active) return

  const progress: RescoreProgress = {
    active: true,
    feedId,
    processed: 0,
    total: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  }
  activeRescores.set(feedId, progress)

  void runRescore(pool, feed, progress).catch((err) => {
    console.error(`[rescore] failed for ${feedId}:`, err)
    progress.active = false
    progress.finishedAt = new Date().toISOString()
  })
}

async function runRescore(
  pool: pg.Pool,
  feed: FeedConfig,
  progress: RescoreProgress,
): Promise<void> {
  const feedId = feed.feedId
  let cursor: string | undefined
  let processed = 0

  for (;;) {
    if (!progress.active) return

    const batch = await listFeedCandidatePostUris(pool, feedId, BATCH_SIZE, cursor)
    if (progress.total === 0 && batch.length > 0) {
      // Rough total — keep updating as we paginate
      progress.total = batch.length
    }
    if (batch.length === 0) break

    for (const uri of batch) {
      if (!progress.active) return
      await reevalPostInPool(pool, uri, [feed]).catch(() => undefined)
      processed++
      progress.processed = processed
    }

    if (batch.length < BATCH_SIZE) break
    cursor = batch[batch.length - 1]
    progress.total = Math.max(progress.total, processed + BATCH_SIZE)
  }

  progress.active = false
  progress.processed = processed
  progress.total = processed
  progress.finishedAt = new Date().toISOString()
}
