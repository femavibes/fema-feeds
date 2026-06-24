export interface EnrichmentSettings {
  enabled: boolean
  enrichAuthors: boolean
  trackEngagement: boolean
  /** Query configured labelers (Bluesky mod + custom) for each post at ingest. */
  resolveLabelerLabels: boolean
  /** Subscribe to labeler WebSocket streams for real-time label updates. */
  labelStreamEnabled: boolean
  /** Re-query labelers for recent pool posts (labels arrive after ingest). */
  labelRefreshEnabled: boolean
  /** Minimum minutes between label checks per post. */
  labelRefreshIntervalMinutes: number
  /** Stop re-checking posts older than this (days since indexed_at). */
  labelRefreshMaxAgeDays: number
  /** Posts per sweep batch. */
  labelRefreshBatchSize: number
  authorProfileTtlHours: number
  authorProfilePruneDays: number
  engagementJetstream: boolean
}

export const DEFAULT_ENRICHMENT_SETTINGS: EnrichmentSettings = {
  enabled: true,
  enrichAuthors: true,
  trackEngagement: true,
  resolveLabelerLabels: true,
  labelStreamEnabled: true,
  labelRefreshEnabled: true,
  labelRefreshIntervalMinutes: 5,
  labelRefreshMaxAgeDays: 7,
  labelRefreshBatchSize: 40,
  authorProfileTtlHours: 168,
  authorProfilePruneDays: 90,
  engagementJetstream: true,
}

export interface AuthorProfile {
  did: string
  handle?: string | null
  displayName?: string | null
  description?: string | null
  avatarUrl?: string | null
  bannerUrl?: string | null
  accountCreatedAt?: string | null
  indexedAt?: string | null
  followersCount: number
  followsCount: number
  postsCount: number
  labels: string[]
}

export interface PostEngagement {
  postUri: string
  likeCount: number
  repostCount: number
  quoteCount: number
  replyCount: number
  bookmarkCount: number
  updatedAt: string
}

export type EngagementCounter = 'like' | 'repost' | 'quote' | 'reply' | 'bookmark'
