import { useState } from 'react'
import type { MarketplaceProductKind } from '@cfb/core-types'
import { api } from '../../api/client'

interface Props {
  productKind: MarketplaceProductKind
  packageId: string
  visibility: 'collection' | 'deployment' | 'global'
  disabled?: boolean
  onRequested?: () => void
}

export function RequestListingButton({
  productKind,
  packageId,
  visibility,
  disabled,
  onRequested,
}: Props) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (visibility === 'global') return null

  const hint =
    visibility === 'deployment'
      ? 'Listed on this deployment. Submit a review request to appear on the global marketplace (marketplace.fema.monster).'
      : 'Global listings are reviewed by the marketplace operator. Publish to this deployment first if you want a local listing immediately.'

  const submit = async () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.createPublishRequest({
        productKind,
        packageId,
        requestedVisibility: 'global',
        publisherNote: note.trim() || undefined,
      })
      setMessage('Global listing request submitted.')
      setOpen(false)
      setNote('')
      onRequested?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="marketplace-request-listing">
      {!open ? (
        <>
          {visibility === 'deployment' ? (
            <p className="card-hint">{hint}</p>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={disabled || busy}
            onClick={() => {
              setOpen(true)
              setError(null)
              setMessage(null)
            }}
          >
            Submit to global marketplace
          </button>
        </>
      ) : (
        <div className="marketplace-request-listing-form">
          <p className="card-hint marketplace-request-listing-title">
            <strong>Global marketplace review</strong>
          </p>
          <p className="card-hint">{hint}</p>
          <label className="l2-inspector-field">
            Note for moderators
            <textarea
              rows={2}
              value={note}
              disabled={busy}
              placeholder="Optional"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="marketplace-request-listing-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? 'Submitting…' : 'Submit request'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error ? <p className="field-error">{error}</p> : null}
      {message ? <p className="settings-hint">{message}</p> : null}
    </div>
  )
}
