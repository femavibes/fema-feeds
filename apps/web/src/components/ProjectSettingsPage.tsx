import { useState } from 'react'
import type { ProjectL1Config } from '@cfb/core-types'
import { api } from '../api/client'

interface Props {
  draft: ProjectL1Config
}

export function ProjectSettingsPage({ draft }: Props) {
  const [purging, setPurging] = useState(false)
  const [purgeResult, setPurgeResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePurgePool = async () => {
    if (!window.confirm(
      `Delete ALL pool posts for project "${draft.name}"?\n\nThis removes all ingested posts tagged for this project and their feed candidates. This cannot be undone.`
    )) return
    setPurging(true)
    setError(null)
    setPurgeResult(null)
    try {
      await api.purgeProjectPool(draft.projectId)
      setPurgeResult('Pool cleared successfully.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to purge pool')
    } finally {
      setPurging(false)
    }
  }

  return (
    <div className="workspace-page">
      <header className="workspace-context-head">
        <div className="workspace-context-head-row">
          <h2>Project Settings</h2>
        </div>
        <p className="card-hint">
          Manage this project's pool data and configuration.
        </p>
      </header>

      <section className="card workspace-overview-card">
        <h3 className="workspace-overview-card-title">Pool data</h3>
        <p className="card-hint">
          Remove all ingested posts tagged for this project. Feed candidates for this project's feeds
          will also be deleted. The project config and feeds are NOT affected.
        </p>
        <div className="settings-actions" style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--danger, #ef4444)' }}
            disabled={purging}
            onClick={() => void handlePurgePool()}
          >
            {purging ? 'Deleting…' : 'Delete project pool'}
          </button>
        </div>
        {purgeResult && <p className="card-hint" style={{ marginTop: '0.5rem', color: 'var(--success, #22c55e)' }}>{purgeResult}</p>}
        {error && <p className="field-error" style={{ marginTop: '0.5rem' }}>{error}</p>}
      </section>
    </div>
  )
}
