/** Backfill system types — pool backfill methods, limits, and job tracking. */

export type BackfillMethod = 'jetstream' | 'search' | 'author'

/** Deployment-wide backfill limits set by master account. */
export interface BackfillSettings {
  maxCandidatesPerRun: number
  maxMatchesPerRun: number
  maxConcurrentBackfills: number
  cooldownMinutes: number
  enabledMethods: BackfillMethod[]
  jetstream: { maxHoursBack: number }
  search: { maxPages: number }
  author: { maxAuthors: number; maxPagesPerAuthor: number }
  /** When true, users can switch projects to manual prefilter mode. Default false. */
  allowManualPrefilter: boolean
}

export const DEFAULT_BACKFILL_SETTINGS: BackfillSettings = {
  maxCandidatesPerRun: 50_000,
  maxMatchesPerRun: 5_000,
  maxConcurrentBackfills: 1,
  cooldownMinutes: 15,
  enabledMethods: ['jetstream', 'search', 'author'],
  jetstream: { maxHoursBack: 72 },
  search: { maxPages: 50 },
  author: { maxAuthors: 100, maxPagesPerAuthor: 20 },
  allowManualPrefilter: false,
}

/** User-provided config when starting a backfill job. */
export interface BackfillJobConfig {
  method: BackfillMethod
  candidateLimit: number
  matchLimit: number
  // Jetstream-specific
  hoursBack?: number
  // Search-specific
  queries?: string[]
  searchSince?: string
  searchUntil?: string
  // Author-specific
  authorListIds?: string[]
  pagesPerAuthor?: number
}

export type BackfillJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface BackfillJob {
  id: string
  projectId: string
  ownerDid: string | null
  method: BackfillMethod
  status: BackfillJobStatus
  config: BackfillJobConfig
  candidatesScanned: number
  candidateLimit: number
  matchesFound: number
  matchLimit: number
  l2Written: number
  errors: number
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}
