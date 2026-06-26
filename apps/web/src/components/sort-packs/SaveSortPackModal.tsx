import { useState } from 'react'
import type { FeedConfig } from '@cfb/core-types'

import { api } from '../../api/client'
import { detectSortMode, rankExprForMode, DEFAULT_ENGAGEMENT_WEIGHTS, type EngagementWeights } from '../../lib/feed-sorting'

interface Props {
  draft: FeedConfig
  open: boolean
  onClose: () => void
}

export function SaveSortPackModal({ draft, open, onClose }: Props) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const save = async () => {
    const mode = detectSortMode(draft.rank)
    const weights: EngagementWeights = DEFAULT_ENGAGEMENT_WEIGHTS
    const sortKey = draft.rank?.sortKey ?? rankExprForMode(mode, weights)
    if (!sortKey) {
      setError('Choose a non-chronological sort first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.createSortPack({
        name: name.trim() || 'Custom sort',
        sortKey,
        visibility: 'collection',
      })
      setName('')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Save sort to collection</h3>
        <p className="card-hint">Save your current sort formula as a reusable sort pack in My Collection.</p>
        <label className="field-label">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Discussion-heavy sort"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void save() }}
          />
        </label>
        {error ? <p className="field-error">{error}</p> : null}
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
