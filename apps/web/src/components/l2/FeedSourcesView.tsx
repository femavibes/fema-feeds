import { useState } from 'react'
import type { FeedConfig } from '@cfb/core-types'
import { FeedSourceToggle, type FeedSourceMode } from '../FeedSourceToggle'
import { NativeSourcesPanel } from './NativeSourcesPanel'

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

export function FeedSourcesView({
  draft,
  onChange,
  settingsDirty,
  settingsAutosaveState,
  settingsSaving,
  onSaveSettings,
}: Props) {
  const [source, setSource] = useState<FeedSourceMode>('native')

  const nativeCount = draft.sources?.native?.length ?? 0
  const subscribedCount = draft.sources?.subscribed?.length ?? 0

  return (
    <div className="workspace-page feed-sources-view">
      <header className="workspace-context-head">
        <div className="workspace-context-head-row workspace-context-head-row-split">
          <div>
            <h2>Sources</h2>
            <span className="badge badge-on">
              {nativeCount + subscribedCount + 1} active
            </span>
          </div>
          <FeedSourceToggle value={source} onChange={setSource} />
        </div>
        <p className="card-hint">
          Sources feed posts into the evaluation pipeline. Your project pool (the START node) is
          always active. Additional sources provide more posts that go through the same
          match/exclude/score rules in the visual editor.
        </p>
      </header>

      <section className="card feed-sorting-view-panel">
        {source === 'native' && (
          <NativeSourcesPanel draft={draft} onChange={onChange} />
        )}
        {source === 'subscribed' && (
          <div className="feed-subscribed-section">
            {subscribedCount === 0 ? (
              <p className="card-hint">
                No custom code sources subscribed. Browse the marketplace to find source plugins
                that fetch posts from external APIs, trending feeds, or curated lists.
              </p>
            ) : (
              <div className="native-sources-panel">
                {draft.sources?.subscribed?.map((sub, i) => (
                  <div key={i} className="native-injector-card">
                    <div className="injector-card">
                      <div className="injector-card-head">
                        <span className="injector-card-type">🔌 {sub.packageId}</span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            const next = (draft.sources?.subscribed ?? []).filter((_, idx) => idx !== i)
                            onChange({ ...draft, sources: { ...draft.sources, subscribed: next.length ? next : undefined } })
                          }}
                        >
                          ×
                        </button>
                      </div>
                      <div className="injector-card-body">
                        <p className="card-hint">v{sub.versionPin} · {sub.packageId}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="card-hint" style={{ marginTop: '0.75rem' }}>
              Subscribe to source plugins in Marketplace → Browse → Sources.
            </p>
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
    </div>
  )
}
