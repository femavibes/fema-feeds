export { createPool } from './pool.js'
export type { Pool } from 'pg'
export { buildPostSummary, persistL1Matches, type PersistL1MatchInput, type PostSummary, type StoredPostData } from './ingest.js'
export {
  upsertAuthorListCache,
  syncAuthorListCacheByRemotePollKey,
  patchAuthorListMembership,
  addAuthorListMember,
  removeAuthorListMember,
  upsertListitemIndex,
  takeListitemIndex,
  getAuthorListCache,
  getAuthorListCacheByRemotePollKey,
  getAllAuthorListCache,
  listDistinctOwnerDidsForLists,
  listAuthorListsDueForPoll,
  type AuthorListCacheRow,
  type UpsertAuthorListCacheInput,
} from './author-lists.js'
export { getIngestStats, pruneExpiredPosts, type IngestStats } from './stats.js'
export {
  insertIngestSmokeTest,
  getLatestIngestSmokeTest,
  listIngestSmokeTests,
  type IngestSmokeTestRecord,
  type InsertIngestSmokeTestInput,
} from './ingest-smoke-tests.js'
export {
  insertIngestStressTest,
  getIngestStressTest,
  getLatestIngestStressTest,
  listIngestStressTests,
  purgeIngestStressTest,
  type IngestStressTestRecord,
  type InsertIngestStressTestInput,
  type PurgeIngestStressTestResult,
  type StressTestSavedAssociation,
} from './ingest-stress-tests.js'
export { deleteProjectData } from './project-cleanup.js'
export {
  getAuthorProfile,
  getAuthorProfilesByDids,
  upsertAuthorProfile,
  isAuthorProfileFresh,
  pruneExpiredAuthorProfiles,
  type AuthorProfileRow,
} from './author-profiles.js'
export {
  isPostInPool,
  ensurePostEngagement,
  bumpEngagementIfInPool,
  getPostEngagement,
  getPostEngagementBatch,
  adjustEngagement,
  setPostEngagement,
  getPoolPostsForEngagementRefresh,
} from './post-engagement.js'
export { loadRankerCandidates } from './ranker-candidates.js'
export {
  applyFeedInteractionEvents,
  loadViewerContext,
  loadViewerAffinityCounts,
  loadViewerLastFeedOpen,
  recordViewerFeedOpen,
  recordFeedServedPosts,
  resolveViewerFollowedDids,
  resolveViewerFollowerDids,
  type AuthorAffinityRecord,
  type FeedInteractionInput,
  type ServedFeedItem,
} from './viewer-context.js'
export { getEnrichmentSettings, saveEnrichmentSettings } from './enrichment-settings.js'
export { getIngestSettings, saveIngestSettings, type IngestSettings } from './ingest-settings.js'
export {
  getFeedgenSettings,
  saveFeedgenSettings,
  resolveFeedgenSettings,
  feedgenSettingsFromEnv,
  type FeedgenEnvFallback,
} from './feedgen-settings.js'
export {
  getUserFeedgenSettings,
  saveUserFeedgenSettings,
  resolveUserFeedgenSettings,
  findOwnerDidByDuckdnsHost,
  findOwnerDidByPublicHost,
  listUsersWithDuckDns,
} from './user-feedgen-settings.js'
export {
  getDeploymentInfo,
  saveDeploymentInfo,
  getDeploymentAccess,
  saveDeploymentAccess,
  bootstrapDeploymentFromEnv,
  bootstrapMasterFromEnv,
  getGlobalPrefilter,
  saveGlobalPrefilter,
} from './deployment-settings.js'
export {
  upsertUser,
  getUser,
  createBrowserSession,
  getBrowserSessionUserDid,
  deleteBrowserSession,
  pruneExpiredBrowserSessions,
  saveOAuthSession,
  getOAuthSessionJson,
  deleteOAuthSession,
  setOAuthState,
  getOAuthState,
  deleteOAuthState,
  pruneExpiredOAuthState,
  type AuthUser,
} from './auth.js'
export {
  listLabelerSources,
  listEnabledLabelerDids,
  getLabelerSource,
  upsertLabelerSource,
  setLabelerEnabled,
  deleteLabelerSource,
  type LabelerSourceRow,
} from './labeler-sources.js'
export {
  listPostsDueForLabelRefresh,
  listPoolPostUrisByAuthor,
  updatePostLabelerLabels,
  touchPostLabelsChecked,
  labelerLabelsFingerprint,
  removePostFromProject,
  pruneOrphanPoolPost,
  type LabelRefreshCandidate,
} from './post-labels.js'
export { getLabelStreamCursor, saveLabelStreamCursor } from './label-stream-cursors.js'
export {
  upsertFeedCandidate,
  deleteFeedCandidate,
  deleteFeedCandidatesForFeed,
  deleteFeedCandidatesForFeeds,
  countFeedCandidates,
  listFeedCandidateRows,
  getStaleFeedCandidateUris,
  countStaleFeedCandidates,
  getFeedSkeleton,
  getFeedCandidateWindow,
  getAgeSweepPostUris,
  purgeExpiredFeedCandidates,
  purgeOutOfScopeCandidates,
  bumpAudienceEngagement,
  type FeedCandidateInput,
  type FeedCandidateRow,
  type FeedCandidateWindowRow,
  type SkeletonPost,
} from './feed-candidates.js'
export {
  getFeedDraft,
  saveFeedDraft,
  deleteFeedDraft,
} from './feed-drafts.js'
export {
  getNextFeedVersion,
  saveFeedVersion,
  listFeedVersions,
  getFeedVersion,
  updateFeedVersionLabel,
  deleteFeedVersions,
  type FeedVersionRow,
} from './feed-versions.js'
export {
  createLogicBlockPackage,
  getLogicBlockPackageById,
  getLogicBlockPackagesByRefs,
  getLatestLogicBlockPackagesByIds,
  listDeploymentCatalog,
  listLogicBlockCatalog,
  listLogicBlockPackageVersions,
  listLogicBlocksForUser,
  listUserCollection,
  listUserSubscriptions,
  setLogicBlockVisibility,
  setLogicBlockTrustTier,
  subscribeLogicBlock,
  unsubscribeLogicBlock,
  updateLogicBlockPackage,
  upsertLogicBlockRegistryMirror,
  repairLogicBlockRootInPlace,
  type CreateLogicBlockInput,
} from './logic-blocks.js'
export {
  createSortPackPackage,
  getSortPackPackageById,
  getSortPackPackagesByRefs,
  getLatestSortPackPackagesByIds,
  listSortPackCatalog,
  listSortPackCollection,
  listSortPackPackageVersions,
  listSortPackSubscriptions,
  setSortPackVisibility,
  setSortPackTrustTier,
  subscribeSortPack,
  unsubscribeSortPack,
  updateSortPackPackage,
  upsertSortPackRegistryMirror,
  type CreateSortPackInput,
} from './sort-packs.js'
export {
  createPluginPackage,
  getPluginPackageById,
  listPluginCatalog,
  listPluginCollection,
  listPluginPackageVersions,
  listPluginSubscriptions,
  setPluginVisibility,
  subscribePlugin,
  unsubscribePlugin,
  updatePluginPackage,
  upsertPluginRegistryMirror,
  getPluginWasmArtifact,
  setPluginWasmArtifact,
  type CreatePluginInput,
} from './plugins.js'
export {
  getPublisherVerificationStatus,
  verifyPublisherScopes,
  revokePublisherScopes,
} from './publisher-trust.js'
export { moderateUnpublishPackage } from './marketplace-moderation.js'
export {
  approveMarketplacePublishRequest,
  createMarketplacePublishRequest,
  denyMarketplacePublishRequest,
  getMarketplacePublishRequest,
  listOwnerPublishRequests,
  listPendingPublishRequests,
} from './marketplace-publish-requests.js'
export { setPackageListingMeta, type PublisherListingMetaInput } from './marketplace-listing-meta.js'
export {
  ingestGlobalListingSubmission,
  loadPackageForIngress,
  stageLogicBlockForIngress,
  stagePluginForIngress,
  stageSortPackForIngress,
} from './registry-ingress.js'
export {
  normalizedPostFromRow,
  getIngestedPost,
  listPostsForProject,
  listAllPoolPosts,
  listPoolPostsFiltered,
  countPoolPostsFiltered,
  countPostsForProject,
  countAllPoolPosts,
  getProjectIdsForPost,
  getProjectIdsForPostsBatch,
  type IngestedPostRow,
} from './pool-post.js'
export {
  getUserPreferences,
  saveUserPreferences,
  type UserPreferences,
} from './user-preferences.js'
export {
  getGlobalPurgeSettings,
  saveGlobalPurgeSettings,
  runPurgeSweep,
  type PurgeSweepResult,
} from './purge.js'

