import type { CommunityWorkspaceView } from '../../lib/workspace-views'

const NAV_ITEMS: { id: CommunityWorkspaceView; label: string }[] = [
  { id: 'feeds', label: 'Feeds' },
  { id: 'templates', label: 'Templates' },
  { id: 'users', label: 'Users' },
]

interface Props {
  view: CommunityWorkspaceView
  onViewChange: (view: CommunityWorkspaceView) => void
}

export function CommunityNav({ view, onViewChange }: Props) {
  return (
    <aside className="workspace-nav" aria-label="Community navigation">
      <div className="sidebar-head">
        <span className="sidebar-head-label">Community</span>
      </div>
      <nav className="workspace-nav-list">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`workspace-nav-item${view === item.id ? ' active' : ''}`}
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => onViewChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  )
}
