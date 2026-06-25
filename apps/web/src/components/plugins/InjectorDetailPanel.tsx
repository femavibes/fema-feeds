import { useEffect, useState } from 'react'
import type { PluginKind, PluginPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import { RequestListingButton } from '../marketplace/RequestListingButton'
import { PackageVersionHistory } from '../marketplace/PackageVersionHistory'
import { MarketplaceListingHero } from '../marketplace/MarketplaceListingHero'
import { LogicBlockMetadataFields } from '../logic-blocks/LogicBlockMetadataFields'
import { PluginWasmUploadPanel } from './PluginWasmUploadPanel'
import { LogicBlockTrustBadge, trustLabel, visibilityLabel } from '../logic-blocks/logic-block-labels'

export type InjectorDetailVariant = 'marketplace' | 'collection'
export type InjectorMarketplaceSection = 'details' | 'listing'

interface Props {
  kind?: PluginKind
  variant: InjectorDetailVariant
  marketplaceSection?: InjectorMarketplaceSection
  pkg: PluginPackage | null
  userDid?: string | null
  subscribedVersionPin?: string | null
  selectedVersion?: string
  onSelectedVersionChange?: (version: string) => void
  updatePolicy?: import('@cfb/core-types').PluginUpdatePolicy
  onUpdatePolicyChange?: (policy: import('@cfb/core-types').PluginUpdatePolicy) => void
  subscriptionBusy?: boolean
  onSubscribed?: () => void
  onPublished?: () => void
  onEditListing?: () => void
  onMetadataSaved?: (pkg: PluginPackage) => void
  onOpenDeveloperGuide?: () => void
}

export function InjectorDetailPanel({
  kind = 'injector',
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
  onEditListing,
  onMetadataSaved,
  onOpenDeveloperGuide,
}: Props) {
  const [versions, setVersions] = useState<PluginPackage[]>([])
  const [selectedVersion, setSelectedVersion] = useState('')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [metaDirty, setMetaDirty] = useState(false)
  const [updatePolicyLocal, setUpdatePolicyLocal] = useState<import('@cfb/core-types').PluginUpdatePolicy>('pinned')
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
      .listPluginVersions(pkg.id)
      .then((res) => setVersions(res.versions))
      .catch(() => setVersions([pkg]))
  }, [pkg?.id, pkg?.version])

  if (!pkg) {
    return (
      <div className="marketplace-sidebar-empty">
        <p>
          {variant === 'collection'
            ? 'Select an injector to publish or manage versions.'
            : 'Select a listing to preview and subscribe.'}
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
      await api.publishPluginVisibility(pkg.id, visibility)
      onPublished?.()
      setMessage(`Published to ${visibility === 'global' ? 'global marketplace' : 'this deployment'}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed')
    } finally {
      setBusy(false)
    }
  }

  const saveMetadata = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await api.updatePlugin(pkg.id, { name })
      onMetadataSaved?.(res.package)
      setMetaDirty(false)
      setMessage('Saved.')
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
          productKind={kind}
          ownerDid={pkg.ownerDid}
        />
      ) : (
        <>
          <div className="logic-block-detail-head">
            <h3>{pkg.name}</h3>
            <LogicBlockTrustBadge tier={pkg.trustTier} visibility={pkg.visibility} />
          </div>
          <p className="card-hint">
            {visibilityLabel(pkg.visibility)}
            {trustLabel(pkg) ? ` · ${trustLabel(pkg)}` : ''} · v{pkg.version} · {pkg.runtime}
          </p>
        </>
      )}

      {variant === 'marketplace' ? (
        <>
          <p className="logic-block-detail-sub">
            {pkg.slug} · {visibilityLabel(pkg.visibility)} · {pkg.runtime}
          </p>
          {pkg.manifest.hooks?.length ? (
            <p className="logic-block-detail-sub">Hooks: {pkg.manifest.hooks.join(', ')}</p>
          ) : null}
        </>
      ) : pkg.manifest.hooks?.length ? (
        <p className="card-hint">Hooks: {pkg.manifest.hooks.join(', ')}</p>
      ) : null}

      {variant === 'collection' && isOwner && (pkg.runtime === 'wasm' || pkg.runtime === 'worker') ? (
        <PluginWasmUploadPanel
          pkg={pkg}
          onOpenDeveloperGuide={onOpenDeveloperGuide}
          onUploaded={(next) => {
            onMetadataSaved?.(next)
          }}
        />
      ) : null}

      {variant === 'collection' && isOwner ? (
        <>
        <LogicBlockMetadataFields
          name={name}
          slug={slug}
          description={description}
          showDescription={false}
          onNameChange={(v) => {
            setName(v)
            setMetaDirty(true)
          }}
          onSlugChange={(v) => {
            setSlug(v)
            setMetaDirty(true)
          }}
          onDescriptionChange={() => {}}
        />
        {onEditListing ? (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={onEditListing}>
            Edit storefront listing
          </button>
        ) : null}
        </>
      ) : variant === 'collection' ? (
        pkg.description && <p className="card-hint">{pkg.description}</p>
      ) : null}

      {versions.length > 1 ? (
        <label className="l2-inspector-field">
          Version
          <select
            value={versionPin}
            onChange={(e) => {
              const next = e.target.value
              if (onSelectedVersionChange) onSelectedVersionChange(next)
              else setSelectedVersion(next)
            }}
            disabled={actionBusy}
          >
            {versions.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version}
                {v.version === latestVersion ? ' (latest)' : ''}
              </option>
            ))}
          </select>
        </label>
      ) : variant === 'marketplace' ? (
        <p className="logic-block-detail-version">Version v{versionPin}</p>
      ) : null}

      {variant === 'marketplace' && isSubscribed ? (
        <p className="settings-hint">
          Subscribed at v{subscribedVersionPin}
          {!onLatestPin && latestVersion !== subscribedVersionPin
            ? ` — v${latestVersion} available`
            : ''}
        </p>
      ) : null}

      {variant === 'collection' && isOwner ? (
        <PackageVersionHistory
          productKind="plugin"
          packageId={pkg.id}
          pluginKind={kind}
          latestVersion={pkg.version}
          mode="owner"
        />
      ) : null}

      {variant === 'marketplace' && pkg.visibility !== 'collection' && (!isSubscribed || !onLatestPin) ? (
        <label className="l2-inspector-field">
          Update policy
          <select
            value={updatePolicy}
            onChange={(e) =>
              setUpdatePolicy(e.target.value as import('@cfb/core-types').PluginUpdatePolicy)
            }
            disabled={actionBusy}
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
            {metaDirty && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void saveMetadata()}>
                Save name
              </button>
            )}
            {pkg.visibility === 'collection' && (
              <>
                <p className="card-hint">
                  <strong>Publish to this deployment</strong> — requires publisher verification for custom code.
                </p>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void publish('deployment')}>
                  Publish to deployment
                </button>
              </>
            )}
            <RequestListingButton
              productKind="plugin"
              packageId={pkg.id}
              visibility={pkg.visibility}
              disabled={busy}
            />
          </>
        )}
      </div>
    </div>
  )
}
