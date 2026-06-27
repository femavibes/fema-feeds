import type { LogicBlockTrustTier, LogicBlockVisibility } from '@cfb/core-types'
import type { MarketplaceListingKind } from '@cfb/core-types'

import { formatUpdatedLabel, resolveListingPresentation } from '../../lib/marketplace-listing'
import { LogicBlockTrustBadge } from '../logic-blocks/logic-block-labels'
import { MarketplaceListingCover } from './MarketplaceListingMedia'
import { MarketplaceListingRating } from './MarketplaceListingRating'
import { PublisherProfileLink } from './PublisherProfileLink'

interface Props {
  id: string
  name: string
  description?: string
  version: string
  visibility: LogicBlockVisibility
  trustTier: LogicBlockTrustTier
  listing?: import('@cfb/core-types').MarketplaceListingMeta
  updatedAt?: string
  productKind: MarketplaceListingKind
  ownerDid?: string
  subtitle?: string
  subscribed?: boolean
  selected?: boolean
  sources?: string[]
  onClick: () => void
}

export function MarketplaceCatalogCard({
  id,
  name,
  description,
  version,
  visibility,
  trustTier,
  listing,
  updatedAt,
  productKind,
  ownerDid,
  subtitle,
  subscribed,
  selected,
  sources,
  onClick,
}: Props) {
  const presentation = resolveListingPresentation({
    id,
    name,
    description,
    listing,
    productKind,
  })
  const updatedLabel = formatUpdatedLabel(updatedAt)

  return (
    <button
      type="button"
      className={`marketplace-catalog-card${selected ? ' is-selected' : ''}`}
      onClick={onClick}
    >
      <MarketplaceListingCover presentation={presentation} productKind={productKind} variant="thumb" />
      <div className="marketplace-catalog-card-body">
        <div className="marketplace-catalog-card-head">
          <span className="marketplace-catalog-card-name">{name}</span>
          <LogicBlockTrustBadge tier={trustTier} visibility={visibility} sources={sources} />
        </div>
        <MarketplaceListingRating
          average={presentation.ratingAverage}
          count={presentation.ratingCount}
          compact
        />
        <p className="marketplace-catalog-card-desc">{presentation.description}</p>
        {ownerDid ? <PublisherProfileLink did={ownerDid} size="sm" stopPropagation /> : null}
        <p className="marketplace-catalog-card-sub">
          v{version}
          {subtitle ? ` · ${subtitle}` : ''}
          {subscribed ? ' · Subscribed' : ''}
          {updatedLabel ? ` · ${updatedLabel}` : ''}
        </p>
      </div>
    </button>
  )
}
