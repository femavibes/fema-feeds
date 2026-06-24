import { useEffect, useState } from 'react'
import type { LogicBlockPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import { LogicBlockMetadataFields } from './LogicBlockMetadataFields'
import { LogicBlockTrustBadge, trustLabel, visibilityLabel } from './logic-block-labels'

export type LogicBlockDetailVariant = 'marketplace' | 'collection'

interface Props {
  variant: LogicBlockDetailVariant
  pkg: LogicBlockPackage | null
  userDid?: string | null
  subscribedVersionPin?: string | null
  onSubscribed?: () => void
  onPublished?: () => void
  onEdit?: () => void
  onMetadataSaved?: (pkg: LogicBlockPackage) => void
}

export function LogicBlockDetailPanel({
  variant,
  pkg,
  userDid,
  subscribedVersionPin,
  onSubscribed,
  onPublished,
  onEdit,
  onMetadataSaved,
}: Props) {
  const [versions, setVersions] = useState<LogicBlockPackage[]>([])
  const [selectedVersion, setSelectedVersion] = useState('')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [metaDirty, setMetaDirty] = useState(false)
  const [updatePolicy, setUpdatePolicy] = useState<import('@cfb/core-types').LogicBlockUpdatePolicy>('pinned')
  const [busy, setBusy] = useState(false)
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
    setSelectedVersion(pkg.version)
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

  const versionPin = selectedVersion || pkg.version
  const isSubscribed = subscribedVersionPin != null
  const onLatestPin = isSubscribed && subscribedVersionPin === versionPin
  const latestVersion = versions[0]?.version ?? pkg.version
  const isOwner = Boolean(userDid && pkg.ownerDid === userDid)

  const subscribe = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.subscribeLogicBlock(pkg.id, { versionPin, updatePolicy })
      onSubscribed?.()
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
        description: description.trim() || null,
        bumpVersion: false,
      })
      setName(res.package.name)
      setSlug(res.package.slug)
      setDescription(res.package.description ?? '')
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
      {variant === 'collection' && isOwner ? (
        <>
          <LogicBlockMetadataFields
            name={name}
            slug={slug}
            description={description}
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
            onDescriptionChange={(v) => {
              setDescription(v)
              setMetaDirty(true)
              setMessage(null)
            }}
          />
          {metaDirty ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy || !name.trim()}
              onClick={() => void saveMetadata()}
            >
              {busy ? 'Saving…' : 'Save name & details'}
            </button>
          ) : null}
        </>
      ) : (
        <>
          <h3 className="logic-block-detail-name">{pkg.name}</h3>
          <p className="logic-block-detail-sub">
            {pkg.slug} · {visibilityLabel(pkg.visibility)}
          </p>
        </>
      )}
      {variant === 'collection' && isOwner ? (
        <p className="logic-block-detail-sub">{visibilityLabel(pkg.visibility)} · v{pkg.version}</p>
      ) : null}
      <div className="logic-block-detail-badges">
        <LogicBlockTrustBadge tier={pkg.trustTier} visibility={pkg.visibility} />
      </div>
      {pkg.description && !(variant === 'collection' && isOwner) ? (
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
            disabled={busy}
            onChange={(e) => setSelectedVersion(e.target.value)}
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
            disabled={busy}
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
        {variant === 'collection' && isOwner && onEdit ? (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onEdit}>
            Edit logic
          </button>
        ) : null}

        {variant === 'marketplace' && pkg.visibility !== 'collection' && (!isSubscribed || !onLatestPin) && (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void subscribe()}>
            {isSubscribed ? `Update to v${versionPin}` : 'Subscribe'}
          </button>
        )}

        {variant === 'collection' && isOwner && (
          <>
            {pkg.visibility === 'collection' && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => void publish('deployment')}
                >
                  Publish to this deployment
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => void publish('global')}
                >
                  Submit to global marketplace
                </button>
              </>
            )}
            {pkg.visibility === 'deployment' && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => void publish('global')}
              >
                Submit to global marketplace
              </button>
            )}
            {pkg.visibility !== 'collection' && (
              <p className="card-hint">
                Published listings also appear under Marketplace. Use Verify publisher in the
                marketplace sidebar to assign trust seals.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
