import { useEffect, useState } from 'react'
import type { LogicBlockPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import { RequestListingButton } from '../marketplace/RequestListingButton'
import { MarketplaceListingHero } from '../marketplace/MarketplaceListingHero'
import { PackageVersionHistory } from '../marketplace/PackageVersionHistory'
import { LogicBlockMetadataFields } from './LogicBlockMetadataFields'
import { LogicBlockTrustBadge, trustLabel, visibilityLabel } from './logic-block-labels'

export type LogicBlockDetailVariant = 'marketplace' | 'collection'
export type LogicBlockMarketplaceSection = 'details' | 'listing'

interface Props {
  variant: LogicBlockDetailVariant
  marketplaceSection?: LogicBlockMarketplaceSection
  pkg: LogicBlockPackage | null
  userDid?: string | null
  subscribedVersionPin?: string | null
  selectedVersion?: string
  onSelectedVersionChange?: (version: string) => void
  updatePolicy?: import('@cfb/core-types').LogicBlockUpdatePolicy
  onUpdatePolicyChange?: (policy: import('@cfb/core-types').LogicBlockUpdatePolicy) => void
  subscriptionBusy?: boolean
  onSubscribed?: () => void
  onPublished?: () => void
  onEdit?: () => void
  onEditListing?: () => void
  onMetadataSaved?: (pkg: LogicBlockPackage) => void
}

export function LogicBlockDetailPanel({
  variant,
  marketplaceSection,
  pkg,
  userDid,
  subscribedVersionPin,
  selectedVersion: selectedVersionProp,
  onSelectedVersionChange,
  updatePolicy: updatePolicyProp,
  onUpdatePolicyChange,
  subscriptionBusy = false,
  onSubscribed,
  onPublished,
  onEdit,
  onEditListing,
  onMetadataSaved,
}: Props) {
  const [versions, setVersions] = useState<LogicBlockPackage[]>([])
  const [selectedVersion, setSelectedVersion] = useState('')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [metaDirty, setMetaDirty] = useState(false)
  const [updatePolicyLocal, setUpdatePolicyLocal] = useState<import('@cfb/core-types').LogicBlockUpdatePolicy>('pinned')
  const updatePolicy = updatePolicyProp ?? updatePolicyLocal
  const setUpdatePolicy = onUpdatePolicyChange ?? setUpdatePolicyLocal
  const [busy, setBusy] = useState(false)
  const actionBusy = busy || subscriptionBusy
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!pkg) {
      setVersions([])
      setSelectedVersion('')
      setName('')
      setSlug('')
      setDescription('')
      setMetaDirty(false)
      setError(null)
      setMessage(null)
      return
    }
    setSelectedVersion(subscribedVersionPin ?? pkg.version)
    setName(pkg.name)
    setSlug(pkg.slug)
    setDescription(pkg.description ?? '')
    setMetaDirty(false)
    setError(null)
    setMessage(null)
    void api
      .listLogicBlockVersions(pkg.id)
      .then((res) => setVersions(res.versions))
      .catch(() => setVersions([pkg]))
  }, [pkg?.id, pkg?.version])

  if (!pkg) {
    return (
      <div className="marketplace-sidebar-empty">
        <p>
          {variant === 'collection'
            ? 'Select a saved logic block to publish or manage versions.'
            : 'Select a listing to preview trust status and subscribe.'}
        </p>
      </div>
    )
  }

  const versionPin = selectedVersionProp ?? (selectedVersion || pkg.version)
  const isMarketplaceDetails = variant === 'marketplace' && marketplaceSection === 'details'
  const showMarketplaceHero = variant === 'marketplace' && !isMarketplaceDetails
  const isSubscribed = subscribedVersionPin != null
  const onLatestPin = isSubscribed && subscribedVersionPin === versionPin
  const latestVersion = versions[0]?.version ?? pkg.version
  const isOwner = Boolean(userDid && pkg.ownerDid === userDid)

  const publish = async (visibility: 'deployment' | 'global') => {
    setBusy(true)
    setError(null)
    try {
      await api.publishLogicBlockVisibility(pkg.id, visibility)
      onPublished?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed')
    } finally {
      setBusy(false)
    }
  }

  const saveMetadata = async () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await api.updateLogicBlock(pkg.id, {
        name: name.trim(),
        slug: slug.trim() || name.trim(),
        bumpVersion: false,
      })
      setName(res.package.name)
      setSlug(res.package.slug)
      setMetaDirty(false)
      setMessage('Details saved')
      onMetadataSaved?.(res.package)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="logic-block-detail-panel">
      {showMarketplaceHero ? (
        <MarketplaceListingHero
          packageId={pkg.id}
          name={pkg.name}
          description={pkg.description}
          visibility={pkg.visibility}
          trustTier={pkg.trustTier}
          listing={pkg.listing}
          productKind="logic_block"
          ownerDid={pkg.ownerDid}
        />
      ) : null}
      {variant === 'collection' && isOwner ? (
        <>
          <LogicBlockMetadataFields
            name={name}
            slug={slug}
            description={description}
            showDescription={false}
            disabled={busy}
            onNameChange={(v) => {
              setName(v)
              setMetaDirty(true)
              setMessage(null)
            }}
            onSlugChange={(v) => {
              setSlug(v)
              setMetaDirty(true)
              setMessage(null)
            }}
            onDescriptionChange={() => {}}
          />
          {onEditListing ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={onEditListing}
            >
              Edit storefront listing
            </button>
          ) : null}
          {metaDirty ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy || !name.trim()}
              onClick={() => void saveMetadata()}
            >
              {busy ? 'Saving…' : 'Save name & slug'}
            </button>
          ) : null}
        </>
      ) : variant === 'collection' ? (
        <>
          <h3 className="logic-block-detail-name">{pkg.name}</h3>
          <p className="logic-block-detail-sub">
            {pkg.slug} · {visibilityLabel(pkg.visibility)}
          </p>
        </>
      ) : null}
      {variant === 'collection' && isOwner ? (
        <p className="logic-block-detail-sub">{visibilityLabel(pkg.visibility)} · v{pkg.version}</p>
      ) : variant === 'marketplace' ? (
        <p className="logic-block-detail-sub">
          {pkg.slug} · {visibilityLabel(pkg.visibility)}
        </p>
      ) : null}
      {variant === 'collection' ? (
        <div className="logic-block-detail-badges">
          <LogicBlockTrustBadge tier={pkg.trustTier} visibility={pkg.visibility} />
        </div>
      ) : null}
      {pkg.description && variant === 'collection' && !isOwner ? (
        <p className="card-hint">{pkg.description}</p>
      ) : null}
      {trustLabel(pkg) ? <p className="settings-hint">{trustLabel(pkg)}</p> : null}

      {variant === 'marketplace' && pkg.visibility === 'global' ? (
        <p className="settings-hint">
          Global verification is issued by the platform marketplace (fema.monster).
        </p>
      ) : null}

      {versions.length > 1 ? (
        <label className="l2-inspector-field">
          Version
          <select
            value={versionPin}
            disabled={actionBusy}
            onChange={(e) => {
              const next = e.target.value
              if (onSelectedVersionChange) onSelectedVersionChange(next)
              else setSelectedVersion(next)
            }}
          >
            {versions.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version}
                {v.version === latestVersion ? ' (latest)' : ''}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="logic-block-detail-version">Version v{versionPin}</p>
      )}

      {variant === 'collection' && isOwner ? (
        <PackageVersionHistory
          productKind="logic_block"
          packageId={pkg.id}
          latestVersion={latestVersion}
          mode="owner"
        />
      ) : null}

      {variant === 'marketplace' && isSubscribed ? (
        <p className="settings-hint">
          Subscribed at v{subscribedVersionPin}
          {!onLatestPin && latestVersion !== subscribedVersionPin
            ? ` — v${latestVersion} available`
            : ''}
        </p>
      ) : null}

      {variant === 'marketplace' && pkg.visibility !== 'collection' && (!isSubscribed || !onLatestPin) ? (
        <label className="l2-inspector-field">
          Update policy
          <select
            value={updatePolicy}
            disabled={actionBusy}
            onChange={(e) =>
              setUpdatePolicy(e.target.value as import('@cfb/core-types').LogicBlockUpdatePolicy)
            }
          >
            <option value="pinned">Pinned — stay on this version until you upgrade</option>
            <option value="notify">Notify — flag when a newer version exists (manual upgrade)</option>
            <option value="auto_minor">Auto minor — apply patch releases automatically</option>
          </select>
        </label>
      ) : null}

      {error ? <p className="field-error">{error}</p> : null}
      {message ? <p className="settings-hint">{message}</p> : null}

      <div className="logic-block-detail-actions">
        {variant === 'collection' && isOwner && (
          <>
            {pkg.visibility === 'collection' && (
              <>
                <p className="card-hint">
                  <strong>Publish to this deployment</strong> — lists immediately in the local
                  marketplace. Verification badge is separate (deployment master under Moderate
                  listings).
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => void publish('deployment')}
                >
                  Publish to this deployment
                </button>
              </>
            )}
            <RequestListingButton
              productKind="logic_block"
              packageId={pkg.id}
              visibility={pkg.visibility}
              disabled={busy}
            />
            {pkg.visibility === 'deployment' ? (
              <p className="card-hint">
                Listed on this deployment — still editable here. Use <strong>Submit to global
                marketplace</strong> below to request a global listing.
              </p>
            ) : pkg.visibility !== 'collection' ? (
              <p className="card-hint">
                Listed on the marketplace and still in your collection — edit anytime; saving logic
                bumps the version.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
