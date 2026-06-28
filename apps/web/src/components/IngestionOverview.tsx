import { useEffect, useState } from 'react'
import type { PrefilterMode, ProjectL1Config } from '@cfb/core-types'
import { api } from '../api/client'
import { formatCsv, parseCsv } from '../lib/l1-form'

interface Props {
  draft: ProjectL1Config
  projectDirty: boolean
  onChange?: (next: ProjectL1Config) => void
}

const MODE_LABELS: Record<PrefilterMode, { label: string; hint: string }> = {
  manual: {
    label: 'Manual',
    hint: 'You build the prefilter. Default = keep unless blocked.',
  },
  strict: {
    label: 'Strict',
    hint: 'Auto-derived from feeds. Default = drop unless a feed wants it.',
  },
}

export function IngestionOverview({ draft, projectDirty, onChange }: Props) {
  const [poolCount, setPoolCount] = useState<number | null>(null)
  const [totalPool, setTotalPool] = useState<number | null>(null)

  useEffect(() => {
    api.stats().then((s) => {
      setPoolCount(s.byProject[draft.projectId] ?? 0)
      setTotalPool(s.poolSize)
    }).catch(() => {})
  }, [draft.projectId])

  return (
    <div className="workspace-page ingestion-overview">
      <header className="workspace-context-head">
        <div className="workspace-context-head-row">
          <h2>Ingestion Pool</h2>
          {projectDirty ? <span className="badge badge-warn">Unsaved changes</span> : null}
        </div>
        <p className="card-hint">
          The <strong>project prefilter</strong> decides what enters the pool from Jetstream. Feeds
          refine pooled posts at L2.
        </p>
      </header>

      <section className="card workspace-overview-card">
        <h3 className="workspace-overview-card-title">At a glance</h3>
        <div className="workspace-overview-stats">
          <div className="workspace-overview-stat">
            <span className="workspace-overview-stat-label">Ingestion</span>
            {onChange ? (
              <label className="checkbox project-active-toggle">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => onChange({ ...draft, enabled: e.target.checked })}
                />
                {draft.enabled ? 'On' : 'Off'}
              </label>
            ) : (
              <span className={`badge ${draft.enabled ? 'badge-on' : 'badge-off'}`}>
                {draft.enabled ? 'On' : 'Off'}
              </span>
            )}
          </div>
          <div className="workspace-overview-stat">
            <span className="workspace-overview-stat-label">Prefilter mode</span>
            {onChange ? (
              <select
                value={draft.prefilterMode ?? 'manual'}
                onChange={(e) =>
                  onChange({ ...draft, prefilterMode: e.target.value as PrefilterMode })
                }
                className="prefilter-mode-select"
              >
                <option value="manual">Manual</option>
                <option value="strict">Strict</option>
              </select>
            ) : (
              <span className="badge badge-muted">
                {MODE_LABELS[draft.prefilterMode ?? 'manual'].label}
              </span>
            )}
          </div>
          <div className="workspace-overview-stat">
            <span className="workspace-overview-stat-label">Project</span>
            <span className="workspace-overview-stat-value">{draft.projectId}</span>
          </div>
          <div className="workspace-overview-stat">
            <span className="workspace-overview-stat-label">Project pool</span>
            <span className="workspace-overview-stat-value">{poolCount !== null ? poolCount.toLocaleString() : `\u2026`}</span>
          </div>
          <div className="workspace-overview-stat">
            <span className="workspace-overview-stat-label">Total pool</span>
            <span className="workspace-overview-stat-value">{totalPool !== null ? totalPool.toLocaleString() : `\u2026`}</span>
          </div>
        </div>
        <p className="card-hint workspace-overview-hint">
          {(draft.prefilterMode ?? 'manual') === 'strict' ? (
            <>
              <strong>Strict mode:</strong> Only posts matching at least one feed&apos;s ingest-eligible
              logic enter the pool. The project prefilter editor is not used &mdash; excludes live in
              the global prefilter or in feed L2 rules.
              {draft.strictGateMeta && (
                <span className="strict-gate-meta">
                  {' '}— {draft.strictGateMeta.pathCount} include path{draft.strictGateMeta.pathCount !== 1 ? 's' : ''}{' '}
                  from {draft.strictGateMeta.contributingFeeds.length} feed{draft.strictGateMeta.contributingFeeds.length !== 1 ? 's' : ''}
                  {draft.strictGateMeta.contributingFeeds.length === 0 && (
                    <> — <em>no feeds contributing, nothing will be ingested</em></>
                  )}
                </span>
              )}
            </>
          ) : (
            <>
              Use <strong>Visual editor</strong> or <strong>JSON editor</strong> to build pool rules.{' '}
              <strong>Prefilter</strong> shows the compiled jetstream gate. Save the project in the
              sidebar to persist.
            </>
          )}
        </p>
      </section>

      <section className="card workspace-overview-card">
        <h3 className="workspace-overview-card-title">Author blocklist</h3>
        <p className="card-hint">DIDs blocked at ingest for this project (comma-separated).</p>
        {onChange ? (
          <label>
            Blocked DIDs
            <input
              value={formatCsv(draft.authorBlocklist)}
              onChange={(e) =>
                onChange({ ...draft, authorBlocklist: parseCsv(e.target.value) || undefined })
              }
              placeholder="did:plc:…"
            />
          </label>
        ) : (
          <p className="card-hint">{formatCsv(draft.authorBlocklist) || 'None'}</p>
        )}
      </section>
    </div>
  )
}
