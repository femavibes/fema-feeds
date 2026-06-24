import { useEffect, useState } from 'react'
import type { SortPackPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import { LogicBlockMetadataFields } from '../logic-blocks/LogicBlockMetadataFields'
import { LogicBlockTrustBadge, trustLabel, visibilityLabel } from '../logic-blocks/logic-block-labels'

export type SortPackDetailVariant = 'marketplace' | 'collection'

interface Props {
  variant: SortPackDetailVariant
  pkg: SortPackPackage | null
  userDid?: string | null
  subscribedVersionPin?: string | null
  onSubscribed?: () => void
  onPublished?: () => void
  onMetadataSaved?: (pkg: SortPackPackage) => void
}

export function SortPackDetailPanel({
  variant,
  pkg,
  userDid,
  subscribedVersionPin,
  onSubscribed,
  onPublished,
  onMetadataSaved,
}: Props) {
  const [versions, setVersions] = useState<SortPackPackage[]>([])
  const [selectedVersion, setSelectedVersion] = useState('')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [metaDirty, setMetaDirty] = useState(false)
  const [updatePolicy, setUpdatePolicy] = useState<import('@cfb/core-types').SortPackUpdatePolicy>('pinned')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!pkg) {
      setVersions([])
      setSelectedVersion('')
      return
    }
    setSelectedVersion(pkg.version)
    setName(pkg.name)
    setSlug(pkg.slug)
    setDescription(pkg.description ?? '')
    setMetaDirty(false)
    setError(null)
    setMessage(null)
    void api
      .listSortPackVersions(pkg.id)
      .then((res) => setVersions(res.versions))
      .catch(() => setVersions([pkg]))
  }, [pkg?.id, pkg?.version])

  if (!pkg) {
    return (
      <div className="marketplace-sidebar-empty">
        <p>
          {variant === 'collection'
            ? 'Select a sort pack to publish or manage versions.'
            : 'Select a listing to preview and subscribe.'}
        </p>
      </div>
    )
  }

  const versionPin = selectedVersion || pkg.version
  const isSubscribed = subscribedVersionPin != null
  const onLatestPin = isSubscribed && subscribedVersionPin === versionPin
  const isOwner = Boolean(userDid && pkg.ownerDid === userDid)

  const subscribe = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.subscribeSortPack(pkg.id, { versionPin, updatePolicy })
      onSubscribed?.()
      setMessage('Subscribed — apply on a feed from the Sorting tab.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Subscribe failed')
    } finally {
      setBusy(false)
    }
  }

  const publish = async (visibility: 'deployment' | 'global') => {
    setBusy(true)
    setError(null)
    try {
      await api.publishSortPack(pkg.id, visibility)
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
      const res = await api.updateSortPack(pkg.id, { name, slug, description: description || null })
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
    <div className="logic-block-detail">
      <div className="logic-block-detail-head">
        <h3>{pkg.name}</h3>
        <LogicBlockTrustBadge tier={pkg.trustTier} visibility={pkg.visibility} />
      </div>
      <p className="card-hint">
        {visibilityLabel(pkg.visibility)}
        {trustLabel(pkg) ? ` · ${trustLabel(pkg)}` : ''} · v{pkg.version}
      </p>

      {variant === 'collection' && isOwner ? (
        <LogicBlockMetadataFields
          name={name}
          slug={slug}
          description={description}
          onNameChange={(v) => {
            setName(v)
            setMetaDirty(true)
          }}
          onSlugChange={(v) => {
            setSlug(v)
            setMetaDirty(true)
          }}
          onDescriptionChange={(v) => {
            setDescription(v)
            setMetaDirty(true)
          }}
        />
      ) : (
        pkg.description && <p className="card-hint">{pkg.description}</p>
      )}

      {versions.length > 1 ? (
        <label className="field-label">
          Version
          <select
            value={selectedVersion}
            onChange={(e) => setSelectedVersion(e.target.value)}
            disabled={busy}
          >
            {versions.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {variant === 'marketplace' && pkg.visibility !== 'collection' && (!isSubscribed || !onLatestPin) ? (
        <label className="field-label">
          Update policy
          <select
            value={updatePolicy}
            onChange={(e) =>
              setUpdatePolicy(e.target.value as import('@cfb/core-types').SortPackUpdatePolicy)
            }
            disabled={busy}
          >
            <option value="pinned">Pinned</option>
            <option value="notify">Notify on upgrade</option>
            <option value="auto_minor">Auto minor patches</option>
          </select>
        </label>
      ) : null}

      {error ? <p className="field-error">{error}</p> : null}
      {message ? <p className="settings-hint">{message}</p> : null}

      <div className="logic-block-detail-actions">
        {variant === 'marketplace' && pkg.visibility !== 'collection' && (!isSubscribed || !onLatestPin) && (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void subscribe()}>
            {isSubscribed ? 'Update subscription' : 'Subscribe'}
          </button>
        )}
        {variant === 'collection' && isOwner && (
          <>
            {metaDirty && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void saveMetadata()}>
                Save details
              </button>
            )}
            {pkg.visibility === 'collection' && (
              <>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void publish('deployment')}>
                  Publish to deployment
                </button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void publish('global')}>
                  Submit to global
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
