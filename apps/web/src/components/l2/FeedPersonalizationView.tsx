import { useState } from 'react'
import type { FeedConfig } from '@cfb/core-types'
import { FeedSourceToggle, type FeedSourceMode } from '../FeedSourceToggle'
import { FeedPersonalizationPanel } from './FeedPersonalizationPanel'
import { SavePersonalizationModal } from './SavePersonalizationModal'
import { RankerFeedSection } from '../plugins/RankerFeedSection'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig) => void
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

export function FeedPersonalizationView({
  draft,
  onChange,
  settingsDirty,
  settingsAutosaveState,
  settingsSaving,
  onSaveSettings,
}: Props) {
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const hasRankerRef = !!draft.rank?.rankerRef
  const [source, setSource] = useState<FeedSourceMode>(hasRankerRef ? 'subscribed' : 'native')

  return (
    <div className="workspace-page feed-personalization-view">
      <header className="workspace-context-head">
        <div className="workspace-context-head-row workspace-context-head-row-split">
          <div>
            <h2>Personalization</h2>
            <span className="badge badge-on">
              {source === 'subscribed'
                ? 'Subscribed'
                : draft.personalization?.formulaEnabled ? 'Formula' : 'Toggles'}
            </span>
          </div>
          <div className="workspace-context-head-controls">
            <FeedSourceToggle value={source} onChange={setSource} />
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
          Viewer-aware adjustments applied at serve time for <strong>{draft.name}</strong>.
          Each viewer gets a personalized page order based on their follow graph, interaction
          history, and what they've already seen.
        </p>
      </header>

      <section className="card feed-sorting-view-panel">
        {source === 'native' && (
          <FeedPersonalizationPanel draft={draft} onChange={onChange} />
        )}
        {source === 'subscribed' && (
          <div className="feed-subscribed-section">
            <RankerFeedSection draft={draft} onChange={onChange} />
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

      <SavePersonalizationModal draft={draft} open={saveModalOpen} onClose={() => setSaveModalOpen(false)} />
    </div>
  )
}
