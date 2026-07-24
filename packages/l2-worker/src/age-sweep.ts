import type { FeedConfig } from '@cfb/core-types'
import type pg from 'pg'
import { exprUsesField } from '@cfb/l2-eval'
import { getAgeSweepPostUris, purgeExpiredFeedCandidates } from '@cfb/storage-postgres'
import { reevalPostInPool } from './reeval-post.js'
import { resolveFeedSortPack } from './sort-pack-eval.js'

const DEFAULT_TICK_MS = 60_000
const BATCH_LIMIT = 500

export interface AgeSweepStats {
  ticks: number
  reevaled: number
  expiredPurged: number
  errors: number
}

const TIME_AGE_FIELDS = ['post_age_hours', 'post_created_hours'] as const

function exprUsesTimeAge(expr: NonNullable<FeedConfig['rank']>['sortKey']): boolean {
  if (!expr) return false
  return TIME_AGE_FIELDS.some((field) => exprUsesField(expr, field))
}

/**
 * Feeds whose (resolved) sort formula references post_age_hours or post_created_hours.
 * Only these pay for time-based re-evals — everything else has a
 * time-invariant sort_key and needs no sweep.
 */
async function feedsUsingPostAge(pool: pg.Pool, feeds: FeedConfig[]): Promise<FeedConfig[]> {
  const out: FeedConfig[] = []
  for (const feed of feeds) {
    if (!feed.enabled) continue
    const resolved = await resolveFeedSortPack(pool, feed).catch(() => feed)
    const expr = resolved.rank?.sortKey
    if (expr && exprUsesTimeAge(expr)) out.push(feed)
  }
  return out
}

/**
 * Periodic time re-eval, bucketed by post age (young posts refresh often,
 * old posts rarely — see getAgeSweepPostUris). Also purges candidates past
 * their expires_at. Uses the same evaluator as the event-driven path, so
 * formula-builder and tuning-panel age behave identically.
 *
 * Runs independently of the ingest runner — time keeps passing whether or
 * not Jetstream is connected, so this must live with the always-on process.
 */
export function startAgeSweep(
  pool: pg.Pool,
  getFeeds: () => FeedConfig[] | Promise<FeedConfig[]>,
  intervalMs: number = DEFAULT_TICK_MS,
): { stop: () => void; getStats: () => AgeSweepStats } {
  const stats: AgeSweepStats = { ticks: 0, reevaled: 0, expiredPurged: 0, errors: 0 }
  let running = false

  async function tick() {
    if (running) return
    running = true
    try {
      stats.ticks++
      const feeds = await getFeeds()

      const purged = await purgeExpiredFeedCandidates(pool)
      stats.expiredPurged += purged

      const ageFeeds = await feedsUsingPostAge(pool, feeds)
      if (ageFeeds.length === 0) return

      const uris = await getAgeSweepPostUris(pool, ageFeeds.map((f) => f.feedId), BATCH_LIMIT)
      for (const uri of uris) {
        try {
          await reevalPostInPool(pool, uri, feeds)
          stats.reevaled++
        } catch {
          stats.errors++
        }
      }
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => {
    void tick().catch(() => { stats.errors++ })
  }, intervalMs)
  // Never keep the process alive just for the sweep (test runs, CLI exits)
  timer.unref?.()

  return {
    stop: () => clearInterval(timer),
    getStats: () => stats,
  }
}
