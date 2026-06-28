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
  const completedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    completedRef.current = false
    setDone(false)
    setActive(false)

    const poll = () => {
      api.feedRebuildStatus(feedId).then((status) => {
        if (!status.active && !status.processed) {
          // No rebuild in progress
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
          const finalMatched = status.result?.matched ?? status.matched ?? 0
          setMatched(finalMatched)
          onComplete?.(finalMatched)
          // Clear server-side status
          api.clearFeedRebuildStatus(feedId).catch(() => {})
          // Stop polling
          if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
          }
        }
      }).catch(() => {})
    }

    // Start polling immediately
    poll()
    timerRef.current = setInterval(poll, 2000)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [feedId, onComplete])

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
      <span className="feed-rebuild-label">
        Rebuilding candidates… {processed.toLocaleString()}{total > 0 ? ` / ${total.toLocaleString()}` : ''} posts
        {matched > 0 ? ` (${matched} matched)` : ''}
      </span>
    </div>
  )
}
