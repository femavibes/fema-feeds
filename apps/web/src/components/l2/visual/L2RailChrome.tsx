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
}: {
  title?: string
  onCollapse: () => void
  collapseLabel: string
  children?: ReactNode
  /** `start` = collapse control before title (left palette). `end` = right-aligned (properties, preview). */
  collapseSide?: 'start' | 'end'
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

  return (
    <div className={`l2-rail-panel-head l2-rail-panel-head--collapse-${collapseSide}`}>
      {collapseSide === 'start' ? collapseBtn : null}
      {title ? <span className="l2-rail-panel-title">{title}</span> : null}
      {children}
      {collapseSide === 'end' ? collapseBtn : null}
    </div>
  )
}
