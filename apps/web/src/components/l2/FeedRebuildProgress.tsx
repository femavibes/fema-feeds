import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'

interface Props {
  feedId: string
  /** Called when rebuild finishes with the matched count. */
  onComplete?: (matched: number) => void
}

export function FeedRebuildProgress({ feedId, onComplete }: Props) {
  const [active, setActive] = useState(false)
  const [processed, setProcessed] = useState(0)
  const [total, setTotal] = useState(0)
  const [matched, setMatched] = useState(0)
  const [done, setDone] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const completedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    completedRef.current = false
    setDone(false)
    setActive(false)
    setCancelling(false)

    const poll = () => {
      api.feedRebuildStatus(feedId).then((status) => {
        if (!status.active && !status.processed) {
          setActive(false)
          return
        }
        setActive(status.active)
        setProcessed(status.processed ?? 0)
        setTotal(status.total ?? 0)
        setMatched(status.matched ?? 0)

        if (!status.active && !completedRef.current) {
          completedRef.current = true
          setDone(true)
          setCancelling(false)
          const finalMatched = status.result?.matched ?? status.matched ?? 0
          setMatched(finalMatched)
          onComplete?.(finalMatched)
          api.clearFeedRebuildStatus(feedId).catch(() => {})
          if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
          }
        }
      }).catch(() => {})
    }

    poll()
    timerRef.current = setInterval(poll, 2000)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [feedId, onComplete])

  const handleCancel = () => {
    setCancelling(true)
    api.cancelFeedRebuild(feedId).catch(() => {})
  }

  if (!active && !done) return null

  const pct = total > 0 ? Math.round((processed / total) * 100) : 0

  if (done) {
    return (
      <div className="feed-rebuild-progress feed-rebuild-done">
        <span className="feed-rebuild-label">
          ✓ Rebuild complete — {matched} post{matched !== 1 ? 's' : ''} match
        </span>
      </div>
    )
  }

  return (
    <div className="feed-rebuild-progress">
      <div className="feed-rebuild-bar-track">
        <div className="feed-rebuild-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span className="feed-rebuild-label" style={{ flex: 1 }}>
          {cancelling ? 'Stopping…' : 'Rebuilding candidates…'} {processed.toLocaleString()}{total > 0 ? ` / ${total.toLocaleString()}` : ''} posts
          {matched > 0 ? ` (${matched} matched)` : ''}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem' }}
          disabled={cancelling}
          onClick={handleCancel}
        >
          Stop
        </button>
      </div>
    </div>
  )
}
