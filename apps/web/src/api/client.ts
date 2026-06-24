import type { EnrichmentSettings, FeedConfig, FeedgenSettings, L2EvalResult, L2NodeTrace, L1ProjectResult, ProjectL1Config, PostMetrics } from '@cfb/core-types'

export interface IngestLastSession {
  startedAt: string
  stoppedAt: string
  jetstreamUrl: string
  seen: number
  l1Pass: number
  saved: number
  saveErrors: number
  l2: {
    evaluated: number
    matched: number
    written: number
    errors: number
  }
}

export interface IngestSmokeTestResult {
  id?: number
  durationSec: number
  finishedAt: string
  ignorePrefilters?: boolean
  seen: number
  wouldSave: number
  passRatePct: string
  postsPerSec: string
  enabledProjects: number
  byProject: Record<string, number>
}

export interface IngestStressTestResult {
  id?: number
  durationSec: number
  finishedAt: string
  ignorePrefilters?: boolean
  seen: number
  l1Pass: number
  saved: number
  saveErrors: number
  backlog: number
  passRatePct: string
  writeSuccessPct: string
  postsPerSec: string
  savesPerSec: string
  enabledProjects: number
  byProject: Record<string, number>
  purgedAt?: string | null
  purgedPosts?: number | null
  trackablePosts?: number
}

export interface PurgeIngestStressTestResponse {
  purgedPosts: number
  purgedAssociations: number
  purgedAt: string
  stressTest: IngestStressTestResult
}

export interface IngestRunnerStatus {
  running: boolean
  startedAt: string | null
  jetstreamUrl: string | null
  lastSession: IngestLastSession | null
  seen: number
  l1Pass: number
  saved: number
  saveErrors: number
  enrichment: {
    enabled: boolean
    profileFetches: number
    profileErrors: number
    labelResolves?: number
    labelResolveErrors?: number
    engagementBumps: number
    engagementIgnored: number
    engagementErrors: number
    labelStream?: {
      connections: number
      events: number
      labelsProcessed: number
      postsChanged: number
      errors: number
    }
  }
  l2: {
    evaluated: number
    matched: number
    written: number
    errors: number
  }
}

export interface IngestStatusResponse extends IngestRunnerStatus {
  lastSmokeTest: IngestSmokeTestResult | null
  lastStressTest: IngestStressTestResult | null
}

export interface IngestStats {
  poolSize: number
  byProject: Record<string, number>
  listCacheCount: number
  listsDueForPoll: number
}

export interface ListCacheEntry {
  listId: string
  projectId: string
  memberCount: number
  graphName?: string | null
  refreshedAt: string | null
  nextPollAt: string | null
  remotePollKey?: string | null
  graphUri?: string | null
  feedOnly?: boolean
}

export interface ListMemberEntry {
  did: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
}

export interface ListMembersResponse {
  listId: string
  graphName: string | null
  memberCount: number
  refreshedAt: string | null
  members: ListMemberEntry[]
}

export interface LabelerSource {
  did: string
  name: string
  enabled: boolean
  isBuiltin: boolean
  createdAt?: string
}

export interface PreviewResponse {
  post: { uri: string; authorDid: string; text?: string }
  result: L1ProjectResult
}

export interface DryRunResult {
  projectId: string
  durationSec: number
  seen: number
  wouldSave: number
  passRatePct: string
  topRejectSteps: Record<string, number>
}

export interface L2PreviewResult {
  post: { uri: string; authorDid: string; text?: string }
  result: L2EvalResult
  metrics?: PostMetrics
  metricsSource?: 'pool' | 'override' | 'default'
}

export interface PoolMatchAuthor {
  did: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
}

export interface PoolMatchMediaPreview {
  kind: 'image' | 'video' | 'link'
  thumbUrl?: string
  fullUrl?: string
  alt?: string
  title?: string
  href?: string
  aspectRatio?: { width: number; height: number }
}

export interface PoolMatchQuotePreview {
  uri: string
  text: string
  author: PoolMatchAuthor
  thumbUrl?: string
  unavailable?: 'not-found' | 'blocked' | 'detached'
}

export interface PoolMatchSample {
  uri: string
  author: PoolMatchAuthor
  text: string
  indexedAt: string
  postKind: string
  facetTags: string[]
  media: PoolMatchMediaPreview[]
  quote?: PoolMatchQuotePreview
  trace: L2NodeTrace[]
}

