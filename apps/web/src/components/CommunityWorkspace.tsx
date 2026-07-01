import { useState } from 'react'
import type { CommunityWorkspaceView } from '../lib/workspace-views'
import type { CommunityFeedEntry } from '../api/client'
import { CommunityNav } from './community/CommunityNav'
import { CommunityFeedsPanel } from './community/CommunityFeedsPanel'
import { CommunityUsersPanel } from './community/CommunityUsersPanel'
import { CommunityFeedDetail } from './community/CommunityFeedDetail'

const VIEW_COPY: Record<CommunityWorkspaceView, { title: string; hint: string }> = {
  feeds: {
    title: 'Feeds',
    hint: 'Public feeds on this deployment and the global network.',
  },
  templates: {
    title: 'Templates',
    hint: 'Feed templates shared by the community. Copy a template to start building with pre-configured logic.',
  },
  users: {
    title: 'Users',
    hint: 'Users on this deployment.',
  },
}

export function CommunityWorkspace() {
  const [view, setView] = useState<CommunityWorkspaceView>('feeds')
  const [selectedFeed, setSelectedFeed] = useState<CommunityFeedEntry | null>(null)

  const copy = VIEW_COPY[view]

  const handleViewChange = (next: CommunityWorkspaceView) => {
    setView(next)
    setSelectedFeed(null)
  }

  return (
    <div className="project-workspace project-workspace--catalog">
      <CommunityNav view={view} onViewChange={handleViewChange} />

      <main className="l2-main-panel">
        <div className="workspace-page community-page">
          <header className="workspace-context-head">
            <h2>{copy.title}</h2>
            <p className="card-hint">{copy.hint}</p>
          </header>

          {view === 'feeds' && (
            <CommunityFeedsPanel
              isTemplate={false}
              selectedFeedId={selectedFeed?.feedId ?? null}
              onSelectFeed={setSelectedFeed}
            />
          )}
          {view === 'templates' && (
            <CommunityFeedsPanel
              isTemplate={true}
              selectedFeedId={selectedFeed?.feedId ?? null}
              onSelectFeed={setSelectedFeed}
            />
          )}
          {view === 'users' && <CommunityUsersPanel />}
        </div>
      </main>

      <aside className="sidebar sidebar-right marketplace-sidebar">
        <CommunityFeedDetail feed={selectedFeed} />
      </aside>
    </div>
  )
}
