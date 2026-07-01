export type FeedWorkspaceView = 'overview' | 'visual' | 'json' | 'sorting' | 'personalization' | 'injectors' | 'sources'

export type IngestionWorkspaceView = 'overview' | 'visual' | 'json' | 'prefilter' | 'settings'

export type MarketplaceWorkspaceView = 'browse' | 'installed' | 'verify' | 'moderate'

import {
  MARKETPLACE_CUSTOM_CODE_KINDS,
  MARKETPLACE_NATIVE_KINDS,
  MARKETPLACE_PRODUCTS,
} from './marketplace-products'

export type MarketplaceBrowseKind = keyof typeof MARKETPLACE_PRODUCTS

/** `all` = cross-category overview (Featured / All); otherwise a single product tab. */
export type MarketplaceProductScope = MarketplaceBrowseKind | 'all'

export const MARKETPLACE_BROWSE_KINDS: { id: MarketplaceBrowseKind; label: string }[] = (
  Object.keys(MARKETPLACE_PRODUCTS) as MarketplaceBrowseKind[]
).map((id) => ({ id, label: MARKETPLACE_PRODUCTS[id].label }))

export { MARKETPLACE_CUSTOM_CODE_KINDS, MARKETPLACE_NATIVE_KINDS, MARKETPLACE_PRODUCTS }

export type CommunityWorkspaceView = 'feeds' | 'templates' | 'users'

export type CollectionWorkspaceView = 'blocks' | 'developer_guide'

export type SettingsWorkspaceView =
  | 'publishing'
  | 'ingest'
  | 'pool'
  | 'purge'
  | 'labelers'
  | 'enrichment'
  | 'access'
  | 'user'
  | 'developer'
