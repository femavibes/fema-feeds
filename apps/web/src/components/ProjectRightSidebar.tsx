import { useState } from 'react'

import type { ProjectL1Config } from '@cfb/core-types'

import { L1TestPanel } from './L1TestPanel'
import { ProjectPoolPanel } from './ProjectPoolPanel'

type SidebarTab = 'project' | 'pool' | 'test'

interface Props {
  draft: ProjectL1Config
  saving: boolean
  projectDirty: boolean
  onSaveProject: () => void
  onDeleteProject: () => void
}

export function ProjectRightSidebar({
  draft,
  saving,
  projectDirty,
  onSaveProject,
  onDeleteProject,
}: Props) {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('project')

  return (
    <aside className="sidebar sidebar-right" aria-label="Project actions">
      <div className="sidebar-head">
        <div className="sidebar-head-text">
          <h2>Project</h2>
          <span className="sidebar-head-sub">{draft.name}</span>
        </div>
      </div>

      <div className="sidebar-panel-tabs sidebar-panel-tabs--triple" role="tablist" aria-label="Project sidebar">
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === 'project'}
          className={`sidebar-panel-tab${sidebarTab === 'project' ? ' active' : ''}`}
          onClick={() => setSidebarTab('project')}
        >
          Save
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === 'pool'}
          className={`sidebar-panel-tab${sidebarTab === 'pool' ? ' active' : ''}`}
          onClick={() => setSidebarTab('pool')}
        >
          Pool
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === 'test'}
          className={`sidebar-panel-tab${sidebarTab === 'test' ? ' active' : ''}`}
          onClick={() => setSidebarTab('test')}
        >
          Test
        </button>
      </div>

      <div className="sidebar-scroll">
        {sidebarTab === 'project' && (
          <section className="sidebar-block">
            <p className="card-hint project-sidebar-hint">
              Saves project prefilter and compiles jetstream rules for{' '}
              <strong>{draft.projectId}</strong>. Test tools use your current draft — save not
              required.
            </p>
            <button
              type="button"
              className="btn btn-primary sidebar-action-btn"
              disabled={saving || !projectDirty}
              onClick={onSaveProject}
            >
              {saving ? 'Saving…' : projectDirty ? 'Save project' : 'Saved'}
            </button>
            <div className="project-sidebar-badges">
              {projectDirty ? <span className="badge badge-warn">Unsaved changes</span> : null}
              <span className={`badge ${draft.enabled ? 'badge-on' : 'badge-off'}`}>
                {draft.enabled ? 'Ingestion on' : 'Ingestion off'}
              </span>
            </div>
            {projectDirty ? (
              <p className="card-hint project-sidebar-dirty-hint">
                Save before switching projects, or your edits will be lost.
              </p>
            ) : null}
          </section>
        )}

        {sidebarTab === 'pool' && (
          <section className="sidebar-block">
            <ProjectPoolPanel projectId={draft.projectId} active={sidebarTab === 'pool'} />
          </section>
        )}

        {sidebarTab === 'test' && (
          <section className="sidebar-block">
            <L1TestPanel projectId={draft.projectId} draft={draft} layout="sidebar" />
          </section>
        )}
      </div>

      <div className="sidebar-foot">
        <button
          type="button"
          className="btn btn-danger btn-sm sidebar-foot-btn"
          disabled={saving}
          onClick={onDeleteProject}
        >
          Delete project
        </button>
      </div>
    </aside>
  )
}
