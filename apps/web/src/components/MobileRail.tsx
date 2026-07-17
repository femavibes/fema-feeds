import { useState, type ReactNode } from 'react'

/**
 * Wraps a right-side rail (actions / details sidebar) so it becomes a
 * slide-in drawer on mobile. On desktop the wrapper is `display: contents`,
 * so the rail participates in the workspace grid exactly as before and the
 * FAB / backdrop stay hidden (see the mobile shell section of app.css).
 */
export function MobileRail({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="mobile-rail-fab"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      <div
        className={`mobile-rail-backdrop${open ? ' open' : ''}`}
        aria-hidden
        onClick={() => setOpen(false)}
      />
      <div className={`mobile-rail-host${open ? ' open' : ''}`}>
        <button
          type="button"
          className="mobile-rail-close"
          aria-label={`Close ${label.toLowerCase()} panel`}
          onClick={() => setOpen(false)}
        >
          ✕
        </button>
        {children}
      </div>
    </>
  )
}
