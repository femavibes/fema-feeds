import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, type FeedSkeletonResponse } from '../../api/client'
import { postAtUriToBskyUrl } from '../../lib/bsky-url'
import { skeletonUrlForBrowser, skeletonUrlForJson } from '../../lib/skeleton-url'

interface Props {
  feedId: string
  feedName?: string
  publicSkeletonUrl?: string | null
  onClose: () => void
}

export function SkeletonPreviewDialog({ feedId, feedName, publicSkeletonUrl, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<FeedSkeletonResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void api
      .getFeedSkeleton(feedId)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load skeleton')
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [feedId])

  return createPortal(
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card skeleton-preview-dialog"
        role="dialog"
        aria-labelledby="skeleton-preview-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="skeleton-preview-head">
          <h2 id="skeleton-preview-title">{feedName ?? feedId} — skeleton</h2>
          {data ? (
            <p className="card-hint">
              {data.feed.length} post{data.feed.length === 1 ? '' : 's'} on this page ·{' '}
              {data.candidateCount.toLocaleString()} candidates in pool
            </p>
          ) : null}
        </header>

        {loading ? <p className="card-hint">Loading skeleton…</p> : null}
        {error ? <p className="field-error">{error}</p> : null}

        {!loading && !error && data ? (
          data.feed.length > 0 ? (
            <ol className="skeleton-preview-list">
              {data.feed.map((item, index) => {
                const bsky = postAtUriToBskyUrl(item.post)
                return (
                  <li key={`${item.post}-${index}`}>
                    {bsky ? (
                      <a
                        className="skeleton-preview-link"
                        href={bsky}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {item.post}
                      </a>
                    ) : (
                      <code>{item.post}</code>
                    )}
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="card-hint">No posts in this skeleton page.</p>
          )
        ) : null}

        {publicSkeletonUrl ? (
          <p className="card-hint skeleton-preview-public">
            Public feedgen:{' '}
            <a
              className="skeleton-preview-link"
              href={skeletonUrlForBrowser(publicSkeletonUrl)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open skeleton in browser
            </a>
            <span className="skeleton-preview-public-json">
              {' '}
              ·{' '}
              <a
                className="skeleton-preview-link skeleton-preview-link-muted"
                href={skeletonUrlForJson(publicSkeletonUrl)}
                target="_blank"
                rel="noopener noreferrer"
              >
                raw JSON
              </a>
            </span>
          </p>
        ) : null}

        <footer className="skeleton-preview-foot">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