export {
  getPostEnrichments,
  getPostEnrichmentsBatch,
  upsertPostEnrichment,
  upsertPostEnrichmentsBatch,
  deleteEnrichmentsByEnricher,
  countUnenrichedPosts,
  listUnenrichedPostUris,
  type PostEnrichmentRow,
} from './post-enrichments.js'

export {
  incrementFeedImpression,
  recordFeedDailyViewer,
  getFeedDailyViewers,
  getFeedDailyImpressions,
  getFeedTotalImpressions,
  getFeedTotalUniqueViewers,
  getFeedStats,
  type FeedDailyStatsRow,
  type FeedStatsSnapshot,
} from './feed-stats.js'

export {
  getBackfillSettings,
  saveBackfillSettings,
  getJetstreamCursor,
  saveJetstreamCursor,
  ensureBackfillJobsTable,
  createBackfillJob,
  getBackfillJob,
  listBackfillJobs,
  getActiveBackfillCount,
  getLastBackfillForProject,
  updateBackfillJobStatus,
  updateBackfillJobProgress,
} from './backfill.js'

export {
  ensureSubstitutionTables,
  insertSubstitutionVote,
  getSubstitutionVoteCount,
  getSubstitutionTargets,
  hasVoted,
  deleteSubstitutionVotesForProject,
} from './substitution.js'
export { deriveScoutDids } from './scout-derive.js'
export {
  ensureScoutSignalsTables,
  upsertScoutSignal,
  loadScoutSignals,
  deleteScoutSignals,
  sweepScoutSignals,
  type ScoutSignalRow,
} from './scout-signals.js'
export {
  ensureEngagementEventsTable,
  insertEngagementEvent,
  pruneEngagementEvents,
} from './engagement-events.js'
export {
  recordFeedParamMatch,
  countFeedParamMatches,
  getFeedParamLastMatchAt,
  authorPostedRecentlyForFeed,
  getAuthorListMemberCount,
  noteListMemberCount,
  takePendingListEvent,
  pruneOldParamMatchEvents,
} from './param-triggers.js'
export {
  createFeedApiKey,
  listFeedApiKeys,
  revokeFeedApiKey,
  resolveFeedApiKey,
  generateFeedApiKey,
  hashFeedApiKey,
  type FeedApiKeyRow,
} from './feed-api-keys.js'
