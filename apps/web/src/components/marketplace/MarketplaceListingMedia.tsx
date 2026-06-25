import type { MarketplaceListingKind } from '@cfb/core-types'

import {
  listingGradientStyle,
  resolveListingPresentation,
  type ListingPresentation,
} from '../../lib/marketplace-listing'
import { MarketplaceProductGlyph } from './MarketplaceProductGlyph'

interface MediaProps {
  presentation: ListingPresentation
  productKind: MarketplaceListingKind
  variant: 'thumb' | 'hero'
}

export function MarketplaceListingCover({ presentation, productKind, variant }: MediaProps) {
  const coverStyle = presentation.coverUrl
    ? { backgroundImage: `url(${presentation.coverUrl})` }
    : listingGradientStyle(presentation.paletteSeed)

  return (
    <div className={`marketplace-listing-cover is-${variant}`} style={coverStyle}>
      <div className="marketplace-listing-cover-shade" />
      <div className="marketplace-listing-icon-wrap">
        {presentation.iconUrl ? (
          <img
            className="marketplace-listing-icon-img"
            src={presentation.iconUrl}
            alt=""
            loading="lazy"
          />
        ) : (
          <span className="marketplace-listing-icon-placeholder" style={listingGradientStyle(`${presentation.paletteSeed}-icon`)}>
            <MarketplaceProductGlyph kind={productKind} className="marketplace-listing-icon-glyph" />
          </span>
        )}
      </div>
    </div>
  )
}

export function MarketplaceListingProductImage({
  presentation,
  productKind,
}: {
  presentation: ListingPresentation
  productKind: MarketplaceListingKind
}) {
  if (presentation.productImageUrl) {
    return (
      <div className="marketplace-listing-product-image">
        <img src={presentation.productImageUrl} alt="" loading="lazy" />
      </div>
    )
  }

  return (
    <div
      className="marketplace-listing-product-image is-placeholder"
      style={listingGradientStyle(`${presentation.paletteSeed}-shot`)}
      aria-hidden
    >
      <MarketplaceProductGlyph kind={productKind} className="marketplace-listing-shot-glyph" />
      <span className="marketplace-listing-shot-label">Preview coming soon</span>
    </div>
  )
}

export function useListingPresentation(input: {
  id: string
  name: string
  description?: string
  listing?: import('@cfb/core-types').MarketplaceListingMeta
  productKind: MarketplaceListingKind
}) {
  return resolveListingPresentation(input)
}
