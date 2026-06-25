import type { L2Expr } from './l2.js'
import type { LogicBlockUpdatePolicy, LogicBlockVisibility, LogicBlockTrustTier } from './logic-blocks.js'
import type { RankerRef } from './plugins.js'

/** Reuse marketplace visibility and trust tiers from logic blocks. */
export type SortPackVisibility = LogicBlockVisibility
export type SortPackTrustTier = LogicBlockTrustTier
export type SortPackUpdatePolicy = LogicBlockUpdatePolicy

export interface SortPackRef {
  packageId: string
  versionPin: string
  label?: string
  updatePolicy?: SortPackUpdatePolicy
}

export interface SortPackPackage {
  id: string
  ownerDid: string
  slug: string
  version: string
  name: string
  description?: string
  visibility: SortPackVisibility
  trustTier: SortPackTrustTier
  sortKey: L2Expr
  createdAt: string
  updatedAt: string
  listing?: import('./marketplace-listing.js').MarketplaceListingMeta
}

export interface SortPackSubscription {
  ownerDid: string
  packageId: string
  versionPin: string
  updatePolicy: SortPackUpdatePolicy
  subscribedAt: string
}

/** Feed sorting hint when a sort pack ref is behind catalog latest. */
export interface SortPackUpgradeHint {
  packageId: string
  packageName: string
  label?: string
  pinnedVersion: string
  latestVersion: string
  updatePolicy: SortPackUpdatePolicy
  patchUpgrade: boolean
}

/** Feed rank: inline expression and/or marketplace sort pack reference. */
export interface FeedRankConfig {
  /** Native sort expression — used when no packRef. */
  sortKey?: L2Expr
  /** Marketplace sort pack — resolved at eval; takes precedence over sortKey when set. */
  packRef?: SortPackRef
  /** Custom ranker plugin — reorders skeleton at serve time; runs after DB sort, before inject. */
  rankerRef?: RankerRef
}
