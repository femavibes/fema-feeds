import { useRef, useState } from 'react'
import type { MarketplaceListingMeta } from '@cfb/core-types'
import { api } from '../../api/client'

export interface ListingUrlFields {
  iconUrl: string
  coverUrl: string
  productImageUrl: string
  galleryUrls: string[]
  youtubeUrl: string
}

interface Props {
  packageId: string
  fields: ListingUrlFields
  disabled?: boolean
  onChange: (fields: ListingUrlFields) => void
}

function ImageSlot({
  label,
  currentUrl,
  packageId,
  slot,
  disabled,
  onUploaded,
  onRemoved,
  className,
}: {
  label: string
  currentUrl?: string
  packageId: string
  slot: string
  disabled?: boolean
  onUploaded: (url: string) => void
  onRemoved: () => void
  className?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [imgError, setImgError] = useState(false)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const res = await api.uploadMarketplaceAsset(packageId, slot, file)
      const fresh = res.url + '?t=' + Date.now()
      setImgError(false)
      onUploaded(fresh)
    } catch (err) {
      console.error('[marketplace-asset] upload failed', err)
    } finally {
      setUploading(false)
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleRemove = async () => {
    await api.deleteMarketplaceAsset(packageId, slot).catch(() => {})
    setImgError(false)
    onRemoved()
  }

  const showImage = currentUrl && !imgError

  return (
    <div className={`marketplace-asset-slot ${className ?? ''}`}>
      <span className="marketplace-asset-slot-label">{label}</span>
      <div className="marketplace-asset-slot-row">
        {showImage ? (
          <img
            src={currentUrl}
            alt=""
            className="marketplace-asset-slot-preview"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="marketplace-asset-slot-empty" />
        )}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={disabled || uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? '...' : 'Upload'}
        </button>
        {showImage && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={disabled}
            onClick={() => void handleRemove()}
          >
            Remove
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => void handleUpload(e)}
        />
      </div>
    </div>
  )
}

export function MarketplaceListingFields({ packageId, fields, disabled = false, onChange }: Props) {
  const patch = (partial: Partial<ListingUrlFields>) => onChange({ ...fields, ...partial })

  return (
    <fieldset className="marketplace-listing-fields">
      <legend className="field-label">Storefront media</legend>

      <ImageSlot
        label="Icon (square)"
        currentUrl={fields.iconUrl || undefined}
        packageId={packageId}
        slot="icon"
        disabled={disabled}
        onUploaded={(url) => patch({ iconUrl: url })}
        onRemoved={() => patch({ iconUrl: '' })}
        className="is-icon"
      />

      <ImageSlot
        label="Cover (wide banner)"
        currentUrl={fields.coverUrl || undefined}
        packageId={packageId}
        slot="cover"
        disabled={disabled}
        onUploaded={(url) => patch({ coverUrl: url })}
        onRemoved={() => patch({ coverUrl: '' })}
        className="is-cover"
      />

      <div className="marketplace-asset-gallery">
        <span className="marketplace-asset-slot-label">
          Gallery ({fields.galleryUrls.length}/8)
        </span>
        <div className="marketplace-asset-gallery-grid">
          {fields.galleryUrls.map((url, i) => (
            <ImageSlot
              key={`gallery-${i}`}
              label={`Image ${i + 1}`}
              currentUrl={url}
              packageId={packageId}
              slot={`gallery-${i + 1}`}
              disabled={disabled}
              onUploaded={(newUrl) => {
                const next = [...fields.galleryUrls]
                next[i] = newUrl
                patch({ galleryUrls: next })
              }}
              onRemoved={() => {
                const next = fields.galleryUrls.filter((_, j) => j !== i)
                patch({ galleryUrls: next })
              }}
              className="is-gallery"
            />
          ))}
          {fields.galleryUrls.length < 8 && (
            <ImageSlot
              label="Add image"
              currentUrl={undefined}
              packageId={packageId}
              slot={`gallery-${fields.galleryUrls.length + 1}`}
              disabled={disabled}
              onUploaded={(url) => {
                patch({ galleryUrls: [...fields.galleryUrls, url] })
              }}
              onRemoved={() => {}}
              className="is-gallery"
            />
          )}
        </div>
      </div>

      <label className="l2-inspector-field">
        YouTube video URL
        <input
          type="url"
          value={fields.youtubeUrl}
          disabled={disabled}
          placeholder="https://youtube.com/watch?v=... or https://youtu.be/..."
          onChange={(e) => patch({ youtubeUrl: e.target.value })}
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
    galleryUrls: listing?.galleryUrls ?? [],
    youtubeUrl: listing?.youtubeUrl ?? '',
  }
}

export function listingFieldsToPayload(fields: ListingUrlFields): MarketplaceListingMeta | null {
  const iconUrl = fields.iconUrl.trim()
  const coverUrl = fields.coverUrl.trim()
  const productImageUrl = fields.productImageUrl.trim()
  const galleryUrls = fields.galleryUrls.filter((u) => u.trim())
  const youtubeUrl = fields.youtubeUrl.trim()
  if (!iconUrl && !coverUrl && !productImageUrl && !galleryUrls.length && !youtubeUrl) return null
  const out: MarketplaceListingMeta = {}
  if (iconUrl) out.iconUrl = iconUrl
  if (coverUrl) out.coverUrl = coverUrl
  if (productImageUrl) out.productImageUrl = productImageUrl
  if (galleryUrls.length) out.galleryUrls = galleryUrls
  if (youtubeUrl) out.youtubeUrl = youtubeUrl
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
    fields.productImageUrl !== base.productImageUrl ||
    fields.youtubeUrl !== base.youtubeUrl ||
    JSON.stringify(fields.galleryUrls) !== JSON.stringify(base.galleryUrls)
  )
}
