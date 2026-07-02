import { useRef, useState } from 'react'
import type { FeedConfig } from '@cfb/core-types'
import { ToggleRow } from '../ToggleRow'

/** Logic fields that get cloned when copying a feed. */
export type FeedLogicFields = Pick<
  FeedConfig,
  'match' | 'rank' | 'visualLayout' | 'injector' | 'authorLists' | 'sources' | 'personalization'
>

export interface CreateFeedModalProps {
  projectId: string
  onClose: () => void
  onCreate: (feed: FeedConfig, avatarFile?: File) => void
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
  const [settings, setSettings] = useState<Record<string, boolean>>({})
  const fileRef = useRef<HTMLInputElement>(null)

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleSubmit = () => {
    const id = feedId.trim().toLowerCase().replace(/\s+/g, '-')
    if (!id) return
    const feed: FeedConfig = {
      feedId: id,
      projectId,
      name: name.trim() || id,
      description: description.trim() || undefined,
      enabled: false,
      poolScope: 'project_only',
      match: sourceLogic?.match ?? { type: 'group', id: 'root', logic: 'any', children: [] },
      ...(sourceLogic?.rank && { rank: sourceLogic.rank }),
      ...(sourceLogic?.visualLayout && { visualLayout: sourceLogic.visualLayout }),
      ...(sourceLogic?.injector && { injector: sourceLogic.injector }),
      ...(sourceLogic?.authorLists && { authorLists: sourceLogic.authorLists }),
      ...(sourceLogic?.sources && { sources: sourceLogic.sources }),
      ...(sourceLogic?.personalization && { personalization: sourceLogic.personalization }),
      ...Object.fromEntries(
        Object.entries(settings).filter(([, v]) => v),
      ),
    }
    onCreate(feed, avatarFile ?? undefined)
  }

  const patchSetting = (key: string, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog create-feed-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{sourceLogic ? 'Clone Feed' : 'Create Feed'}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="modal-body">
          {sourceLabel && (
            <p className="create-feed-clone-hint">
              Cloning logic from: <strong>{sourceLabel}</strong>
            </p>
          )}

          <div className="field-grid">
            <label>
              Feed ID
              <input
                value={feedId}
                onChange={(e) => setFeedId(e.target.value)}
                placeholder="my-feed"
                autoFocus
              />
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
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!feedId.trim()}
            onClick={handleSubmit}
          >
            {sourceLogic ? 'Clone' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
