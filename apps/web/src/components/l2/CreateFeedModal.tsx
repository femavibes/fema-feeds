import { useEffect, useRef, useState } from 'react'
import type { FeedConfig } from '@cfb/core-types'
import { ToggleRow } from '../ToggleRow'
import { api, type SlugCollisionResult } from '../../api/client'

/** Logic fields that get cloned when copying a feed. */
export type FeedLogicFields = Pick<
  FeedConfig,
  'match' | 'rank' | 'visualLayout' | 'injector' | 'authorLists' | 'sources' | 'personalization'
>

export interface CreateFeedModalProps {
  projectId: string
  onClose: () => void
  onCreate: (feed: FeedConfig, avatarFile?: File) => Promise<void>
  /** Pre-filled logic when cloning */
  sourceLogic?: FeedLogicFields | null
  /** Attribution label shown when cloning */
  sourceLabel?: string | null
}

interface SettingsToggleDef {
  key: keyof FeedConfig
  label: string
  hint: string
}

const SETTINGS_TOGGLES: SettingsToggleDef[] = [
  { key: 'public', label: 'Public on Community', hint: 'Show this feed on the Community page' },
  { key: 'logicPublic', label: 'Logic public', hint: 'Others can view and copy your feed logic' },
  { key: 'allowAsInput', label: 'Allow as input', hint: 'Others can use this feed as a source in their feeds' },
  { key: 'isTemplate', label: 'Template', hint: 'Show in Community > Templates instead of Feeds' },
  { key: 'statsPublic', label: 'Stats public on Community', hint: 'Show daily viewers and impressions on the Community page' },
]

const SETTINGS_KEYS = SETTINGS_TOGGLES.map((t) => t.key)

