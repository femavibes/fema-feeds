import { useState } from 'react'
import type { FeedConfig } from '@cfb/core-types'

import { api } from '../../api/client'

interface Props {
  draft: FeedConfig
  open: boolean
  onClose: () => void
}

export function SavePersonalizationModal({ draft, open, onClose }: Props) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const formula = draft.personalization?.formula
  const isFormula = draft.personalization?.formulaEnabled && formula

  const save = async () => {
    if (!isFormula) {
      setError('Switch to Formula mode and write a formula first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.createPlugin({
        kind: 'ranker',
        runtime: 'native',
        name: name.trim() || 'Custom personalization',
        description: `Personalization formula saved from ${draft.name}`,
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
        <h3>Save personalization to collection</h3>
        <p className="card-hint">
          Save your current personalization formula as a reusable package in My Collection.
        </p>
        {!isFormula && (
          <p className="field-error">
            Only formula-based personalization can be saved. Switch to Formula mode first.
          </p>
        )}
        <label className="field-label">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Follow boost + affinity"
            autoFocus
            disabled={!isFormula}
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy && isFormula) void save() }}
          />
        </label>
        {error ? <p className="field-error">{error}</p> : null}
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || !isFormula}
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
