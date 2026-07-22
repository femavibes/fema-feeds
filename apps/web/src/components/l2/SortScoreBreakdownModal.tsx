import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FeedConfig } from '@cfb/core-types'
import { api, type SortTestResult } from '../../api/client'
import { atUriToBskyUrl } from '../../lib/sort-test-display'
import { SortTestBreakdown } from './SortTestBreakdown'

interface Props {
  open: boolean
  feed: FeedConfig
  postUri: string | null
  previewSortKey?: number | null
  onClose: () => void
}

export function SortScoreBreakdownModal({
  open,
  feed,
  postUri,
  previewSortKey,
  onClose,
}: Props) {
  const [result, setResult] = useState<SortTestResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !postUri) {
      setResult(null)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setResult(null)

    void api
      .sortTest(feed.feedId, { url: atUriToBskyUrl(postUri), feed })
      .then((res) => {
        if (cancelled) return
        setResult(res)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load score breakdown')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, postUri, feed])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open || !postUri) return null

  return createPortal(
    <div
      className="l2-param-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="l2-param-modal sort-score-breakdown-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sort-score-breakdown-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="sort-score-breakdown-title">Score breakdown</h3>
        <p className="card-hint">
          How this post scores with your current sort formula.
          {previewSortKey != null ? ` Match preview total: ${previewSortKey.toFixed(4)}.` : ''}
        </p>

        {loading ? <p className="card-hint">Loading breakdown…</p> : null}
        {error ? <p className="field-error">{error}</p> : null}
        {result ? (
          <>
            <a
              className="sort-score-breakdown-link mono"
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {result.url}
            </a>
            <SortTestBreakdown result={result} feed={feed} />
          </>
        ) : null}

        <div className="l2-param-modal-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
