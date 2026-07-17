import { useState } from 'react'
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const activeLabel = NAV_ITEMS.find((item) => item.id === view)?.label ?? 'Views'

  return (
    <aside
      className={`sidebar workspace-nav workspace-nav--community${mobileMenuOpen ? ' mobile-menu-open' : ''}`}
      aria-label="Community navigation"
    >
      <div className="sidebar-head" title="CommunityNav.tsx">
        <span className="sidebar-head-label">Community</span>
      </div>
      <div className="workspace-nav-mobile-bar">
        <button
          type="button"
          className="mobile-nav-toggle"
          aria-label="Open navigation"
          onClick={() => window.dispatchEvent(new CustomEvent('cfb:toggle-projects'))}
        >
          ☰
        </button>
        <span className="workspace-nav-mobile-context">Community</span>
        <button
          type="button"
          className="workspace-nav-current"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((v) => !v)}
        >
          <span className="workspace-nav-current-caret" aria-hidden>
            {mobileMenuOpen ? '▾' : '▴'}
          </span>
          {activeLabel}
          <span className="workspace-nav-current-caret" aria-hidden>
            {mobileMenuOpen ? '▾' : '▴'}
          </span>
        </button>
      </div>
      <nav className="workspace-nav-list">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`workspace-nav-item${view === item.id ? ' active' : ''}`}
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => {
              setMobileMenuOpen(false)
              onViewChange(item.id)
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  )
}
