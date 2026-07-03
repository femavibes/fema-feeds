/** Optional storefront assets publishers can attach to a listing. */
export interface MarketplaceListingMeta {
  iconUrl?: string
  coverUrl?: string
  productImageUrl?: string
  /** Up to 8 gallery/screenshot images. */
  galleryUrls?: string[]
  /** YouTube video URL (watch or short link). */
  youtubeUrl?: string
  /** Primary category (one per package). */
  category?: string
  /** Freeform tags (up to 5, from taxonomy list). */
  tags?: string[]
  /** 0–5 average; omit when no ratings exist yet. */
  ratingAverage?: number
  ratingCount?: number
}

/** Product kind for storefront presentation (browse cards, detail hero). */
export type MarketplaceListingKind = 'logic_block' | 'sort_pack' | 'injector' | 'ranker' | 'enricher'
