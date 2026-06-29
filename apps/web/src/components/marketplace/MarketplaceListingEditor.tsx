import { useEffect, useMemo, useState } from 'react'
import type {
  LogicBlockPackage,
  MarketplaceListingKind,
  PluginPackage,
  SortPackPackage,
} from '@cfb/core-types'

import { api } from '../../api/client'
import { MarketplaceCatalogCard } from './MarketplaceCatalogCard'
import { MarketplaceListingHero } from './MarketplaceListingHero'
import {
  MarketplaceListingFields,
  listingFieldsDirty,
  listingFieldsFromMeta,
  listingFieldsToPayload,
} from './MarketplaceListingFields'

export type ListingEditorTarget =
  | { productKind: 'logic_block'; pkg: LogicBlockPackage }
  | { productKind: 'sort_pack'; pkg: SortPackPackage }
  | { productKind: 'injector' | 'ranker' | 'enricher'; pkg: PluginPackage }

interface Props {
  target: ListingEditorTarget
  onBack: () => void
  onSaved: (target: ListingEditorTarget) => void
}

export function MarketplaceListingEditor({ target, onBack, onSaved }: Props) {
  const { pkg, productKind } = target
  const listingKind: MarketplaceListingKind =
    productKind === 'logic_block'
      ? 'logic_block'
      : productKind === 'sort_pack'
        ? 'sort_pack'
        : productKind

  const [description, setDescription] = useState(pkg.description ?? '')
  const [iconUrl, setIconUrl] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [productImageUrl, setProductImageUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setDescription(pkg.description ?? '')
    const fields = listingFieldsFromMeta(pkg.listing)
    setIconUrl(fields.iconUrl)
    setCoverUrl(fields.coverUrl)
    setProductImageUrl(fields.productImageUrl)
    setError(null)
    setMessage(null)
  }, [pkg.id, pkg.version, pkg.description, pkg.listing])

  const draftListing = useMemo(
    () => listingFieldsToPayload({ iconUrl, coverUrl, productImageUrl }) ?? undefined,
    [iconUrl, coverUrl, productImageUrl],
  )

  const dirty =
    description !== (pkg.description ?? '') ||
    listingFieldsDirty({ iconUrl, coverUrl, productImageUrl }, pkg.listing)

  const save = async () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const listingPayload = listingFieldsToPayload({ iconUrl, coverUrl, productImageUrl })
      let next: ListingEditorTarget
      if (productKind === 'logic_block') {
        const res = await api.updateLogicBlock(pkg.id, {
          description: description.trim() || null,
          listing: listingPayload,
          bumpVersion: false,
        })
        next = { productKind: 'logic_block', pkg: res.package }
      } else if (productKind === 'sort_pack') {
        const res = await api.updateSortPack(pkg.id, {
          description: description.trim() || null,
          listing: listingPayload,
        })
        next = { productKind: 'sort_pack', pkg: res.package }
      } else {
        const res = await api.updatePlugin(pkg.id, {
          description: description.trim() || null,
          listing: listingPayload,
        })
        next = { productKind, pkg: res.package }
      }
      onSaved(next)
      setMessage('Storefront listing saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="marketplace-listing-editor">
      <header className="marketplace-listing-editor-head">
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onBack}>
          ← Back to collection
        </button>
        <div className="marketplace-listing-editor-head-text">
          <h2>Storefront listing</h2>
          <p className="card-hint">
            {pkg.name} · shown on marketplace browse cards and detail pages
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || !dirty}
          onClick={() => void save()}
        >
          {busy ? 'Saving…' : 'Save listing'}
        </button>
      </header>

      {error ? <p className="field-error">{error}</p> : null}
      {message ? <p className="settings-hint">{message}</p> : null}

      <div className="marketplace-listing-editor-layout">
        <section className="marketplace-listing-editor-form">
          <label className="l2-inspector-field">
            Description
            <textarea
              rows={4}
              value={description}
              disabled={busy}
              placeholder="Short pitch for marketplace shoppers"
              onChange={(e) => {
                setDescription(e.target.value)
                setMessage(null)
              }}
            />
          </label>
          <MarketplaceListingFields
            iconUrl={iconUrl}
            coverUrl={coverUrl}
            productImageUrl={productImageUrl}
            disabled={busy}
            onIconUrlChange={(v) => {
              setIconUrl(v)
              setMessage(null)
            }}
            onCoverUrlChange={(v) => {
              setCoverUrl(v)
              setMessage(null)
            }}
            onProductImageUrlChange={(v) => {
              setProductImageUrl(v)
              setMessage(null)
            }}
          />
        </section>

        <section className="marketplace-listing-editor-preview" aria-label="Preview">
          <h3 className="field-label">Browse card preview</h3>
          <MarketplaceCatalogCard
            id={pkg.id}
            name={pkg.name}
            description={description}
            version={pkg.version}
            visibility={pkg.visibility}
            trustTier={pkg.trustTier}
            listing={draftListing}
            productKind={listingKind}
            ownerDid={pkg.ownerDid}
            updatedAt={pkg.updatedAt}
            selected={false}
            subscribed={false}
            onClick={() => {}}
          />
          <h3 className="field-label">Detail preview</h3>
          <MarketplaceListingHero
            packageId={pkg.id}
            name={pkg.name}
            description={description}
            visibility={pkg.visibility}
            trustTier={pkg.trustTier}
            listing={draftListing}
            productKind={listingKind}
            ownerDid={pkg.ownerDid}
          />
        </section>
      </div>
    </div>
  )

}
