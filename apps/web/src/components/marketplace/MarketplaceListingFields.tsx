import type { MarketplaceListingMeta } from '@cfb/core-types'

export interface ListingUrlFields {
  iconUrl: string
  coverUrl: string
  productImageUrl: string
}

interface Props {
  iconUrl: string
  coverUrl: string
  productImageUrl: string
  disabled?: boolean
  onIconUrlChange: (value: string) => void
  onCoverUrlChange: (value: string) => void
  onProductImageUrlChange: (value: string) => void
}

export function MarketplaceListingFields({
  iconUrl,
  coverUrl,
  productImageUrl,
  disabled = false,
  onIconUrlChange,
  onCoverUrlChange,
  onProductImageUrlChange,
}: Props) {
  return (
    <fieldset className="marketplace-listing-fields">
      <legend className="field-label">Storefront listing</legend>
      <p className="card-hint">
        Optional URLs for marketplace browse cards and detail pages. Description above is the primary
        text; leave images empty to use generated gradients.
      </p>
      <label className="l2-inspector-field">
        Icon URL
        <input
          type="url"
          value={iconUrl}
          disabled={disabled}
          placeholder="https://… square icon"
          onChange={(e) => onIconUrlChange(e.target.value)}
        />
      </label>
      <label className="l2-inspector-field">
        Cover URL
        <input
          type="url"
          value={coverUrl}
          disabled={disabled}
          placeholder="https://… wide banner"
          onChange={(e) => onCoverUrlChange(e.target.value)}
        />
      </label>
      <label className="l2-inspector-field">
        Product image URL
        <input
          type="url"
          value={productImageUrl}
          disabled={disabled}
          placeholder="https://… hero / screenshot"
          onChange={(e) => onProductImageUrlChange(e.target.value)}
        />
      </label>
    </fieldset>
  )
}

export function listingFieldsFromMeta(listing?: MarketplaceListingMeta): ListingUrlFields {
  return {
    iconUrl: listing?.iconUrl ?? '',
    coverUrl: listing?.coverUrl ?? '',
    productImageUrl: listing?.productImageUrl ?? '',
  }
}

export function listingFieldsToPayload(fields: ListingUrlFields): MarketplaceListingMeta | null {
  const iconUrl = fields.iconUrl.trim()
  const coverUrl = fields.coverUrl.trim()
  const productImageUrl = fields.productImageUrl.trim()
  if (!iconUrl && !coverUrl && !productImageUrl) return null
  const out: MarketplaceListingMeta = {}
  if (iconUrl) out.iconUrl = iconUrl
  if (coverUrl) out.coverUrl = coverUrl
  if (productImageUrl) out.productImageUrl = productImageUrl
  return out
}

export function listingFieldsDirty(
  fields: ListingUrlFields,
  listing?: MarketplaceListingMeta,
): boolean {
  const base = listingFieldsFromMeta(listing)
  return (
    fields.iconUrl !== base.iconUrl ||
    fields.coverUrl !== base.coverUrl ||
    fields.productImageUrl !== base.productImageUrl
  )
}
