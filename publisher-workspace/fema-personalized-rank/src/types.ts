/** Mirrors @cfb/core-types RankerCandidate — kept local so the plugin builds standalone. */
export interface RankerCandidate {
  uri: string
  authorDid: string
  indexedAt: string
  likeCount: number
  repostCount: number
  replyCount: number
  quoteCount: number
  authorFollowerCount: number
  hasMedia: boolean
  hasAltText: boolean
  facetTagCount: number
}

export interface ServedPostRecord {
  postUri: string
  servedAt: string
  impressionCount: number
  seenConfirmed: boolean
}

export interface ViewerContext {
  viewerDid: string
  followedAuthorDids: string[]
  servedPosts: ServedPostRecord[]
  likedPostUris: string[]
  repostedPostUris: string[]
}

export interface RankerRequest {
  feedId: string
  limit: number
  candidates: string[]
  candidatePosts?: RankerCandidate[]
  viewerDid?: string
  viewer?: ViewerContext
  config?: Record<string, unknown>
}

export interface RankerResponse {
  uris: string[]
}

export interface ScoredCandidate {
  uri: string
  authorDid: string
  score: number
  breakdown: Record<string, number>
}

export interface ScoringConfig {
  freshnessHalflifeHours: number
  freshnessExponent: number
  likeWeight: number
  repostWeight: number
  replyWeight: number
  quoteWeight: number
  engagementScale: 'linear' | 'log' | 'sqrt'
  engagementScaleFactor: number
  engagementExponent: number
  coldStartMin: number
  mediaMultiplier: number
  altTextPenalty: number
  altTextEnabled: boolean
  hashtagPostWeight: number
  followerNormEnabled: boolean
  followerNormBaselineRate: number
  followerNormMaxBoost: number
  followerNormMinFollowers: number
  followerNormBoostDampRate: number
  followerNormPenaltyAmpRate: number
  velocityBoostEnabled: boolean
  velocityBaselinePercentile: number
  velocityCap: number
  diversityEnabled: boolean
  diversityMinGap: number
  followingBoostEnabled: boolean
  followingBoostMultiplier: number
  servedDemotionEnabled: boolean
  servedBasePenalty: number
  servedMinDurationHours: number
  servedMaxDurationHours: number
  servedVisibilityFloor: number
  likedDemotionEnabled: boolean
  likedPenalty: number
  repostedDemotionEnabled: boolean
  repostedPenalty: number
}

export interface ScoringContext {
  nowMs: number
  velocityBaseline: number
  config: ScoringConfig
  followedAuthorDids?: Set<string>
  servedPosts?: Map<string, ServedPostRecord>
  likedPostUris?: Set<string>
  repostedPostUris?: Set<string>
}

export interface ScoringFactor {
  name: string
  compute: (post: RankerCandidate, ctx: ScoringContext) => number
}

export interface PostProcessingFactor {
  name: string
  apply: (posts: ScoredCandidate[], ctx: ScoringContext) => ScoredCandidate[]
}
