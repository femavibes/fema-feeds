import type { L2RuleGroup } from './l2.js'

/** Private collection → deployment catalog → global marketplace registry. */
export type LogicBlockVisibility = 'collection' | 'deployment' | 'global'

export type LogicBlockTrustTier = 'none' | 'deployment_verified' | 'global_verified'

export type LogicBlockUpdatePolicy = 'pinned' | 'notify' | 'auto_minor'

export type PublisherTrustScope = 'deployment' | 'global'

export interface PublisherVerificationStatus {
  publisherDid: string
  handle: string | null
  displayName: string | null
  deploymentVerified: boolean
  globalVerified: boolean
  deploymentVerifiedAt?: string
  globalVerifiedAt?: string
}

export interface LogicBlockRef {
  packageId: string
  versionPin: string
}

export interface LogicBlockPackage {
  id: string
  ownerDid: string
  slug: string
  version: string
  name: string
  description?: string
  visibility: LogicBlockVisibility
  trustTier: LogicBlockTrustTier
  root: L2RuleGroup
  createdAt: string
  updatedAt: string
}

export interface LogicBlockSubscription {
  ownerDid: string
  packageId: string
  versionPin: string
  updatePolicy: LogicBlockUpdatePolicy
  subscribedAt: string
}

/** Feed editor hint when a logic_block_ref is behind the catalog latest. */
export interface LogicBlockUpgradeHint {
  nodeId: string
  packageId: string
  packageName: string
  label?: string
  pinnedVersion: string
  latestVersion: string
  updatePolicy: LogicBlockUpdatePolicy
  /** Same major.minor — safe for auto_minor without editing the feed. */
  patchUpgrade: boolean
}
