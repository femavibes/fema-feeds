import type { SignalEntry, SignalType } from './types.js'

/** Composite key for signal counters. */
function key(type: SignalType, value: string): string {
  return `${type}\x00${value}`
}

function parseKey(k: string): { type: SignalType; value: string } {
  const i = k.indexOf('\x00')
  return { type: k.slice(0, i) as SignalType, value: k.slice(i + 1) }
}

export interface CounterSnapshot {
  entries: Array<{ type: SignalType; value: string; count: number }>
  totalPosts: number
}

/**
 * In-memory signal counter. Used for both firehose baseline (global)
 * and can be used for pool signals before batch flush.
 */
export class SignalCounter {
  private counts = new Map<string, number>()
  private _totalPosts = 0

  get totalPosts(): number {
    return this._totalPosts
  }

  get size(): number {
    return this.counts.size
  }

  /** Record signals from one post. */
  record(signals: SignalEntry[]): void {
    this._totalPosts++
    // Dedupe within a single post (same signal appearing twice in one post counts once)
    const seen = new Set<string>()
    for (const s of signals) {
      const k = key(s.type, s.value)
      if (seen.has(k)) continue
      seen.add(k)
      this.counts.set(k, (this.counts.get(k) ?? 0) + 1)
    }
  }

  /** Get top-K entries by count. */
  topK(k: number): CounterSnapshot['entries'] {
    const arr = Array.from(this.counts.entries())
      .map(([k, count]) => ({ ...parseKey(k), count }))
      .sort((a, b) => b.count - a.count)
    return arr.slice(0, k)
  }

  /** Get all entries (for pool flush). */
  all(): CounterSnapshot['entries'] {
    return Array.from(this.counts.entries()).map(([k, count]) => ({ ...parseKey(k), count }))
  }

  /** Export snapshot and reset. */
  flush(): CounterSnapshot {
    const snapshot: CounterSnapshot = {
      entries: this.all(),
      totalPosts: this._totalPosts,
    }
    this.counts.clear()
    this._totalPosts = 0
    return snapshot
  }

  /** Reset without returning data. */
  reset(): void {
    this.counts.clear()
    this._totalPosts = 0
  }
}

/**
 * Keyed counter set — accumulates signals per key (projectId or feedId) before periodic DB flush.
 */
export class PoolCounterSet {
  private counters = new Map<string, SignalCounter>()

  getOrCreate(key: string): SignalCounter {
    let c = this.counters.get(key)
    if (!c) {
      c = new SignalCounter()
      this.counters.set(key, c)
    }
    return c
  }

  /** Flush all counters, returning per-key snapshots. */
  flushAll(): Map<string, CounterSnapshot> {
    const result = new Map<string, CounterSnapshot>()
    for (const [key, counter] of this.counters) {
      if (counter.totalPosts > 0) {
        result.set(key, counter.flush())
      }
    }
    return result
  }

  get keys(): string[] {
    return Array.from(this.counters.keys())
  }
}
