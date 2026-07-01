import { useState } from 'react'
import type { FeedConfig } from '@cfb/core-types'
import { FeedSourceToggle, type FeedSourceMode } from '../FeedSourceToggle'
import { NativeInjectorPanel } from './NativeInjectorPanel'
import { InjectorFeedSection } from '../plugins/InjectorFeedSection'

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

export function FeedInjectorsView({
  draft,
  onChange,
  settingsDirty,
  settingsAutosaveState,
  settingsSaving,
  onSaveSettings,
}: Props) {
  const [source, setSource] = useState<FeedSourceMode>('native')

  const nativeCount = draft.nativeInjectors?.length ?? 0
  const hasSubscribed = !!draft.injector?.packageId

  return (
    <div className="workspace-page feed-injectors-view">
      <header className="workspace-context-head">
        <div className="workspace-context-head-row workspace-context-head-row-split">
          <div>
            <h2>Injectors</h2>
            <span className="badge badge-on">
              {nativeCount + (hasSubscribed ? 1 : 0)} active
            </span>
          </div>
          <FeedSourceToggle value={source} onChange={setSource} />
        </div>
        <p className="card-hint">
          Injectors splice additional posts into the finalized page at serve time.
          Native injectors pin or rotate posts without code. Subscribed injectors
          run custom logic (ads, recommendations, cross-feed discovery).
        </p>
      </header>

      <section className="card feed-sorting-view-panel">
        {source === 'native' && (
          <NativeInjectorPanel draft={draft} onChange={onChange} />
        )}
        {source === 'subscribed' && (
          <InjectorFeedSection draft={draft} onChange={onChange} />
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
    </div>
  )
}
