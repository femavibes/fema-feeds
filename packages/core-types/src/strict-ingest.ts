/** Per-project prefilter mode. */
export type PrefilterMode = 'manual' | 'strict'

/** Metadata about the strict include gate compilation. */
export interface StrictGateMeta {
  compiledAt: string
  feedCount: number
  pathCount: number
  /** Feed IDs that contributed paths. */
  contributingFeeds: string[]
}
