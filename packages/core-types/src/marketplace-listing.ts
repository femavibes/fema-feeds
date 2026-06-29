/** Optional storefront assets publishers can attach to a listing. */
export interface MarketplaceListingMeta {
  iconUrl?: string
  coverUrl?: string
  productImageUrl?: string
  /** 0–5 average; omit when no ratings exist yet. */
  ratingAverage?: number
  ratingCount?: number
}

/** Product kind for storefront presentation (browse cards, detail hero). */
export type MarketplaceListingKind = 'logic_block' | 'sort_pack' | 'injector' | 'ranker' | 'enricher'
