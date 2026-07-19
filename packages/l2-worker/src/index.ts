export { loadPostMetrics } from './metrics.js'
export { hydrateRepostSubject } from './hydrate-repost.js'

export { collectAuthorListIds, loadAuthorListsForFeeds, loadAuthorListSetsForFeeds } from './author-lists.js'
export { loadMentionDidsForFeed } from './mention-accounts.js'
export {
  seedFollowRingsFromFeeds,
  seedFollowRingsFromProjects,
  loadFollowRingsForFeed,
  loadL1FollowRingsForProjects,
  pollDueFollowRings,
  followRingCacheListId,
} from './follow-ring-cache.js'
export { loadIngestGateExtrasForProjects } from './ingest-gate-extras.js'
export {
  processPostForFeeds,
  type ProcessPostOptions,
  matchedProjectIdsFromL1,
  type ProcessPostResult,
} from './process-post.js'
export { reevalPoolForFeeds, startBackgroundReeval, getRebuildStatus, clearRebuildStatus, cancelRebuild, type ReevalResult, type ReevalProgress } from './reeval.js'
export { previewFeedPoolMatches, type PoolMatchItem, type PoolMatchResult } from './match-pool.js'
export type {
  PoolMatchAuthor,
  PoolMatchMediaPreview,
  PoolMatchQuotePreview,
  PoolMatchSample,
} from './pool-match-sample.js'
export { reevalPostInPool } from './reeval-post.js'
export { startAgeSweep, type AgeSweepStats } from './age-sweep.js'
export { listProjectPoolPosts, type ProjectPoolResult } from './list-project-pool.js'

export { resolveSourcePosts } from './resolve-sources.js'

export {
  collectSubstituteNodes,
  resolveTargetUri,
  resolveInverseSourceUri,
  postMatchesDirection,
  isInverseDirection,
  processSubstitution,
  resolveTargetPost,
  type SubstituteNodeInfo,
  type SubstitutionResult,
} from './substitution.js'

export {
  ScoutSignalCounter,
  computeRequiredScouts,
  type ScoutTrigger,
  type SignalEntry,
  type ScoutPersistence,
} from './scout-discovery.js'

export {
  isDiscoverRing,
  discoverFromRing,
  type FollowRingDiscoverResult,
} from './follow-ring-discover.js'
