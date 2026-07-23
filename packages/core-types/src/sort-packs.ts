import type { L2Expr } from './l2.js'
import type { LogicBlockUpdatePolicy, LogicBlockVisibility, LogicBlockTrustTier } from './logic-blocks.js'
import type { RankerRef } from './plugins.js'

/** Reuse marketplace visibility and trust tiers from logic blocks. */
export type SortPackVisibility = LogicBlockVisibility
export type SortPackTrustTier = LogicBlockTrustTier
export type SortPackUpdatePolicy = LogicBlockUpdatePolicy
/** Stored formula purpose — sort uses post metrics; personalization uses viewer signals. */
export type SortPackKind = 'sort' | 'personalization'

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
  packKind: SortPackKind
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


export interface EngagementSignal {
  enabled: boolean
  weight: number
}

export interface EngagementWeights {
  likes: EngagementSignal
  reposts: EngagementSignal
  replies: EngagementSignal
  quotes: EngagementSignal
  bookmarks: EngagementSignal
  audienceLikes: EngagementSignal
  audienceReposts: EngagementSignal
}

export interface ContentSignals {
  authorFollowers: EngagementSignal
  authorPosts: EngagementSignal
  textLength: EngagementSignal
  hashtagCount: EngagementSignal
  mentionCount: EngagementSignal
  linkCount: EngagementSignal
  altTextBonus: EngagementSignal
  rootPostBonus: EngagementSignal
  replyBonus: EngagementSignal
  quotePostBonus: EngagementSignal
}

export interface RatioSignals {
  engagementRate: EngagementSignal
  replyRatio: EngagementSignal
  quoteRatio: EngagementSignal
}

export interface MediaBonus {
  image: EngagementSignal
  video: EngagementSignal
  linkCard: EngagementSignal
}

export type AuthorFairnessMode = 'off' | 'log' | 'sqrt' | 'sigmoid'

export type DecayMode = 'none' | 'halflife' | 'exponential' | 'rate'

export interface SortTuning {
  decayMode: DecayMode
  decayHalfLifeHours: number
  editorScoreWeight: number
  maxAgeHours: number
  authorFairness: AuthorFairnessMode
  mediaBonus: MediaBonus
  contentSignals: ContentSignals
  ratioSignals: RatioSignals
  scoreCap: number
  scoreFloor: number
}

/** Feed rank: inline expression and/or marketplace sort pack reference. */

/** Sort modifier mode: how a modifier contributes to the final score. */
export type SortModifierMode = 'add' | 'multiply'

/** A stacked sort modifier — runs custom code and adds/multiplies into the base score. */
export interface SortModifier {
  packageId: string
  versionPin: string
  label?: string
  mode: SortModifierMode
  /** For 'add': multiplied by this before adding. For 'multiply': unused. */
  weight?: number
  config?: Record<string, unknown>
}

export interface FeedRankConfig {
  /** Native sort expression — used when no packRef. */
  sortKey?: L2Expr
  /** Marketplace sort pack — resolved at eval; takes precedence over sortKey when set. */
  packRef?: SortPackRef
  /** Stacked custom code sort modifiers (add/multiply on top of base score). */
  modifiers?: SortModifier[]

  /** UI tuning values — stored alongside sortKey so the panel can restore them without pattern-matching. */
  tuning?: SortTuning
  /** Custom ranker plugin — reorders skeleton at serve time; runs after DB sort, before inject. */
  rankerRef?: RankerRef
}
