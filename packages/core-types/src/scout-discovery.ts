/** Scout discovery: community engagement signals for content discovery. */

export type ScoutSource = 'top_pool_authors' | 'top_engagers'

export type ScoutThresholdCurve = 'linear' | 'curved'

export interface ScoutAutoDeriveConfig {
  source: ScoutSource
  count: number
  /** How often to refresh the auto-derived scout list (minutes). Default 360. */
  refreshIntervalMinutes?: number
}

export interface ScoutThresholdConfig {
  /** Minimum distinct scouts needed (fastest possible trigger). */
  min: number
  /** Always triggers at this count regardless of timing. */
  max: number
  /** Time (minutes) over which required count climbs from min → max. */
  scaleWindowMinutes: number
  /** Scaling curve shape. Default 'linear'. */
  curve: ScoutThresholdCurve
  /** Exponent for curved scaling. Default 1.5. */
  exponent?: number
}

export interface ScoutDiscoveryConfig {
  enabled: boolean
  /** Manually specified scout DIDs. */
  scouts?: string[]
  /** Cached author list id — members are unioned with manual scouts. */
  listId?: string
  /** Auto-derive scouts from pool data. */
  autoDerive?: ScoutAutoDeriveConfig
  threshold: ScoutThresholdConfig
  /** Drop signals for posts older than this (hours). Default 48. */
  maxPostAgeHours?: number
  /** Maximum pending signal entries to track in memory. Default 10000. */
  maxPendingSignals?: number
}

export type ScoutInteractionType = 'like' | 'repost' | 'reply'

export interface ScoutSignal {
  scoutDid: string
  targetUri: string
  interaction: ScoutInteractionType
  timestamp: number
}