export function CreateFeedModal({
  projectId,
  onClose,
  onCreate,
  sourceLogic,
  sourceLabel,
}: CreateFeedModalProps) {
  const [feedId, setFeedId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState(
    sourceLabel ? `Forked from ${sourceLabel}` : '',
  )
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [settings, setSettings] = useState<Record<string, boolean>>({ public: true })
  const [createError, setCreateError] = useState<string | null>(null)
  const [slugCheck, setSlugCheck] = useState<SlugCollisionResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [restoredLogic, setRestoredLogic] = useState<FeedLogicFields | null>(null)
  const [restoredLabel, setRestoredLabel] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const backupRef = useRef<HTMLInputElement>(null)
  const slugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced slug collision check
  useEffect(() => {
    const slug = feedId.trim().toLowerCase().replace(/\s+/g, '-')
    if (!slug) {
      setSlugCheck(null)
      return
    }
    if (slugTimerRef.current) clearTimeout(slugTimerRef.current)
    slugTimerRef.current = setTimeout(() => {
      api.checkSlugCollision(slug)
        .then(setSlugCheck)
        .catch(() => setSlugCheck(null))
    }, 400)
    return () => { if (slugTimerRef.current) clearTimeout(slugTimerRef.current) }
  }, [feedId])

  const handleBackupRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as any
        if (data.format === 'cfb-feed-graph') {
          setCreateError('This is a feed logic file. Use "Import logic" in the feed editor instead.')
          return
        }
        if (data.format && data.format !== 'cfb-feed-backup') {
          setCreateError('Unrecognized file format.')
          return
        }
        if (data.feedId) setFeedId(data.feedId)
        if (data.name) setName(data.name)
        if (data.description) setDescription(data.description)
        // Restore settings toggles
        const restored: Record<string, boolean> = {}
        for (const key of SETTINGS_KEYS) {
          if ((data as any)[key] !== undefined) restored[key] = Boolean((data as any)[key])
        }
        if (Object.keys(restored).length > 0) setSettings(restored)
        // Restore logic fields
        const logic: FeedLogicFields = {
          match: data.match ?? { type: 'group', id: 'root', logic: 'any', children: [] },
          rank: data.rank,
          visualLayout: data.visualLayout,
          injector: data.injector,
          authorLists: data.authorLists,
          sources: data.sources,
          personalization: data.personalization,
        }
        setRestoredLogic(logic)
        setRestoredLabel(`Restored from backup`)
        setCreateError(null)
      } catch {
        setCreateError('Invalid JSON file')
      }
    }
    reader.readAsText(file)
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  // Effective logic: restored backup > clone source > empty
  const effectiveLogic = restoredLogic ?? sourceLogic ?? null

  const handleSubmit = () => {
    const id = feedId.trim().toLowerCase().replace(/\s+/g, '-')
    if (!id) return
    if (slugCheck?.localExists) {
      setCreateError(`A feed with ID "${id}" already exists in this deployment.`)
      return
    }
    setCreateError(null)
    setBusy(true)
    const feed: FeedConfig = {
      feedId: id,
      projectId,
      name: name.trim() || id,
      description: description.trim() || undefined,
      enabled: false,
      poolScope: 'project_only',
      match: effectiveLogic?.match ?? { type: 'group', id: 'root', logic: 'any', children: [] },
      ...(effectiveLogic?.rank && { rank: effectiveLogic.rank }),
      ...(effectiveLogic?.visualLayout && { visualLayout: effectiveLogic.visualLayout }),
      ...(effectiveLogic?.injector && { injector: effectiveLogic.injector }),
      ...(effectiveLogic?.authorLists && { authorLists: effectiveLogic.authorLists }),
      ...(effectiveLogic?.sources && { sources: effectiveLogic.sources }),
      ...(effectiveLogic?.personalization && { personalization: effectiveLogic.personalization }),
      ...Object.fromEntries(
        Object.entries(settings).filter(([, v]) => v),
      ),
    }
    onCreate(feed, avatarFile ?? undefined)
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Create feed failed'
        if (msg.includes('already exists')) {
          setCreateError(`A feed with ID "${id}" already exists in this deployment.`)
        } else {
          setCreateError(msg)
        }
      })
      .finally(() => setBusy(false))
  }

  const patchSetting = (key: string, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const effectiveLabel = restoredLabel ?? sourceLabel
  const isClone = Boolean(sourceLogic)
  const isRestore = Boolean(restoredLogic)
  const title = isRestore ? 'Restore Feed' : isClone ? 'Clone Feed' : 'Create Feed'
  const submitLabel = isRestore ? 'Restore' : isClone ? 'Clone' : 'Create'

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog create-feed-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="modal-body">
          {!isClone && (
            <div className="create-feed-restore">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => backupRef.current?.click()}
              >
                Restore from backup
              </button>
              <input
                ref={backupRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={handleBackupRestore}
              />
              {isRestore && (
                <span className="badge badge-on">Backup loaded</span>
              )}
            </div>
          )}

          {effectiveLabel && (
            <p className="create-feed-clone-hint">
              {isRestore ? 'Restoring from:' : 'Cloning logic from:'}{' '}
              <strong>{effectiveLabel}</strong>
            </p>
          )}

          <div className="field-grid">
            <label>
              Feed ID
              <input
                value={feedId}
                onChange={(e) => { setFeedId(e.target.value); setCreateError(null) }}
                placeholder="my-feed"
                autoFocus
              />
              {slugCheck?.localExists && (
                <span className="field-error">This feed ID already exists in this deployment</span>
              )}
              {slugCheck?.bluesky?.exists && !slugCheck.bluesky.isOwnDeployment && !slugCheck.localExists && (
                <span className="field-warn">
                  ⚠ This slug is used on Bluesky by &quot;{slugCheck.bluesky.record?.displayName}&quot;
                  (external). Publishing will overwrite it.
                </span>
              )}
              {slugCheck?.bluesky?.exists && slugCheck.bluesky.isOwnDeployment && !slugCheck.localExists && (
                <span className="field-warn">
                  ⚠ This slug is already published by this deployment.
                </span>
              )}
            </label>
            <label>
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Feed"
              />
            </label>
          </div>

          <label>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description"
              rows={2}
            />
          </label>

          <div className="feed-avatar-field">
            <span className="feed-avatar-label">Feed image</span>
            <div className="feed-avatar-row">
              {avatarPreview ? (
                <img src={avatarPreview} alt="" className="feed-avatar-preview" />
              ) : (
                <div className="feed-avatar-placeholder" />
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => fileRef.current?.click()}
              >
                {avatarPreview ? 'Change' : 'Upload'}
              </button>
              {avatarPreview && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setAvatarFile(null); setAvatarPreview(null) }}
                >
                  Remove
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={handleAvatarSelect}
              />
            </div>
          </div>

          <div className="feed-community-settings">
            {SETTINGS_TOGGLES.map((t) => (
              <ToggleRow
                key={t.key}
                label={t.label}
                hint={t.hint}
                checked={Boolean(settings[t.key])}
                onChange={(v) => patchSetting(t.key, v)}
                ariaLabel={t.label}
              />
            ))}
          </div>
        </div>

        <div className="modal-footer">
          {createError && <p className="field-error modal-inline-error">{createError}</p>}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!feedId.trim() || busy || Boolean(slugCheck?.localExists)}
            onClick={handleSubmit}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
