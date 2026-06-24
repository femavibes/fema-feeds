import { Panel, useViewport } from '@xyflow/react'

interface Props {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onResetPanels?: () => void
}

export function L2CanvasToolbar({ canUndo, canRedo, onUndo, onRedo, onResetPanels }: Props) {
  const { zoom } = useViewport()

  return (
    <Panel position="top-left" className="l2-canvas-toolbar">
      <button
        type="button"
        className="l2-canvas-toolbar-btn"
        disabled={!canUndo}
        onClick={onUndo}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
      >
        ↶
      </button>
      <button
        type="button"
        className="l2-canvas-toolbar-btn"
        disabled={!canRedo}
        onClick={onRedo}
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
      >
        ↷
      </button>
      {onResetPanels ? (
        <>
          <span className="l2-canvas-toolbar-divider" aria-hidden="true" />
          <button
            type="button"
            className="l2-canvas-toolbar-btn l2-canvas-toolbar-btn-text"
            onClick={onResetPanels}
            title="Reset panel widths and expand all sidebars"
            aria-label="Reset panels"
          >
            Panels
          </button>
        </>
      ) : null}
      <span className="l2-canvas-toolbar-divider" aria-hidden="true" />
      <span className="l2-canvas-toolbar-zoom" title="Canvas zoom">
        {Math.round(zoom * 100)}%
      </span>
    </Panel>
  )
}
