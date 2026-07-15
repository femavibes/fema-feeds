import type { ScoutDiscoveryConfig, ScoutInteractionType, ScoutThresholdConfig } from '@cfb/core-types'

/** Interaction weight for tiebreaking when multiple posts trigger simultaneously. */
const INTERACTION_WEIGHT: Record<ScoutInteractionType, number> = {
  like: 1.0,
  repost: 1.3,
  reply: 1.2,
}

export interface SignalEntry {
  /** Distinct scouts and their strongest interaction type. */
  scouts: Map<string, ScoutInteractionType>
  firstSignalAt: number
  lastSignalAt: number
}

export interface ScoutTrigger {
  targetUri: string
  distinctScouts: number
  /** Sum of interaction weights — for priority ordering only. */
  weightedScore: number
}

export interface ScoutPersistence {
  /** Called when a new signal is recorded (upsert to DB). */
  onSignal?: (targetUri: string, scoutDid: string, interaction: ScoutInteractionType) => void
  /** Called when a target triggers (delete from DB). */
  onTrigger?: (targetUri: string) => void
  /** Called when signals are swept (delete from DB). */
  onSweep?: (targetUris: string[]) => void
}

/**
 * Computes the required distinct scout count at a given elapsed time.
 */
export function computeRequiredScouts(
  elapsed: number,
  config: ScoutThresholdConfig,
): number {
  const windowMs = config.scaleWindowMinutes * 60_000
  const raw = windowMs > 0 ? Math.min(elapsed / windowMs, 1) : 1
  const progress = config.curve === 'curved'
    ? Math.pow(raw, config.exponent ?? 1.5)
    : raw
  return config.min + (config.max - config.min) * progress
}

/**
 * In-memory co-occurrence counter for scout signals.
 * Tracks interactions per target URI and triggers when threshold is met.
 */
export class ScoutSignalCounter {
  private signals = new Map<string, SignalEntry>()
  private config: ScoutDiscoveryConfig
  private scoutSet: Set<string>
  private poolUriCheck: (uri: string) => boolean
  private persistence?: ScoutPersistence

  constructor(
    config: ScoutDiscoveryConfig,
    scoutDids: string[],
    /** Returns true if URI is already in the pool (skip tracking). */
    poolUriCheck: (uri: string) => boolean,
    persistence?: ScoutPersistence,
  ) {
    this.config = config
    this.scoutSet = new Set(scoutDids)
    this.poolUriCheck = poolUriCheck
    this.persistence = persistence
  }

  /** Load persisted signals (call on startup before processing events). */
  loadSignals(entries: Map<string, { scouts: Map<string, ScoutInteractionType>; firstSignalAt: number; lastSignalAt: number }>): void {
    for (const [uri, entry] of entries) {
      this.signals.set(uri, entry)
    }
  }

  /** Update the scout set (e.g. after auto-derive refresh). */
  updateScouts(dids: string[]): void {
    this.scoutSet = new Set(dids)
  }

  get scoutCount(): number {
    return this.scoutSet.size
  }

  get pendingCount(): number {
    return this.signals.size
  }

  /**
   * Record a signal. Returns a ScoutTrigger if threshold is now met, else null.
   */
  recordSignal(
    actorDid: string,
    targetUri: string,
    interaction: ScoutInteractionType,
    now = Date.now(),
  ): ScoutTrigger | null {
    if (!this.scoutSet.has(actorDid)) return null
    if (this.poolUriCheck(targetUri)) return null

    let entry = this.signals.get(targetUri)
    if (!entry) {
      // Enforce memory cap
      if (this.signals.size >= (this.config.maxPendingSignals ?? 10000)) {
        this.evictOldest()
      }
      entry = { scouts: new Map(), firstSignalAt: now, lastSignalAt: now }
      this.signals.set(targetUri, entry)
    }

    // Only upgrade interaction type if new one has higher weight
    const existing = entry.scouts.get(actorDid)
    if (!existing || INTERACTION_WEIGHT[interaction] > INTERACTION_WEIGHT[existing]) {
      entry.scouts.set(actorDid, interaction)
    }
    entry.lastSignalAt = now

    // Persist signal
    this.persistence?.onSignal?.(targetUri, actorDid, interaction)

    // Check threshold
    const elapsed = now - entry.firstSignalAt
    const required = computeRequiredScouts(elapsed, this.config.threshold)
    if (entry.scouts.size >= required) {
      this.signals.delete(targetUri)
      this.persistence?.onTrigger?.(targetUri)
      return {
        targetUri,
        distinctScouts: entry.scouts.size,
        weightedScore: this.computeWeight(entry),
      }
    }

    return null
  }

  /** Evict signals older than maxPostAgeHours. Returns count evicted. */
  sweep(now = Date.now()): number {
    const maxAge = (this.config.maxPostAgeHours ?? 48) * 3600_000
    let evicted = 0
    const swept: string[] = []
    for (const [uri, entry] of this.signals) {
      if (now - entry.firstSignalAt > maxAge) {
        this.signals.delete(uri)
        swept.push(uri)
        evicted++
      }
    }
    if (swept.length > 0) this.persistence?.onSweep?.(swept)
    return evicted
  }

  private evictOldest(): void {
    let oldestUri: string | null = null
    let oldestTime = Infinity
    for (const [uri, entry] of this.signals) {
      if (entry.firstSignalAt < oldestTime) {
        oldestTime = entry.firstSignalAt
        oldestUri = uri
      }
    }
    if (oldestUri) {
      this.signals.delete(oldestUri)
      this.persistence?.onTrigger?.(oldestUri)
    }
  }

  private computeWeight(entry: SignalEntry): number {
    let total = 0
    for (const interaction of entry.scouts.values()) {
      total += INTERACTION_WEIGHT[interaction]
    }
    return total
  }
}
