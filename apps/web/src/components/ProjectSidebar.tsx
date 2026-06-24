import { useEffect, useState } from 'react'
import type { FeedConfig, ProjectL1Config } from '@cfb/core-types'
import { GLOBAL_NAV_ITEMS, type BuilderSection } from '../lib/global-nav'

type FeedListItem = FeedConfig & { hasUnpublishedDraft?: boolean }

interface Props {
  projects: ProjectL1Config[]
  selectedId: string | null
  loading: boolean
  feeds: FeedListItem[]
  selectedFeedId: string | null
  builderSection: BuilderSection
  onSelect: (id: string) => void
  onSelectFeed: (feedId: string) => void
  onGlobalNavSelect: (section: BuilderSection) => void
  onCreate: (projectId: string, name: string) => void
  onCreateFeed: (feedId: string, name: string) => void
}

export function ProjectSidebar({
  projects,
  selectedId,
  loading,
  feeds,
  selectedFeedId,
  builderSection,
  onSelect,
  onSelectFeed,
  onGlobalNavSelect,
  onCreate,
  onCreateFeed,
}: Props) {
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectId, setNewProjectId] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [showNewFeed, setShowNewFeed] = useState(false)
  const [newFeedId, setNewFeedId] = useState('')
  const [newFeedName, setNewFeedName] = useState('')

  useEffect(() => {
    setShowNewFeed(false)
    setNewFeedId('')
    setNewFeedName('')
  }, [selectedId])

  const submitNewProject = () => {
    const id = newProjectId.trim().toLowerCase().replace(/\s+/g, '-')
    if (!id) return
    onCreate(id, newProjectName.trim() || id)
    setShowNewProject(false)
    setNewProjectId('')
    setNewProjectName('')
  }

  const submitNewFeed = () => {
    const id = newFeedId.trim().toLowerCase().replace(/\s+/g, '-')
    if (!id) return
    onCreateFeed(id, newFeedName.trim() || id)
    setShowNewFeed(false)
    setNewFeedId('')
    setNewFeedName('')
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <h2>Projects</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowNewProject(true)}>
          + New
        </button>
      </div>

      {showNewProject && (
        <div className="new-project">
          <label>
            Project ID
            <input
              value={newProjectId}
              onChange={(e) => setNewProjectId(e.target.value)}
              placeholder="my-feed"
              autoFocus
            />
          </label>
          <label>
            Display name
            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="My Feed"
            />
          </label>
          <div className="new-project-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={submitNewProject}>
              Create
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowNewProject(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <ul className="project-list">
        {loading && projects.length === 0 && <li className="project-list-empty">Loading…</li>}
        {projects.map((p) => {
          const isSelected = selectedId === p.projectId

          return (
            <li key={p.projectId} className="project-tree-item">
              <button
                type="button"
                className={`project-item ${isSelected && !selectedFeedId ? 'active' : isSelected ? 'selected' : ''}`}
                onClick={() => onSelect(p.projectId)}
              >
                <span className="project-name">
                  {isSelected && feeds.length > 0 ? '▾ ' : isSelected ? '▸ ' : ''}
                  {p.name}
                </span>
                <span className="project-id">{p.projectId}</span>
                <span className={`badge ${p.enabled ? 'badge-on' : 'badge-off'}`}>
                  {p.enabled ? 'on' : 'off'}
                </span>
              </button>

              {isSelected && (
                <div className="feed-nested">
                  <div className="feed-nested-head">
                    <span className="feed-nested-label">
                      Feeds{feeds.length > 0 ? ` (${feeds.length})` : ''}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowNewFeed(true)}
                    >
                      + Feed
                    </button>
                  </div>

                  {showNewFeed && (
                    <div className="new-project feed-nested-new">
                      <label>
                        Feed ID
                        <input
                          value={newFeedId}
                          onChange={(e) => setNewFeedId(e.target.value)}
                          placeholder="urbanism-main"
                          autoFocus
                        />
                      </label>
                      <label>
                        Name
                        <input value={newFeedName} onChange={(e) => setNewFeedName(e.target.value)} />
                      </label>
                      <div className="new-project-actions">
                        <button type="button" className="btn btn-primary btn-sm" onClick={submitNewFeed}>
                          Create
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setShowNewFeed(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <ul className="feed-nested-list">
                    {feeds.length === 0 && (
                      <li className="project-list-empty feed-nested-empty">No feeds yet</li>
                    )}
                    {feeds.map((f) => (
                      <li key={f.feedId}>
                        <button
                          type="button"
                          className={`feed-nested-item ${selectedFeedId === f.feedId ? 'active' : ''}`}
                          onClick={() => onSelectFeed(f.feedId)}
                        >
                          <span className="project-name">{f.name}</span>
                          <span className="project-id">{f.feedId}</span>
                          <span className="feed-sidebar-badges">
                            {f.hasUnpublishedDraft && (
                              <span className="badge badge-warn">draft</span>
                            )}
                            {f.published ? (
                              <span className="badge badge-on">pub</span>
                            ) : f.enabled ? (
                              <span className="badge badge-muted">live</span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <footer className="sidebar-footer">
        <ul className="sidebar-global-nav" aria-label="Global">
          {GLOBAL_NAV_ITEMS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`sidebar-global-item${builderSection === item.id ? ' active' : ''}`}
                aria-current={builderSection === item.id ? 'page' : undefined}
                onClick={() => onGlobalNavSelect(item.id)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </footer>
    </aside>
  )
}
