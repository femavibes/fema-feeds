export type MarketplaceProductKind = 'logic_block' | 'sort_pack' | 'plugin'

export type MarketplacePublishRequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled'

export type MarketplacePublishRequestVisibility = 'deployment' | 'global'

export interface MarketplacePublishRequest {
  id: string
  productKind: MarketplaceProductKind
  packageId: string
  ownerDid: string
  requestedVisibility: MarketplacePublishRequestVisibility
  status: MarketplacePublishRequestStatus
  publisherNote?: string | null
  reviewerDid?: string | null
  reviewNote?: string | null
  createdAt: string
  reviewedAt?: string | null
  packageName?: string | null
  packageVersion?: string | null
}
