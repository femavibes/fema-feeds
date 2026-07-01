import { useState } from 'react'
import type { FeedConfig, NativeInjectorConfig, NativePinnedPost } from '@cfb/core-types'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig) => void
}

export function NativeInjectorPanel({ draft, onChange }: Props) {
  const nativeInjectors = draft.nativeInjectors ?? []
  const [addMode, setAddMode] = useState<'pinned' | 'rotating' | null>(null)

  const updateInjectors = (next: NativeInjectorConfig[]) => {
    onChange({ ...draft, nativeInjectors: next })
  }

  const removeInjector = (index: number) => {
    updateInjectors(nativeInjectors.filter((_, i) => i !== index))
  }

  const addPinned = (uri: string, position: number) => {
    if (!uri.trim()) return
    const pinned: NativeInjectorConfig = {
      type: 'pinned',
      posts: [{ uri: uri.trim(), position }],
    }
    updateInjectors([...nativeInjectors, pinned])
    setAddMode(null)
  }

  const addRotating = (uris: string[], interval: number) => {
    if (uris.length === 0) return
    const rotating: NativeInjectorConfig = {
      type: 'rotating',
      pool: uris,
      interval,
      maxPerPage: 1,
      rotation: 'round-robin',
    }
    updateInjectors([...nativeInjectors, rotating])
    setAddMode(null)
  }

  return (
    <div className="native-injector-panel">
      {nativeInjectors.length === 0 && !addMode && (
        <p className="card-hint">
          No native injectors configured. Add pinned or rotating posts to splice into the feed at serve time.
        </p>
      )}

      {nativeInjectors.map((inj, i) => (
        <div key={i} className="native-injector-card">
          {inj.type === 'pinned' && (
            <PinnedInjectorCard
              config={inj}
              onRemove={() => removeInjector(i)}
              onChange={(next) => {
                const copy = [...nativeInjectors]
                copy[i] = next
                updateInjectors(copy)
              }}
            />
          )}
          {inj.type === 'rotating' && (
            <RotatingInjectorCard
              config={inj}
              onRemove={() => removeInjector(i)}
              onChange={(next) => {
                const copy = [...nativeInjectors]
                copy[i] = next
                updateInjectors(copy)
              }}
            />
          )}
        </div>
      ))}

      {addMode === 'pinned' && <AddPinnedForm onAdd={addPinned} onCancel={() => setAddMode(null)} />}
      {addMode === 'rotating' && <AddRotatingForm onAdd={addRotating} onCancel={() => setAddMode(null)} />}

      {!addMode && (
        <div className="native-injector-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddMode('pinned')}>
            + Pinned post
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddMode('rotating')}>
            + Rotating posts
          </button>
        </div>
      )}
    </div>
  )
}

// --- Pinned injector card ---

function PinnedInjectorCard({
  config,
  onRemove,
  onChange,
}: {
  config: { type: 'pinned'; posts: NativePinnedPost[] }
  onRemove: () => void
  onChange: (next: NativeInjectorConfig) => void
}) {
  const post = config.posts[0]
  if (!post) return null

  return (
    <div className="injector-card">
      <div className="injector-card-head">
        <span className="injector-card-type">📌 Pinned</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove}>×</button>
      </div>
      <div className="injector-card-body">
        <label className="field-label">
          Post URI
          <input
            value={post.uri}
            onChange={(e) => onChange({ ...config, posts: [{ ...post, uri: e.target.value }] })}
            placeholder="at://did:plc:.../app.bsky.feed.post/..."
          />
        </label>
        <div className="injector-card-row">
          <label className="field-label">
            Position
            <input
              type="number"
              min={0}
              value={post.position}
              onChange={(e) => onChange({ ...config, posts: [{ ...post, position: parseInt(e.target.value) || 0 }] })}
            />
            <span className="card-hint">0 = top of page</span>
          </label>
          <label className="field-label">
            Max impressions
            <input
              type="number"
              min={0}
              value={post.maxImpressions ?? 0}
              onChange={(e) => {
                const v = parseInt(e.target.value) || 0
                onChange({ ...config, posts: [{ ...post, maxImpressions: v || undefined }] })
              }}
            />
            <span className="card-hint">0 = unlimited</span>
          </label>
        </div>
        <label className="field-label">
          Expires at
          <input
            type="datetime-local"
            value={post.expiresAt ? post.expiresAt.slice(0, 16) : ''}
            onChange={(e) => onChange({ ...config, posts: [{ ...post, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : undefined }] })}
          />
          <span className="card-hint">Leave empty for no expiry</span>
        </label>
      </div>
    </div>
  )
}

