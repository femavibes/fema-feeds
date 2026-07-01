import { useEffect, useState } from 'react'
import type { FeedConfig, NativeFeedSource } from '@cfb/core-types'
import { api } from '../../api/client'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig) => void
}

export function NativeSourcesPanel({ draft, onChange }: Props) {
  const sourcesConfig = draft.sources ?? {}
  const poolScope = draft.poolScope ?? 'project_only'
  const sources = sourcesConfig.native ?? []
  const [addMode, setAddMode] = useState<'project_pool' | 'feed' | 'static_uri_list' | null>(null)

  const updatePoolScope = (scope: 'project_only' | 'global') => {
    onChange({ ...draft, poolScope: scope })
  }

  const updateSources = (next: NativeFeedSource[]) => {
    onChange({ ...draft, sources: { ...sourcesConfig, native: next } })
  }

  const removeSource = (index: number) => {
    updateSources(sources.filter((_, i) => i !== index))
  }

  return (
    <div className="native-sources-panel">
      {/* Pool scope — configures the START node */}
      <section className="native-source-scope">
        <p className="sidebar-block-title">Default pool (START node)</p>
        <p className="card-hint">
          Which posts the START node in the visual editor evaluates.
        </p>
        <div className="feed-source-toggle-wrap" style={{ marginTop: '0.35rem' }}>
          <div className="feed-source-toggle" role="group" aria-label="Pool scope">
            <button
              type="button"
              className={`feed-source-toggle-btn${poolScope === 'project_only' ? ' is-active' : ''}`}
              onClick={() => updatePoolScope('project_only')}
            >
              This project's pool
            </button>
            <button
              type="button"
              className={`feed-source-toggle-btn${poolScope === 'global' ? ' is-active' : ''}`}
              onClick={() => updatePoolScope('global')}
            >
              All ingested posts
            </button>
          </div>
        </div>
      </section>

      {/* Additional sources */}
      <section className="native-source-list">
        <p className="sidebar-block-title">Additional sources</p>
        <p className="card-hint">
          These appear as draggable source nodes in the visual editor palette.
          Wire them through logic nodes or directly to END.
        </p>

        {sources.length === 0 && !addMode && (
          <p className="card-hint" style={{ fontStyle: 'italic', marginTop: '0.5rem' }}>
            No additional sources. Only the default pool feeds into evaluation.
          </p>
        )}

        {sources.map((src, i) => (
          <div key={i} className="native-injector-card">
            <div className="injector-card">
              <div className="injector-card-head">
                <span className="injector-card-type">
                  {src.type === 'project_pool' && `📦 ${src.projectId}`}
                  {src.type === 'feed' && `📡 ${src.feedId}`}
                  {src.type === 'static_uri_list' && `📋 ${src.uris.length} URIs`}
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeSource(i)}>×</button>
              </div>
              <div className="injector-card-body">
                {src.type === 'project_pool' && (
                  <label className="field-label">
                    Project ID
                    <input
                      value={src.projectId}
                      onChange={(e) => { const c = [...sources]; c[i] = { ...src, projectId: e.target.value }; updateSources(c) }}
                    />
                  </label>
                )}
                {src.type === 'feed' && (
                  <label className="field-label">
                    Feed ID
                    <input
                      value={src.feedId}
                      onChange={(e) => { const c = [...sources]; c[i] = { ...src, feedId: e.target.value }; updateSources(c) }}
                    />
                  </label>
                )}
                {src.type === 'static_uri_list' && (
                  <label className="field-label">
                    Post URIs (one per line)
                    <textarea
                      rows={3}
                      value={src.uris.join('\n')}
                      onChange={(e) => { const c = [...sources]; c[i] = { ...src, uris: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) }; updateSources(c) }}
                      placeholder="at://did:plc:.../app.bsky.feed.post/..."
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
        ))}

        {addMode === 'feed' && (
          <AddFeedForm onAdd={(feedId) => { updateSources([...sources, { type: 'feed', feedId }]); setAddMode(null) }} onCancel={() => setAddMode(null)} />
        )}
        {addMode === 'project_pool' && (
          <AddProjectForm onAdd={(projectId) => { updateSources([...sources, { type: 'project_pool', projectId }]); setAddMode(null) }} onCancel={() => setAddMode(null)} />
        )}
        {addMode === 'static_uri_list' && (
          <AddUriListForm onAdd={(uris) => { updateSources([...sources, { type: 'static_uri_list', uris }]); setAddMode(null) }} onCancel={() => setAddMode(null)} />
        )}

        {!addMode && (
          <div className="native-injector-actions" style={{ marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddMode('feed')}>
              + Feed
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddMode('project_pool')}>
              + Project pool
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddMode('static_uri_list')}>
              + Static URIs
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

function AddFeedForm({ onAdd, onCancel }: { onAdd: (feedId: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState('')
  const [inputs, setInputs] = useState<Array<{ feedId: string; name: string }>>([]);
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const [inputRes, feedsRes] = await Promise.all([
          api.listFeedInputs(),
          api.listCommunityFeeds('deployment'),
        ])
        // Combine: subscribed inputs + own feeds that allow input
        const ownFeeds = feedsRes.feeds
          .filter((f) => f.allowAsInput)
          .map((f) => ({ feedId: f.feedId, name: f.name }))
        const subscribed = inputRes.inputs.map((i) => ({ feedId: i.feedId, name: i.name }))
        // Deduplicate
        const seen = new Set<string>()
        const combined: Array<{ feedId: string; name: string }> = []
        for (const item of [...subscribed, ...ownFeeds]) {
          if (!seen.has(item.feedId)) {
            seen.add(item.feedId)
            combined.push(item)
          }
        }
        setInputs(combined)
      } catch {
        setInputs([])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="injector-add-form">
      <p className="sidebar-block-title">Add feed source</p>
      {loading ? (
        <p className="card-hint">Loading available feeds...</p>
      ) : inputs.length > 0 ? (
        <>
          <p className="card-hint">Select a feed from your input list, or type an ID manually.</p>
          <div className="feed-input-picker">
            {inputs.map((input) => (
              <button
                key={input.feedId}
                type="button"
                className="feed-input-picker-item"
                onClick={() => onAdd(input.feedId)}
              >
                {input.name}
                <span className="feed-input-picker-id">{input.feedId}</span>
              </button>
            ))}
          </div>
          <p className="card-hint" style={{ marginTop: '0.5rem' }}>Or enter a feed ID manually:</p>
        </>
      ) : (
        <p className="card-hint">No feeds in your input list. Add feeds from the Community page, or type an ID manually.</p>
      )}
      <label className="field-label">
        Feed ID
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="feed-id" autoFocus={inputs.length === 0} onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) onAdd(value.trim()) }} />
      </label>
      <div className="injector-add-form-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onAdd(value.trim())} disabled={!value.trim()}>Add</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function AddProjectForm({ onAdd, onCancel }: { onAdd: (projectId: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState('')
  return (
    <div className="injector-add-form">
      <p className="sidebar-block-title">Add project pool source</p>
      <label className="field-label">
        Project ID
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="project-id" autoFocus onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) onAdd(value.trim()) }} />
      </label>
      <div className="injector-add-form-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onAdd(value.trim())} disabled={!value.trim()}>Add</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function AddUriListForm({ onAdd, onCancel }: { onAdd: (uris: string[]) => void; onCancel: () => void }) {
  const [text, setText] = useState('')
  const uris = text.split('\n').map((l) => l.trim()).filter(Boolean)
  return (
    <div className="injector-add-form">
      <p className="sidebar-block-title">Add static URI list</p>
      <label className="field-label">
        Post URIs (one per line)
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="at://did:plc:.../app.bsky.feed.post/..." autoFocus />
      </label>
      <div className="injector-add-form-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onAdd(uris)} disabled={uris.length === 0}>Add</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
