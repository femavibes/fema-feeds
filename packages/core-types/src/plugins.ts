/** Marketplace plugin kinds — custom code tiers beyond native JSON packages. */
export type PluginKind = 'injector' | 'ranker'

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
