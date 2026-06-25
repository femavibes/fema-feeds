import type { LogicBlockTrustTier, LogicBlockVisibility, MarketplaceListingKind } from '@cfb/core-types'

import { resolveListingPresentation } from '../../lib/marketplace-listing'
import { LogicBlockTrustBadge } from '../logic-blocks/logic-block-labels'
import { MarketplaceListingCover, MarketplaceListingProductImage } from './MarketplaceListingMedia'
import { MarketplaceListingRating } from './MarketplaceListingRating'
import { PublisherProfileLink } from './PublisherProfileLink'

interface Props {
  name: string
  description?: string
  visibility: LogicBlockVisibility
  trustTier: LogicBlockTrustTier
  listing?: import('@cfb/core-types').MarketplaceListingMeta
  productKind: MarketplaceListingKind
  packageId: string
  ownerDid?: string
}

export function MarketplaceListingHero({
  name,
  description,
  visibility,
  trustTier,
  listing,
  productKind,
  packageId,
  ownerDid,
}: Props) {
  const presentation = resolveListingPresentation({
    id: packageId,
    name,
    description,
    listing,
    productKind,
  })

  return (
    <div className="marketplace-listing-hero">
      <MarketplaceListingCover presentation={presentation} productKind={productKind} variant="hero" />
      <div className="marketplace-listing-hero-body">
        <div className="marketplace-listing-hero-title-row">
          <h3 className="marketplace-listing-hero-name">{name}</h3>
          <LogicBlockTrustBadge tier={trustTier} visibility={visibility} />
        </div>
        <MarketplaceListingRating
          average={presentation.ratingAverage}
          count={presentation.ratingCount}
        />
        {ownerDid ? <PublisherProfileLink did={ownerDid} size="md" /> : null}
        <p className="marketplace-listing-hero-desc">{presentation.description}</p>
        <MarketplaceListingProductImage presentation={presentation} productKind={productKind} />
      </div>
    </div>
  )
}