// --- Rotating injector card ---

function RotatingInjectorCard({
  config,
  onRemove,
  onChange,
}: {
  config: { type: 'rotating'; pool: string[]; interval: number; maxPerPage: number; rotation: 'round-robin' | 'random' | 'least-shown'; perViewerMaxImpressions?: number; expiresAt?: string }
  onRemove: () => void
  onChange: (next: NativeInjectorConfig) => void
}) {
  return (
    <div className="injector-card">
      <div className="injector-card-head">
        <span className="injector-card-type">🔄 Rotating</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove}>×</button>
      </div>
      <div className="injector-card-body">
        <label className="field-label">
          Post URIs (one per line)
          <textarea
            rows={4}
            value={config.pool.join('\n')}
            onChange={(e) => onChange({ ...config, pool: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) })}
            placeholder="at://did:plc:.../app.bsky.feed.post/...&#10;at://did:plc:.../app.bsky.feed.post/..."
          />
        </label>
        <div className="injector-card-row">
          <label className="field-label">
            Insert every N posts
            <input
              type="number"
              min={1}
              value={config.interval}
              onChange={(e) => onChange({ ...config, interval: Math.max(1, parseInt(e.target.value) || 8) })}
            />
          </label>
          <label className="field-label">
            Max per page
            <input
              type="number"
              min={1}
              value={config.maxPerPage}
              onChange={(e) => onChange({ ...config, maxPerPage: Math.max(1, parseInt(e.target.value) || 1) })}
            />
          </label>
        </div>
        <div className="injector-card-row">
          <label className="field-label">
            Rotation
            <select
              value={config.rotation}
              onChange={(e) => onChange({ ...config, rotation: e.target.value as 'round-robin' | 'random' | 'least-shown' })}
            >
              <option value="round-robin">Round robin</option>
              <option value="random">Random</option>
              <option value="least-shown">Least shown</option>
            </select>
          </label>
          <label className="field-label">
            Max impressions per viewer
            <input
              type="number"
              min={0}
              value={config.perViewerMaxImpressions ?? 0}
              onChange={(e) => {
                const v = parseInt(e.target.value) || 0
                onChange({ ...config, perViewerMaxImpressions: v || undefined })
              }}
            />
            <span className="card-hint">0 = unlimited</span>
          </label>
        </div>
        <label className="field-label">
          Expires at
          <input
            type="datetime-local"
            value={config.expiresAt ? config.expiresAt.slice(0, 16) : ''}
            onChange={(e) => onChange({ ...config, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
          />
          <span className="card-hint">Leave empty for no expiry</span>
        </label>
      </div>
    </div>
  )
}

// --- Add forms ---

function AddPinnedForm({ onAdd, onCancel }: { onAdd: (uri: string, position: number) => void; onCancel: () => void }) {
  const [uri, setUri] = useState('')
  const [position, setPosition] = useState(0)

  return (
    <div className="injector-add-form">
      <p className="sidebar-block-title">Add pinned post</p>
      <label className="field-label">
        Post URI
        <input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="at://did:plc:.../app.bsky.feed.post/..." autoFocus />
      </label>
      <label className="field-label">
        Position
        <input type="number" min={0} value={position} onChange={(e) => setPosition(parseInt(e.target.value) || 0)} />
        <span className="card-hint">0 = top of page</span>
      </label>
      <div className="injector-add-form-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onAdd(uri, position)} disabled={!uri.trim()}>Add</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function AddRotatingForm({ onAdd, onCancel }: { onAdd: (uris: string[], interval: number) => void; onCancel: () => void }) {
  const [text, setText] = useState('')
  const [interval, setInterval] = useState(8)

  const uris = text.split('\n').map((l) => l.trim()).filter(Boolean)

  return (
    <div className="injector-add-form">
      <p className="sidebar-block-title">Add rotating posts</p>
      <label className="field-label">
        Post URIs (one per line)
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="at://did:plc:.../app.bsky.feed.post/..." autoFocus />
      </label>
      <label className="field-label">
        Insert every N posts
        <input type="number" min={1} value={interval} onChange={(e) => setInterval(Math.max(1, parseInt(e.target.value) || 8))} />
      </label>
      <div className="injector-add-form-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onAdd(uris, interval)} disabled={uris.length === 0}>Add</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
