/** Marketplace plugin kinds — custom code tiers beyond native JSON packages. */
export type PluginKind = 'injector' | 'ranker' | 'enricher'

export type PluginRuntime = 'native' | 'remote' | 'worker' | 'wasm'

export type PluginVisibility = import('./logic-blocks.js').LogicBlockVisibility
export type PluginTrustTier = import('./logic-blocks.js').LogicBlockTrustTier
export type PluginUpdatePolicy = import('./logic-blocks.js').LogicBlockUpdatePolicy

/** Standard manifest every custom-code listing must ship. */
export interface PluginManifest {
  id: string
  version: string
  kind: PluginKind
  runtime: PluginRuntime
  hooks: string[]
  permissions: string[]
  configSchema?: Record<string, unknown>
  /** Default disclosure when feed does not override. */
  disclosure?: string
}

export interface PluginPackage {
  id: string
  ownerDid: string
  slug: string
  version: string
  name: string
  description?: string
  kind: PluginKind
  runtime: PluginRuntime
  visibility: PluginVisibility
  trustTier: PluginTrustTier
  manifest: PluginManifest
  /** Remote injector endpoint (runtime=remote). */
  remoteEndpoint?: string
  wasmSha256?: string
  wasmSize?: number
  createdAt: string
  updatedAt: string
  listing?: import('./marketplace-listing.js').MarketplaceListingMeta
}

export interface PluginSubscription {
  ownerDid: string
  packageId: string
  versionPin: string
  updatePolicy: PluginUpdatePolicy
  subscribedAt: string
}

/** Slot rules enforced by CFB — remote APIs cannot override these caps. */
export interface FeedInjectorSlots {
  /** Insert after every N organic posts (min 1). */
  every: number
  /** Max injected URIs per skeleton page. */
  maxPerPage: number
}

/** Per-feed injector wiring (post-sort, pre-skeleton). */
export interface FeedInjectorConfig {
  packageId: string
  versionPin: string
  label?: string
  slots: FeedInjectorSlots
  disclosure?: string
  config?: Record<string, unknown>
}

/** Marketplace ranker reference — resolved at skeleton serve time (`onSort`). */
export interface RankerRef {
  packageId: string
  versionPin: string
  label?: string
  updatePolicy?: PluginUpdatePolicy
  config?: Record<string, unknown>
}

/** Remote injector API contract (POST JSON). */
export interface RemoteInjectorRequest {
  feedId: string
  limit: number
  slots: FeedInjectorSlots
  config?: Record<string, unknown>
}

export interface RemoteInjectorResponse {
  uris: string[]
}

import type { RankerCandidate } from './rank-snapshot.js'
import type { ViewerContext } from './viewer-context.js'
export type { NearYouMediaType, PostRankSnapshot, RankerCandidate } from './rank-snapshot.js'
export type { FeedInteractionEvent, ServedPostRecord, ViewerContext } from './viewer-context.js'

/** Remote ranker API contract (POST JSON). */
export interface RemoteRankerRequest {
  feedId: string
  limit: number
  candidates: string[]
  /** Enriched post rows aligned with `candidates` when the host can load pool data. */
  candidatePosts?: RankerCandidate[]
  /** Authenticated Bluesky viewer DID (from Authorization JWT). */
  viewerDid?: string
  /** Per-viewer follow graph + impression history for personalization rankers. */
  viewer?: ViewerContext
  config?: Record<string, unknown>
}

export interface RemoteRankerResponse {
  uris: string[]
}


// --- Enrichers ---

/** When the enricher runs against posts. */
export type EnricherTriggerMode = 'on_ingest' | 'background_sweep' | 'both'

/** Scope: which posts does this enricher process? */
export type EnricherScope = 'global' | 'project'

/** Enricher-specific manifest fields. */
export interface EnricherManifest extends PluginManifest {
  kind: 'enricher'
  /** Hook export name for WASM enrichers. */
  hooks: ['on_enrich']
  /** When to run. */
  triggerMode: EnricherTriggerMode
  /** Which posts to target. */
  scope: EnricherScope
  /** Fields this enricher writes (for dependency tracking). */
  outputFields: string[]
  /** Other enrichers this one depends on (must run first). */
  dependsOn?: string[]
  /** Max posts to process per sweep batch. */
  batchSize?: number
  /** Skip posts that already have enrichment from this enricher+version. */
  skipEnriched?: boolean
}

/** Remote enricher API contract (POST JSON). */
export interface RemoteEnricherRequest {
  enricherId: string
  version: string
  posts: Array<{
    uri: string
    text: string
    authorDid: string
    indexedAt: string
    langs: string[]
    embed: import('./index.js').EmbedFlags
    embedDetail?: unknown
    existingEnrichment?: Record<string, unknown>
  }>
  config?: Record<string, unknown>
}

export interface RemoteEnricherResponse {
  results: Array<{
    uri: string
    data: Record<string, unknown>
    skipped?: boolean
    error?: string
  }>
}

/** Per-project enricher subscription config. */
export interface EnricherConfig {
  packageId: string
  versionPin: string
  enabled: boolean
  /** Override trigger mode (if enricher supports both). */
  triggerMode?: EnricherTriggerMode
  /** Custom config passed to the enricher. */
  config?: Record<string, unknown>
}
