import { useCallback, useEffect, useState } from 'react'

import { api, type FeedApiKeyRow } from '../../api/client'

export function FeedParamApiKeysPanel({ feedId }: { feedId: string }) {
  const [keys, setKeys] = useState<FeedApiKeyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [newRawKey, setNewRawKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.listFeedApiKeys(feedId)
      setKeys(res.keys)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }, [feedId])

  useEffect(() => {
    void reload()
  }, [reload])

  const createKey = async () => {
    setCreating(true)
    setError(null)
    try {
      const res = await api.createFeedApiKey(feedId, label.trim())
      setNewRawKey(res.rawKey)
      setLabel('')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create API key')
    } finally {
      setCreating(false)
    }
  }

  const revokeKey = async (keyId: string) => {
    if (!window.confirm('Revoke this API key? External integrations using it will stop working.')) {
      return
    }
    setError(null)
    try {
      await api.revokeFeedApiKey(feedId, keyId)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke key')
    }
  }

  const copyRawKey = async () => {
    if (!newRawKey) return
    try {
      await navigator.clipboard.writeText(newRawKey)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Could not copy — select and copy manually')
    }
  }

  const patchExample = `curl -X PATCH ${window.location.origin}/api/feeds/${feedId}/params \\
  -H "Authorization: Bearer whi_…" \\
  -H "Content-Type: application/json" \\
  -d '{"values":{"your_param_id":true}}'`

  return (
    <div className="feed-param-api-panel">
      <h3 className="feed-param-api-title">Param API</h3>
      <p className="card-hint">
        Per-feed keys authenticate <code>PATCH /api/feeds/:id/params</code> — flip declared Param
        values on the <strong>live</strong> feed without a graph rebuild. Keys cannot edit rules,
        drafts, or other feeds. Treat them like passwords: revoke any key you suspect is leaked.
      </p>

      {error ? <p className="form-error">{error}</p> : null}

      <label className="l2-inspector-field">
        New key label
        <input
          value={label}
          placeholder="e.g. Zapier, cron job"
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={creating}
        onClick={() => void createKey()}
      >
        {creating ? 'Creating…' : 'Create API key'}
      </button>

      {newRawKey ? (
        <div className="feed-param-api-new-key">
          <p className="card-hint">
            <strong>Copy this key now</strong> — it won&apos;t be shown again.
          </p>
          <code className="feed-param-api-raw-key">{newRawKey}</code>
          <div className="feed-param-api-new-key-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copyRawKey()}>
              {copied ? 'Copied' : 'Copy key'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewRawKey(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="feed-param-api-keys-list">
        <h4>Active keys</h4>
        {loading ? <p className="card-hint">Loading…</p> : null}
        {!loading && keys.length === 0 ? (
          <p className="card-hint">No API keys yet.</p>
        ) : null}
        {keys.map((k) => (
          <div key={k.id} className="feed-param-api-key-row">
            <div>
              <strong>{k.label || 'Unlabeled'}</strong>
              <span className="mono card-hint"> {k.keyPrefix}…</span>
            </div>
            <div className="card-hint">
              Created {new Date(k.createdAt).toLocaleString()}
              {k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleString()}` : ''}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void revokeKey(k.id)}
            >
              Revoke
            </button>
          </div>
        ))}
      </div>

      <details className="feed-param-api-example">
        <summary>Example PATCH request</summary>
        <pre className="feed-param-api-curl">{patchExample}</pre>
      </details>
    </div>
  )
}
