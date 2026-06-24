import type { ProjectL1Config } from '@cfb/core-types'
import { formatCsv, parseCsv } from '../lib/l1-form'

interface Props {
  draft: ProjectL1Config
  projectDirty: boolean
  onChange?: (next: ProjectL1Config) => void
}

export function IngestionOverview({ draft, projectDirty, onChange }: Props) {
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
            <span className="workspace-overview-stat-label">Project</span>
            <span className="workspace-overview-stat-value">{draft.projectId}</span>
          </div>
        </div>
        <p className="card-hint workspace-overview-hint">
          Use <strong>Visual editor</strong> or <strong>JSON editor</strong> to build pool rules.{' '}
          <strong>Prefilter</strong> shows the compiled jetstream gate. Save the project in the
          sidebar to persist.
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
