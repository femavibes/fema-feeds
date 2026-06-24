import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export type CanvasContextMenuState =
  | { kind: 'node'; nodeId: string; x: number; y: number; canRename: boolean; canDelete: boolean }
  | { kind: 'edge'; edgeId: string; x: number; y: number }
  | null

interface Props {
  menu: CanvasContextMenuState
  onClose: () => void
  onRenameNode: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
  onDisconnectEdge: (edgeId: string) => void
}

export function L2CanvasContextMenu({
  menu,
  onClose,
  onRenameNode,
  onDeleteNode,
  onDisconnectEdge,
}: Props) {
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu, onClose])

  if (!menu) return null

  return createPortal(
    <div
      className="l2-context-menu-backdrop"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div
        className="l2-context-menu"
        style={{ top: menu.y, left: menu.x }}
        role="menu"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {menu.kind === 'node' ? (
          <>
            {menu.canRename ? (
              <button
                type="button"
                role="menuitem"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onRenameNode(menu.nodeId)
                }}
              >
                Rename…
              </button>
            ) : null}
            {menu.canDelete ? (
              <button
                type="button"
                role="menuitem"
                className="l2-context-menu-danger"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onDeleteNode(menu.nodeId)
                }}
              >
                Delete node
              </button>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            role="menuitem"
            className="l2-context-menu-danger"
            onClick={() => onDisconnectEdge(menu.edgeId)}
          >
            Disconnect line
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
