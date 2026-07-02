import { useEffect, useRef, useState } from 'react'
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
  listing?: MarketplaceListingMeta
  disabled?: boolean
  onChange: (fields: Partial<ListingUrlFields>) => void
}

function ImageSlot({
  label,
  url,
  packageId,
  slot,
  disabled,
  onUploaded,
  onRemoved,
  className,
}: {
  label: string
  url?: string
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
  const [displayUrl, setDisplayUrl] = useState(url)

  useEffect(() => {
    setDisplayUrl(url)
    setImgError(false)
  }, [url])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const res = await api.uploadMarketplaceAsset(packageId, slot, file)
      const fresh = res.url + '?t=' + Date.now()
      setDisplayUrl(fresh)
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
    setDisplayUrl(undefined)
    setImgError(true)
    onRemoved()
  }

  return (
    <div className={`marketplace-asset-slot ${className ?? ''}`}>
      <span className="marketplace-asset-slot-label">{label}</span>
      <div className="marketplace-asset-slot-row">
        {displayUrl && !imgError ? (
          <img
            src={displayUrl}
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
        {displayUrl && !imgError && (
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

export function MarketplaceListingFields({ packageId, listing, disabled = false, onChange }: Props) {
  const [galleryUrls, setGalleryUrls] = useState<string[]>(listing?.galleryUrls ?? [])
  const [youtubeUrl, setYoutubeUrl] = useState(listing?.youtubeUrl ?? '')

  useEffect(() => {
    setGalleryUrls(listing?.galleryUrls ?? [])
    setYoutubeUrl(listing?.youtubeUrl ?? '')
  }, [listing])

  const nextGallerySlot = galleryUrls.length + 1

  return (
    <fieldset className="marketplace-listing-fields">
      <legend className="field-label">Storefront media</legend>

      <ImageSlot
        label="Icon (square)"
        url={listing?.iconUrl}
        packageId={packageId}
        slot="icon"
        disabled={disabled}
        onUploaded={(url) => onChange({ iconUrl: url })}
        onRemoved={() => onChange({ iconUrl: '' })}
        className="is-icon"
      />

      <ImageSlot
        label="Cover (wide banner)"
        url={listing?.coverUrl}
        packageId={packageId}
        slot="cover"
        disabled={disabled}
        onUploaded={(url) => onChange({ coverUrl: url })}
        onRemoved={() => onChange({ coverUrl: '' })}
        className="is-cover"
      />

      <div className="marketplace-asset-gallery">
        <span className="marketplace-asset-slot-label">
          Gallery ({galleryUrls.length}/8)
        </span>
        <div className="marketplace-asset-gallery-grid">
          {galleryUrls.map((url, i) => (
            <ImageSlot
              key={i}
              label={`Image ${i + 1}`}
              url={url}
              packageId={packageId}
              slot={`gallery-${i + 1}`}
              disabled={disabled}
              onUploaded={(newUrl) => {
                const next = [...galleryUrls]
                next[i] = newUrl
                setGalleryUrls(next)
                onChange({ galleryUrls: next })
              }}
              onRemoved={() => {
                const next = galleryUrls.filter((_, j) => j !== i)
                setGalleryUrls(next)
                onChange({ galleryUrls: next })
              }}
              className="is-gallery"
            />
          ))}
          {galleryUrls.length < 8 && (
            <ImageSlot
              label={`Add image ${nextGallerySlot}`}
              url={undefined}
              packageId={packageId}
              slot={`gallery-${nextGallerySlot}`}
              disabled={disabled}
              onUploaded={(url) => {
                const next = [...galleryUrls, url]
                setGalleryUrls(next)
                onChange({ galleryUrls: next })
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
          value={youtubeUrl}
          disabled={disabled}
          placeholder="https://youtube.com/watch?v=... or https://youtu.be/..."
          onChange={(e) => {
            setYoutubeUrl(e.target.value)
            onChange({ youtubeUrl: e.target.value })
          }}
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
