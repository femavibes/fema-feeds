import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'

export function RailResizeHandle({
  label,
  onMouseDown,
}: {
  label: string
  onMouseDown: (e: ReactMouseEvent) => void
}) {
  return (
    <div
      className="l2-rail-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onMouseDown={onMouseDown}
    />
  )
}

export function RailCollapseStrip({
  label,
  expandLabel,
  onExpand,
  edge = 'right',
}: {
  label: string
  expandLabel: string
  onExpand: () => void
  edge?: 'left' | 'right'
}) {
  return (
    <div className={`l2-rail-collapse-strip l2-rail-collapse-strip--edge-${edge}`}>
      <button
        type="button"
        className="l2-rail-collapse-expand"
        onClick={onExpand}
        aria-label={expandLabel}
        title={expandLabel}
      >
        <span className="l2-rail-collapse-expand-icon" aria-hidden>
          {edge === 'left' ? '›' : '‹'}
        </span>
        <span className="l2-rail-collapse-expand-label">{label}</span>
      </button>
    </div>
  )
}

export function RailPanelHead({
  title,
  onCollapse,
  collapseLabel,
  children,
  collapseSide = 'end',
  sourceFile,
  onHelp,
  helpLabel = 'About this panel',
}: {
  title?: string
  onCollapse: () => void
  collapseLabel: string
  children?: ReactNode
  /** `start` = collapse control before title (left palette). `end` = right-aligned (properties, preview). */
  collapseSide?: 'start' | 'end'
  /** Dev aid: hover tooltip naming the component source file for this rail. */
  sourceFile?: string
  /** Optional info control (properties panel help). */
  onHelp?: () => void
  helpLabel?: string
}) {
  const collapseBtn = (
    <button
      type="button"
      className="l2-rail-panel-collapse btn btn-ghost btn-sm"
      onClick={onCollapse}
      aria-label={collapseLabel}
      title={collapseLabel}
    >
      {collapseSide === 'start' ? '‹' : '›'}
    </button>
  )

  const helpBtn = onHelp ? (
    <button
      type="button"
      className="l2-rail-panel-help btn btn-ghost btn-sm"
      onClick={onHelp}
      aria-label={helpLabel}
      title={helpLabel}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden fill="currentColor">
        <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm7.25-2.25a.75.75 0 0 1 .75-.75h.01a.75.75 0 0 1 0 1.5H8a.75.75 0 0 1-.75-.75ZM7 7.5A.75.75 0 0 1 7.75 6.75h.5a.75.75 0 0 1 .75.75V11h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5H7.5V8.25H7.25A.75.75 0 0 1 7 7.5Z" />
      </svg>
    </button>
  ) : null

  return (
    <div className={`l2-rail-panel-head l2-rail-panel-head--collapse-${collapseSide}`} title={sourceFile}>
      {collapseSide === 'start' ? collapseBtn : null}
      {title ? <span className="l2-rail-panel-title">{title}</span> : null}
      {children}
      {collapseSide === 'end' ? (
        <span className="l2-rail-panel-head-end">
          {helpBtn}
          {collapseBtn}
        </span>
      ) : (
        helpBtn
      )}
    </div>
  )
}
