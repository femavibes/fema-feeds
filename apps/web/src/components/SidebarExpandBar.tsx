interface Props {
  expanded: boolean
  onToggle: () => void
}

export function SidebarExpandBar({ expanded, onToggle }: Props) {
  return (
    <button type="button" className="sidebar-expand-bar" onClick={onToggle}>
      <svg
        className="sidebar-expand-bar-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {expanded
          ? <><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></>
          : <><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></>}
      </svg>
      {expanded ? 'Collapse' : 'View more'}
    </button>
  )
}
