import type { Pool } from 'pg'
import type { NormalizedPost } from '@cfb/core-types'
import type { IntelligenceConfig } from './types.js'
import { DEFAULT_INTELLIGENCE_CONFIG } from './types.js'
import { extractSignals } from './extract.js'
import { SignalCounter, PoolCounterSet } from './counters.js'
import { ensureIntelligenceTables, flushPoolSignals, flushFirehoseBaseline, pruneOldSignals } from './storage.js'

export interface FeedIntelligenceOptions {
  pool: Pool
  config?: Partial<IntelligenceConfig>
}

/**
 * Main feed intelligence engine.
 * Call recordPoolPost() for posts entering the pool.
 * Call maybeSampleFirehose() for every firehose post (handles sampling internally).
 * Call start()/stop() to manage the flush timer.
 */
export class FeedIntelligence {
  private pool: Pool
  private config: IntelligenceConfig
  private firehoseCounter = new SignalCounter()
  private poolCounters = new PoolCounterSet()
  private feedCounters = new PoolCounterSet()
  private disabledProjects = new Set<string>()
  private sampleIdx = 0
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private initialized = false

  constructor(opts: FeedIntelligenceOptions) {
    this.pool = opts.pool
    this.config = { ...DEFAULT_INTELLIGENCE_CONFIG, ...opts.config }
  }

  /** Ensure tables exist and start flush timer. */
  async start(): Promise<void> {
    if (!this.initialized) {
      await ensureIntelligenceTables(this.pool)
      this.initialized = true
    }
    if (!this.flushTimer) {
      this.flushTimer = setInterval(() => { void this.flush() }, this.config.flushIntervalMs)
    }
  }

  /** Stop flush timer and do a final flush. */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    await this.flush()
  }

  /**
   * Record signals from a post that entered the pool.
   * Called after L1 pass. Non-blocking in-memory operation.
   */
  recordPoolPost(post: NormalizedPost, projectIds: string[]): void {
    if (!this.config.enabled) return
    const signals = extractSignals(post, this.config.language)
    for (const pid of projectIds) {
      if (this.disabledProjects.has(pid)) continue
      this.poolCounters.getOrCreate(pid).record(signals)
    }
  }

  /**
   * Record signals from a post that matched a feed's L2 rules.
   * Called after processPostForFeeds. More focused than pool-level.
   */
  recordFeedPost(post: NormalizedPost, feedIds: string[]): void {
    if (!this.config.enabled) return
    const signals = extractSignals(post, this.config.language)
    for (const fid of feedIds) {
      this.feedCounters.getOrCreate(`feed:${fid}`).record(signals)
    }
  }

  /**
   * Maybe sample a firehose post for baseline.
   * Called for every post before L1 eval. Samples 1-in-N.
   * Non-blocking in-memory operation.
   */
  maybeSampleFirehose(post: NormalizedPost): void {
    if (!this.config.enabled) return
    this.sampleIdx++
    if (this.sampleIdx % this.config.sampleRate !== 0) return
    const signals = extractSignals(post, this.config.language)
    this.firehoseCounter.record(signals)
  }

  /** Disable intelligence for a specific project. */
  disableProject(projectId: string): void {
    this.disabledProjects.add(projectId)
  }

  /** Enable intelligence for a specific project. */
  enableProject(projectId: string): void {
    this.disabledProjects.delete(projectId)
  }

  /** Update config (e.g. from settings reload). */
  updateConfig(config: Partial<IntelligenceConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /** Flush in-memory counters to Postgres. */
  async flush(): Promise<{ poolFlushed: number; feedFlushed: number; firehoseFlushed: number }> {
    let poolFlushed = 0
    let feedFlushed = 0
    let firehoseFlushed = 0

    // Flush pool counters (keyed by projectId)
    const poolSnapshots = this.poolCounters.flushAll()
    for (const [projectId, snapshot] of poolSnapshots) {
      await flushPoolSignals(this.pool, projectId, snapshot).catch(() => {})
      poolFlushed += snapshot.entries.length
    }

    // Flush feed counters (keyed by "feed:feedId")
    const feedSnapshots = this.feedCounters.flushAll()
    for (const [key, snapshot] of feedSnapshots) {
      await flushPoolSignals(this.pool, key, snapshot).catch(() => {})
      feedFlushed += snapshot.entries.length
    }

    // Flush firehose baseline (top 10k)
    if (this.firehoseCounter.totalPosts > 0) {
      const snapshot = this.firehoseCounter.flush()
      await flushFirehoseBaseline(this.pool, snapshot).catch(() => {})
      firehoseFlushed = snapshot.entries.length
    }

    // Prune old data periodically (piggyback on flush)
    await pruneOldSignals(this.pool, this.config.windowDays).catch(() => {})

    return { poolFlushed, feedFlushed, firehoseFlushed }
  }

  /** Get current stats for status endpoint. */
  getStats(): { firehoseSampled: number; poolKeys: number; feedKeys: number } {
    return {
      firehoseSampled: this.firehoseCounter.totalPosts,
      poolKeys: this.poolCounters.keys.length,
      feedKeys: this.feedCounters.keys.length,
    }
  }
}
