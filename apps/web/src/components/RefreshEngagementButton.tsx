import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

interface Props {
  scope: 'project' | 'global'
  projectId?: string
}

interface ProgressState {
  active: boolean
  total: number
  refreshed: number
  errors: number
  startedAt: string | null
  finishedAt: string | null
}

export function RefreshEngagementButton({ scope, projectId }: Props) {
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [forceAll, setForceAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const completedRef = useRef(false)

  const fetchStatus = async () => {
    try {
      const status = scope === 'project' && projectId
        ? await api.refreshProjectEngagementStatus(projectId)
        : await api.refreshEngagementStatus()
      setProgress(status)
      if (!status.active && status.startedAt && !completedRef.current) {
        completedRef.current = true
        stopPolling()
      }
    } catch { /* ignore */ }
  }

  const stopPolling = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const startPolling = () => {
    stopPolling()
    completedRef.current = false
    timerRef.current = setInterval(() => void fetchStatus(), 2000)
  }

  useEffect(() => {
    void fetchStatus()
    return stopPolling
  }, [scope, projectId])

  useEffect(() => {
    if (progress?.active && !timerRef.current) {
      startPolling()
    }
  }, [progress?.active])

  const handleStart = async () => {
    setError(null)
    try {
      const res = scope === 'project' && projectId
        ? await api.refreshProjectEngagement(projectId, forceAll)
        : await api.refreshEngagement(forceAll)
      setProgress(res)
      if (res.active) startPolling()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start refresh')
    }
  }

  const handleClear = async () => {
    try {
      if (scope === 'project' && projectId) {
        await api.clearRefreshProjectEngagementStatus(projectId)
      } else {
        await api.clearRefreshEngagementStatus()
      }
      setProgress(null)
      completedRef.current = false
    } catch { /* ignore */ }
  }

  const isActive = progress?.active === true
  const isDone = progress && !progress.active && progress.startedAt
  const pct = progress && progress.total > 0
    ? Math.round((progress.refreshed / progress.total) * 100)
    : 0

  return (
    <div className="engagement-refresh-widget">
      {!isActive && !isDone && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleStart()}
          >
            Refresh engagement
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={forceAll}
            aria-label="Force refresh all posts"
            className={`toggle-switch ${forceAll ? 'on' : ''}`}
            onClick={() => setForceAll(!forceAll)}
          >
            <span className="toggle-knob" />
            <span className="toggle-text">{forceAll ? 'All' : 'Stale'}</span>
          </button>
          <span className="card-hint" style={{ fontSize: '0.78rem' }}>
            {forceAll ? 'Refresh every post' : 'Only stale (>60 min)'}
          </span>
        </div>
      )}

      {isActive && progress && (
        <div className="feed-rebuild-progress">
          <div className="feed-rebuild-bar-track">
            <div className="feed-rebuild-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="feed-rebuild-label">
            Refreshing engagement… {progress.refreshed.toLocaleString()}
            {progress.total > 0 ? ` / ${progress.total.toLocaleString()}` : ''} posts
            {progress.errors > 0 ? ` (${progress.errors} errors)` : ''}
          </span>
        </div>
      )}

      {isDone && progress && (
        <div className="feed-rebuild-progress feed-rebuild-done">
          <span className="feed-rebuild-label">
            ✓ Engagement refreshed — {progress.refreshed.toLocaleString()} post{progress.refreshed !== 1 ? 's' : ''} updated
            {progress.errors > 0 ? ` · ${progress.errors} errors` : ''}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: '0.5rem' }}
            onClick={() => void handleClear()}
          >
            Dismiss
          </button>
        </div>
      )}

      {error && <p className="field-error" style={{ marginTop: '0.25rem' }}>{error}</p>}
    </div>
  )
}
