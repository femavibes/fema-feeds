import { useState } from 'react'
import type { FeedConfig } from '@cfb/core-types'
import { FeedSourceToggle, type FeedSourceMode } from '../FeedSourceToggle'
import { FeedSortingPanel } from './FeedSortingPanel'
import { SortPackFeedSection } from '../sort-packs/SortPackFeedSection'
import { SaveSortPackModal } from '../sort-packs/SaveSortPackModal'
import { detectSortMode, sortModeBadge, DEFAULT_ENGAGEMENT_WEIGHTS, detectEngagementWeights } from '../../lib/feed-sorting'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig | ((prev: FeedConfig) => FeedConfig)) => void
  settingsDirty: boolean
  settingsAutosaveState: 'idle' | 'pending' | 'saving' | 'saved' | 'error'
  settingsSaving: boolean
  onSaveSettings: () => void
}

function autosaveLabel(state: Props['settingsAutosaveState']): string | null {
  if (state === 'pending' || state === 'saving') return 'Autosaving…'
  if (state === 'saved') return 'Saved to draft'
  if (state === 'error') return 'Autosave failed — save manually'
  return 'Unsaved — autosaving'
}

export function FeedSortingView({
  draft,
  onChange,
  settingsDirty,
  settingsAutosaveState,
  settingsSaving,
  onSaveSettings,
}: Props) {
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0)
  const hasPackRef = !!draft.rank?.packRef
  const [source, setSource] = useState<FeedSourceMode>(hasPackRef ? 'subscribed' : 'native')
  const mode = detectSortMode(draft.rank)
  const weights = draft.rank?.sortKey
    ? detectEngagementWeights(draft.rank.sortKey)
    : DEFAULT_ENGAGEMENT_WEIGHTS

  return (
    <div className="workspace-page feed-sorting-view">
      <header className="workspace-context-head">
        <div className="workspace-context-head-row workspace-context-head-row-split">
          <div>
            <h2>Sorting</h2>
            <span className="badge badge-on">{sortModeBadge(mode, weights)}</span>
          </div>
          <div className="workspace-context-head-controls">
            <FeedSourceToggle
              value={source}
              onChange={setSource}
              nativeLabel="Create"
              subscribedLabel="My collection & subscribed"
            />
            {source === 'native' && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSaveModalOpen(true)}
              >
                Save to collection
              </button>
            )}
          </div>
        </div>
        <p className="card-hint">
          How posts are ordered in <strong>{draft.name}</strong> when the feed skeleton is built.
          Use <strong>Update</strong> in the right sidebar to rebuild candidates with a new order.
        </p>
      </header>

      <section className="card feed-sorting-view-panel">
        {source === 'native' && (
          <FeedSortingPanel draft={draft} onChange={onChange} layout="main" />
        )}
        {source === 'subscribed' && (
          <div className="feed-subscribed-section">
            <SortPackFeedSection
              draft={draft}
              onChange={onChange}
              refreshKey={libraryRefreshKey}
            />
          </div>
        )}
      </section>

      {settingsDirty ? (
        <div className="workspace-save-status">
          <span className="badge badge-warn">Unsaved</span>
          <span className="card-hint">{autosaveLabel(settingsAutosaveState)}</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={settingsSaving}
            onClick={onSaveSettings}
          >
            {settingsSaving ? 'Saving…' : 'Save now'}
          </button>
        </div>
      ) : null}

      <SaveSortPackModal
        draft={draft}
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        onSaved={() => setLibraryRefreshKey((k) => k + 1)}
      />
    </div>
  )
}