export interface PoolMatchResult {
  poolTotal: number
  scanned: number
  matchCount: number
  rejectCount: number
  posts: Array<PoolMatchSample & { sortKey: number | null }>
  rejects: PoolMatchSample[]
  truncated: boolean
}

export interface PublishChecklistItem {
  id: string
  label: string
  ok: boolean
  hint?: string
}

export interface FeedSkeletonResponse {
  feedId: string
  candidateCount: number
  feed: Array<{ post: string; feedContext?: string }>
  cursor?: string
}

export interface FeedPublishInfo {
  feedId: string
  name: string
  enabled: boolean
  published?: boolean
  feedUri: string | null
  generatorDid: string | null
  publicBaseUrl: string | null
  describeUrl: string | null
  skeletonUrl: string | null
  candidateCount: number | null
  checklist: PublishChecklistItem[]
  readyToPublish: boolean
  ready: boolean
  feedgenReady: boolean
  blueskyLive: boolean
  /** Server has a reusable Bluesky session (OAuth or app password) for publishing. */
  blueskySessionReady?: boolean
}

export type FeedgenSettingsPublic = FeedgenSettings & {
  duckdnsTokenSet?: boolean
  cloudflareTunnelTokenSet?: boolean
}

export interface FeedgenSettingsResponse {
  settings: FeedgenSettingsPublic
  writable: boolean
  source: 'settings' | 'env' | 'default'
  /** Logged-in Bluesky DID — default publisher when generatorDid is empty. */
  publisherDid?: string | null
}

export interface AuthUser {
  did: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
  isMaster?: boolean
  isGlobalVerifier?: boolean
}

export interface AuthStatus {
  oauthConfigured: boolean
  oauthPublicUrl: string | null
  appPasswordLogin: boolean
  loginRequired: boolean
  oauthSetupHint?: string | null
  appUrl?: string | null
  deployment?: {
    slug: string
    publicUrl: string
    publicHost: string
  } | null
  masterDid?: string | null
  isMaster?: boolean
  isGlobalVerifier?: boolean
}

export interface DeploymentAccessSettings {
  masterDid?: string
  allowedDids: string[]
}

export interface FeedImportResult {
  match: FeedConfig['match']
  conditionCount: number
}

export interface FeedBuildCandidatesResult {
  posts: number
  evaluated: number
  matched: number
  written: number
}

export interface FeedEditorResponse {
  feed: FeedConfig
  live: FeedConfig
  draft: FeedConfig | null
  hasUnpublishedDraft: boolean
}

export interface FeedVersionSummary {
  version: number
  createdAt: string
  createdByDid: string | null
  label: string | null
  kind: 'live' | 'milestone'
}

export interface FeedUpdateResult {
  feed: FeedConfig
  live: FeedConfig
  hasUnpublishedDraft: boolean
  version: number
  reeval: FeedBuildCandidatesResult
  /** Project L1 after ingest gate compile (present when project exists). */
  project?: ProjectL1Config
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  })
    if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    const detail = err.error ?? `Request failed (${res.status})`
    if (res.status === 401 && err.error === 'login_required') {
      throw new Error('login_required')
    }
    if (res.status === 404 && path.includes('/settings/feedgen')) {
      throw new Error(
        `${detail} — restart the API (Settings → Developer → Restart API) so it picks up feed publishing settings`,
      )
    }
    if (res.status === 404 && path.includes('/feeds')) {
      if (err.error === 'feed not found') {
        throw new Error(`${detail} — save the feed first (Save feed button)`)
      }
      if (err.error === 'not found') {
        throw new Error(`${detail} — this feed may not exist yet; create or save it first`)
      }
      throw new Error(
        `${detail} — API may be out of date; use Settings → Dev → Restart API (rebuilds automatically)`,
      )
    }
    throw new Error(`${detail} (${path})`)
  }
  return res.json() as Promise<T>
}

