/** Conditional purge — post is purgeable when ALL conditions are met. */
export interface PurgeCondition {
  /** Total engagement (likes + reposts + quotes + replies) must be below this */
  maxEngagement?: number
  minLikes?: number
  minReposts?: number
  minReplies?: number
  minQuotes?: number
  /** If true, only purge posts that are NOT in any feed's candidates */
  notInFeed?: boolean
  /** If true, only purge posts that belong to 0 projects (orphaned after project deletion) */
  isOrphan?: boolean
  /** Only purge posts of this kind (root, reply, quote) */
  postKind?: 'reply' | 'quote' | 'root'
  /** If false, only purge posts WITHOUT media. If true, only purge posts WITH media. */
  hasMedia?: boolean
  /** If true, only purge posts that have NSFW labels (porn, sexual, nudity, graphic-media) */
  labeledNsfw?: boolean
  /** If true, only purge text-only posts (no media, no link card, no quote) */
  isTextOnly?: boolean
  /** If true, only purge posts with editor_score <= 0 (deprioritized or neutral) */
  belowEditorScore?: boolean
}

/** A single purge rule: after N hours, optionally with a condition. */
export interface PurgeRule {
  afterHours: number
  condition?: PurgeCondition
}

/** Ordered list of purge rules — first match = purgeable. */
export interface PurgePolicy {
  rules: PurgeRule[]
}

/** Deployment-wide purge settings (master-only). */
export interface GlobalPurgeSettings {
  enabled: boolean
  policy: PurgePolicy
  sweepIntervalMinutes: number
}

export const DEFAULT_GLOBAL_PURGE_SETTINGS: GlobalPurgeSettings = {
  enabled: false,
  policy: { rules: [] },
  sweepIntervalMinutes: 30,
}