export const api = {
  ingestStatus: () => apiFetch<IngestStatusResponse>('/api/ingest/status'),
  ingestStart: () => apiFetch<IngestStatusResponse>('/api/ingest/start', { method: 'POST' }),
  ingestStop: () => apiFetch<IngestStatusResponse>('/api/ingest/stop', { method: 'POST' }),
  ingestSmokeTest: (durationSec: number, ignorePrefilters = false) =>
    apiFetch<IngestSmokeTestResult>('/api/ingest/smoke-test', {
      method: 'POST',
      body: JSON.stringify({ durationSec, ignorePrefilters }),
    }),
  ingestSmokeTests: (limit = 10) =>
    apiFetch<{ tests: IngestSmokeTestResult[] }>(`/api/ingest/smoke-tests?limit=${limit}`),
  ingestStressTest: (durationSec: number, ignorePrefilters = false) =>
    apiFetch<IngestStressTestResult>('/api/ingest/stress-test', {
      method: 'POST',
      body: JSON.stringify({ durationSec, ignorePrefilters }),
    }),
  ingestStressTests: (limit = 10) =>
    apiFetch<{ tests: IngestStressTestResult[] }>(`/api/ingest/stress-tests?limit=${limit}`),
  purgeIngestStressTest: (id: number) =>
    apiFetch<PurgeIngestStressTestResponse>(`/api/ingest/stress-tests/${id}/purge`, {
      method: 'POST',
    }),
  devRestart: (target: 'api' | 'web' | 'all') =>
    apiFetch<{ ok: boolean; target: string; message: string }>('/api/dev/restart', {
      method: 'POST',
      body: JSON.stringify({ target }),
    }),
  listProjects: () => apiFetch<{ projects: ProjectL1Config[] }>('/api/projects'),
  getProject: (id: string) => apiFetch<{ project: ProjectL1Config }>(`/api/projects/${id}`),
  createProject: (project: ProjectL1Config) =>
    apiFetch<{ project: ProjectL1Config }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(project),
    }),
  saveProject: (project: ProjectL1Config) =>
    apiFetch<{ project: ProjectL1Config }>(`/api/projects/${project.projectId}`, {
      method: 'PUT',
      body: JSON.stringify(project),
    }),
  deleteProject: (id: string) =>
    apiFetch<{ ok: boolean; projectId: string }>(`/api/projects/${id}`, { method: 'DELETE' }),
  preview: (id: string, body?: { post?: string; project?: ProjectL1Config }) =>
    apiFetch<PreviewResponse>(`/api/projects/${id}/preview`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  dryRun: (id: string, durationSec: number, project?: ProjectL1Config) =>
    apiFetch<DryRunResult>(`/api/projects/${id}/dry-run`, {
      method: 'POST',
      body: JSON.stringify({ durationSec, project }),
    }),
  listFeeds: (projectId: string) =>
    apiFetch<{ feeds: Array<FeedConfig & { hasUnpublishedDraft?: boolean }> }>(
      `/api/projects/${projectId}/feeds`,
    ),
  getFeed: (id: string) => apiFetch<FeedEditorResponse>(`/api/feeds/${id}`),
  listFeedLogicBlockUpgrades: (feedId: string) =>
    apiFetch<{ upgrades: import('@cfb/core-types').LogicBlockUpgradeHint[] }>(
      `/api/feeds/${feedId}/logic-block-upgrades`,
    ),
  applyFeedLogicBlockUpgrades: (feedId: string, nodeIds: string[]) =>
    apiFetch<{
      feed: FeedConfig
      applied: import('@cfb/core-types').LogicBlockUpgradeHint[]
      live: FeedConfig
      hasUnpublishedDraft: boolean
    }>(`/api/feeds/${feedId}/logic-block-upgrades/apply`, {
      method: 'POST',
      body: JSON.stringify({ nodeIds }),
    }),
  createFeed: (feed: FeedConfig) =>
    apiFetch<{ feed: FeedConfig }>('/api/feeds', { method: 'POST', body: JSON.stringify(feed) }),
  saveFeedDraft: (feed: FeedConfig) =>
    apiFetch<{ feed: FeedConfig; live: FeedConfig; hasUnpublishedDraft: boolean }>(
      `/api/feeds/${feed.feedId}/draft`,
      { method: 'PUT', body: JSON.stringify(feed) },
    ),
  updateFeed: (feed: FeedConfig) =>
    apiFetch<FeedUpdateResult>(`/api/feeds/${feed.feedId}/update`, {
      method: 'POST',
      body: JSON.stringify({ feed }),
    }),
  publishFeed: (id: string, body?: { appPassword?: string }) =>
    apiFetch<{ feed: FeedConfig; bluesky?: { uri: string; created: boolean } }>(
      `/api/feeds/${id}/publish`,
      { method: 'POST', body: JSON.stringify(body ?? {}) },
    ),
  unpublishFeed: (id: string, body?: { appPassword?: string }) =>
    apiFetch<{ feed: FeedConfig }>(`/api/feeds/${id}/unpublish`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  listFeedVersions: (id: string) =>
    apiFetch<{ feedId: string; versions: FeedVersionSummary[] }>(`/api/feeds/${id}/versions`),
  saveFeedMilestone: (id: string, label?: string) =>
    apiFetch<{ feedId: string; version: number; label: string | null; kind: 'milestone' }>(
      `/api/feeds/${id}/versions/milestone`,
      { method: 'POST', body: JSON.stringify(label ? { label } : {}) },
    ),
  labelFeedVersion: (id: string, version: number, label: string) =>
    apiFetch<{ feedId: string; version: number; label: string }>(
      `/api/feeds/${id}/versions/${version}`,
      { method: 'PATCH', body: JSON.stringify({ label }) },
    ),
  restoreFeedVersion: (id: string, version: number) =>
    apiFetch<FeedEditorResponse & { restoredVersion: number }>(
      `/api/feeds/${id}/versions/${version}/restore`,
      { method: 'POST' },
    ),
  deleteFeed: (id: string) =>
    apiFetch<{ ok: boolean; feedId: string }>(`/api/feeds/${id}`, { method: 'DELETE' }),
  previewFeed: (
    id: string,
    body: { post?: string; feed?: FeedConfig; metrics?: PostMetrics },
  ) =>
    apiFetch<L2PreviewResult>(`/api/feeds/${id}/preview`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  matchFeedPool: (
    id: string,
    body?: { feed?: FeedConfig; limit?: number; scanLimit?: number; rejectLimit?: number },
  ) =>
    apiFetch<PoolMatchResult>(`/api/feeds/${id}/match-pool`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  feedPublishInfo: (id: string) => apiFetch<FeedPublishInfo>(`/api/feeds/${id}/publish`),
  getFeedSkeleton: (id: string, limit = 50) =>
    apiFetch<FeedSkeletonResponse>(`/api/feeds/${id}/skeleton?limit=${limit}`),
  importFeedRules: (id: string, rules: unknown) =>
    apiFetch<FeedImportResult>(`/api/feeds/${id}/import-rules`, {
      method: 'POST',
      body: JSON.stringify({ rules }),
    }),
  stats: () => apiFetch<IngestStats>('/api/stats'),
  listCache: () => apiFetch<{ lists: ListCacheEntry[] }>('/api/lists/cache'),
  listMembers: (listId: string, extraDids?: string[]) => {
    const params = new URLSearchParams()
    if (extraDids?.length) params.set('extraDids', extraDids.join(','))
    const q = params.toString()
    return apiFetch<ListMembersResponse>(
      `/api/lists/${encodeURIComponent(listId)}/members${q ? `?${q}` : ''}`,
    )
  },
  resolveAuthorProfiles: (dids: string[]) => {
    const params = new URLSearchParams({ dids: dids.join(',') })
    return apiFetch<{ members: ListMemberEntry[] }>(`/api/author-profiles?${params}`)
  },
  resolveActors: (actors: string[]) => {
    const params = new URLSearchParams({ actors: actors.join(',') })
    return apiFetch<{ members: ListMemberEntry[] }>(`/api/author-profiles?${params}`)
  },
  pollLists: () => apiFetch<{ refreshed: number }>('/api/lists/poll', { method: 'POST' }),
  getEnrichmentSettings: () =>
    apiFetch<{ settings: EnrichmentSettings }>('/api/settings/enrichment'),
  saveEnrichmentSettings: (patch: Partial<EnrichmentSettings>) =>
    apiFetch<{ settings: EnrichmentSettings }>('/api/settings/enrichment', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  getFeedgenSettings: () => apiFetch<FeedgenSettingsResponse>('/api/settings/feedgen'),
  saveFeedgenSettings: (patch: Partial<FeedgenSettings>) =>
    apiFetch<{ settings: FeedgenSettingsPublic }>('/api/settings/feedgen', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  syncDuckDns: () =>
    apiFetch<{ settings: FeedgenSettingsPublic }>('/api/settings/feedgen/duckdns/sync', {
      method: 'POST',
    }),
  checkCloudflareTunnel: () =>
    apiFetch<{ settings: FeedgenSettingsPublic }>('/api/settings/feedgen/cloudflare/check', {
      method: 'POST',
    }),
  hostedHostnameStatus: () =>
    apiFetch<{ available: boolean; dnsBase: string; exampleHost: string | null }>(
      '/api/settings/feedgen/hosted-hostname/status',
    ),
  claimHostedHostname: () =>
    apiFetch<{
      settings: FeedgenSettingsPublic
      publisherDid?: string
      tunnelToken?: string
      message?: string
      alreadyClaimed?: boolean
    }>('/api/settings/feedgen/hosted-hostname/claim', { method: 'POST' }),
  listLabelers: () => apiFetch<{ labelers: LabelerSource[] }>('/api/labelers'),
  addLabeler: (did: string, name: string) =>
    apiFetch<LabelerSource>('/api/labelers', {
      method: 'POST',
      body: JSON.stringify({ did, name }),
    }),
  setLabelerEnabled: (did: string, enabled: boolean) =>
    apiFetch<LabelerSource>(`/api/labelers/${encodeURIComponent(did)}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),
  deleteLabeler: (did: string) =>
    apiFetch<{ ok: boolean }>(`/api/labelers/${encodeURIComponent(did)}`, { method: 'DELETE' }),
  refreshList: (listId: string) =>
    apiFetch<{ listId: string; memberCount: number }>(`/api/lists/${listId}/refresh`, {
      method: 'POST',
    }),
  authStatus: () => apiFetch<AuthStatus>('/api/auth/status'),
  authMe: () =>
    apiFetch<{
      user: AuthUser | null
      isMaster: boolean
      isGlobalVerifier: boolean
      publisherVerification: import('@cfb/core-types').PublisherVerificationStatus | null
    }>('/api/auth/me'),
  authLogin: (handle: string) =>
    apiFetch<{ url: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ handle }),
    }),
  authLoginAppPassword: (handle: string, appPassword: string) =>
    apiFetch<{ user: AuthUser; isMaster: boolean; isGlobalVerifier: boolean }>(
      '/api/auth/login-app-password',
      {
        method: 'POST',
        body: JSON.stringify({ handle, appPassword }),
      },
    ),
  authLogout: () => apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  getDeploymentAccess: () =>
    apiFetch<{ access: DeploymentAccessSettings; isMaster: boolean }>('/api/settings/access'),
  saveDeploymentAccess: (allowedDids: string[]) =>
    apiFetch<{ access: DeploymentAccessSettings }>('/api/settings/access', {
      method: 'PATCH',
      body: JSON.stringify({ allowedDids }),
    }),
  resolveWhitelistHandle: (handle: string) =>
    apiFetch<{ actor: { did: string; handle: string; displayName?: string } }>(
      '/api/settings/access/resolve-handle',
      {
        method: 'POST',
        body: JSON.stringify({ handle }),
      },
    ),
  listLogicBlockCollection: () =>
    apiFetch<{ packages: import('@cfb/core-types').LogicBlockPackage[] }>('/api/logic-blocks/collection'),
  listLogicBlockCatalog: (scope: 'deployment' | 'global' | 'all' = 'all') =>
    apiFetch<{
      packages: import('@cfb/core-types').LogicBlockPackage[]
      scope: 'deployment' | 'global' | 'all'
      mode: 'local' | 'remote'
      registryRole?: 'operator' | 'consumer' | 'embedded'
    }>(`/api/logic-blocks/catalog?scope=${scope}`),
  globalMarketplaceStatus: () =>
    apiFetch<{
      mode: 'local' | 'remote'
      remoteUrl: string | null
      operatorInstance: boolean
      registryRole: 'operator' | 'consumer' | 'embedded'
      verifierHandle: string
      publicCatalogPath: string
      hint: string
    }>('/api/global-marketplace/status'),
  getLogicBlock: (id: string, version?: string) =>
    apiFetch<{ package: import('@cfb/core-types').LogicBlockPackage }>(
      `/api/logic-blocks/${id}${version ? `?version=${encodeURIComponent(version)}` : ''}`,
    ),
  listLogicBlockVersions: (id: string) =>
    apiFetch<{ versions: import('@cfb/core-types').LogicBlockPackage[] }>(
      `/api/logic-blocks/${id}/versions`,
    ),
  subscribeLogicBlock: (
    id: string,
    body: { versionPin: string; updatePolicy?: import('@cfb/core-types').LogicBlockUpdatePolicy },
  ) =>
    apiFetch<{ ok: boolean }>(`/api/logic-blocks/${id}/subscribe`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listLogicBlockSubscriptions: () =>
    apiFetch<{
      subscriptions: Array<
        import('@cfb/core-types').LogicBlockSubscription & {
          package: import('@cfb/core-types').LogicBlockPackage
        }
      >
    }>('/api/logic-blocks/subscriptions'),
  createLogicBlock: (body: {
    name: string
    slug?: string
    description?: string
    root: import('@cfb/core-types').L2RuleGroup
    visibility?: import('@cfb/core-types').LogicBlockVisibility
  }) =>
    apiFetch<{ package: import('@cfb/core-types').LogicBlockPackage }>('/api/logic-blocks', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateLogicBlock: (
    id: string,
    body: {
      name?: string
      slug?: string
      description?: string | null
      root?: import('@cfb/core-types').L2RuleGroup
      bumpVersion?: boolean
    },
  ) =>
    apiFetch<{ package: import('@cfb/core-types').LogicBlockPackage }>(`/api/logic-blocks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  publishLogicBlockVisibility: (id: string, visibility: import('@cfb/core-types').LogicBlockVisibility) =>
    apiFetch<{ package: import('@cfb/core-types').LogicBlockPackage }>(
      `/api/logic-blocks/${id}/visibility`,
      {
        method: 'PATCH',
        body: JSON.stringify({ visibility }),
      },
    ),
  verifyLogicBlockPublisher: (id: string, trustTier: import('@cfb/core-types').LogicBlockTrustTier) =>
    apiFetch<{ package: import('@cfb/core-types').LogicBlockPackage }>(
      `/api/logic-blocks/${id}/trust`,
      {
        method: 'PATCH',
        body: JSON.stringify({ trustTier }),
      },
    ),
  lookupPublisherVerification: (handle: string) =>
    apiFetch<{
      status: import('@cfb/core-types').PublisherVerificationStatus
      canVerifyDeployment: boolean
      canVerifyGlobal: boolean
    }>(`/api/marketplace/publisher-verification?handle=${encodeURIComponent(handle)}`),
  setPublisherVerification: (body: {
    handle: string
    scopes: import('@cfb/core-types').PublisherTrustScope[]
    action: 'verify' | 'revoke'
  }) =>
    apiFetch<{
      ok: boolean
      action: 'verify' | 'revoke'
      packagesUpdated: number
      status: import('@cfb/core-types').PublisherVerificationStatus
    }>('/api/marketplace/publisher-verification', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listSortPackCollection: () =>
    apiFetch<{ packages: import('@cfb/core-types').SortPackPackage[] }>('/api/sort-packs/collection'),
  listSortPackCatalog: (scope: 'deployment' | 'global' | 'all' = 'all') =>
    apiFetch<{
      packages: import('@cfb/core-types').SortPackPackage[]
      scope: 'deployment' | 'global' | 'all'
      mode: 'local' | 'remote'
    }>(`/api/sort-packs/catalog?scope=${scope}`),
  getSortPack: (id: string, version?: string) =>
    apiFetch<{ package: import('@cfb/core-types').SortPackPackage }>(
      `/api/sort-packs/${id}${version ? `?version=${encodeURIComponent(version)}` : ''}`,
    ),
  listSortPackVersions: (id: string) =>
    apiFetch<{ versions: import('@cfb/core-types').SortPackPackage[] }>(
      `/api/sort-packs/${id}/versions`,
    ),
  subscribeSortPack: (
    id: string,
    body: { versionPin: string; updatePolicy?: import('@cfb/core-types').SortPackUpdatePolicy },
  ) =>
    apiFetch<{ ok: boolean }>(`/api/sort-packs/${id}/subscribe`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listSortPackSubscriptions: () =>
    apiFetch<{
      subscriptions: Array<
        import('@cfb/core-types').SortPackSubscription & {
          package: import('@cfb/core-types').SortPackPackage
        }
      >
    }>('/api/sort-packs/subscriptions'),
  createSortPack: (body: {
    name: string
    slug?: string
    description?: string
    sortKey: import('@cfb/core-types').L2Expr
    visibility?: import('@cfb/core-types').SortPackVisibility
  }) =>
    apiFetch<{ package: import('@cfb/core-types').SortPackPackage }>('/api/sort-packs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateSortPack: (
    id: string,
    body: {
      name?: string
      slug?: string
      description?: string | null
      sortKey?: import('@cfb/core-types').L2Expr
      bumpVersion?: boolean
    },
  ) =>
    apiFetch<{ package: import('@cfb/core-types').SortPackPackage }>(`/api/sort-packs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  publishSortPack: (id: string, visibility: 'deployment' | 'global') =>
    apiFetch<{ package: import('@cfb/core-types').SortPackPackage }>(
      `/api/sort-packs/${id}/visibility`,
      { method: 'PATCH', body: JSON.stringify({ visibility }) },
    ),
  getFeedSortPackUpgrade: (feedId: string) =>
    apiFetch<{ upgrade: import('@cfb/core-types').SortPackUpgradeHint | null }>(
      `/api/feeds/${feedId}/sort-pack-upgrade`,
    ),
  applyFeedSortPackUpgrade: (feedId: string) =>
    apiFetch<{
      feed: import('@cfb/core-types').FeedConfig
      applied: import('@cfb/core-types').SortPackUpgradeHint | null
    }>(`/api/feeds/${feedId}/sort-pack-upgrade/apply`, { method: 'POST', body: '{}' }),
  listPluginCatalog: (kind: 'injector' | 'ranker', scope: 'deployment' | 'global' | 'all' = 'all') =>
    apiFetch<{
      packages: import('@cfb/core-types').PluginPackage[]
      scope: 'deployment' | 'global' | 'all'
      kind: 'injector' | 'ranker'
      mode: 'local' | 'remote'
    }>(`/api/plugins/catalog?kind=${kind}&scope=${scope}`),
  listPluginCollection: (kind?: 'injector' | 'ranker') =>
    apiFetch<{ packages: import('@cfb/core-types').PluginPackage[] }>(
      `/api/plugins/collection${kind ? `?kind=${kind}` : ''}`,
    ),
  createPlugin: (body: {
    kind: 'injector' | 'ranker'
    runtime: 'native' | 'remote' | 'wasm' | 'worker'
    name: string
    slug?: string
    description?: string
    remoteEndpoint?: string
  }) =>
    apiFetch<{ package: import('@cfb/core-types').PluginPackage }>('/api/plugins', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  uploadPluginWasmArtifact: (id: string, wasmBase64: string) =>
    apiFetch<{ package: import('@cfb/core-types').PluginPackage }>(
      `/api/plugins/${id}/wasm-artifact`,
      { method: 'POST', body: JSON.stringify({ wasmBase64 }) },
    ),
  getPlugin: (id: string, version?: string) =>
    apiFetch<{ package: import('@cfb/core-types').PluginPackage }>(
      `/api/plugins/${id}${version ? `?version=${encodeURIComponent(version)}` : ''}`,
    ),
  listPluginVersions: (id: string) =>
    apiFetch<{ versions: import('@cfb/core-types').PluginPackage[] }>(`/api/plugins/${id}/versions`),
  subscribePlugin: (
    id: string,
    body: { versionPin: string; updatePolicy?: import('@cfb/core-types').PluginUpdatePolicy },
  ) =>
    apiFetch<{ ok: boolean }>(`/api/plugins/${id}/subscribe`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listPluginSubscriptions: (kind?: 'injector' | 'ranker') =>
    apiFetch<{
      subscriptions: Array<
        import('@cfb/core-types').PluginSubscription & {
          package: import('@cfb/core-types').PluginPackage
        }
      >
    }>(`/api/plugins/subscriptions${kind ? `?kind=${kind}` : ''}`),
  updatePlugin: (
    id: string,
    body: { name?: string; description?: string | null; remoteEndpoint?: string | null },
  ) =>
    apiFetch<{ package: import('@cfb/core-types').PluginPackage }>(`/api/plugins/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  publishPluginVisibility: (id: string, visibility: 'deployment' | 'global') =>
    apiFetch<{ package: import('@cfb/core-types').PluginPackage }>(`/api/plugins/${id}/visibility`, {
      method: 'PATCH',
      body: JSON.stringify({ visibility }),
    }),
}
