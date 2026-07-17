import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export type ConnectTarget = { id: string; label: string }

export type CanvasContextMenuState =
  | {
      kind: 'node'
      nodeId: string
      x: number
      y: number
      canRename: boolean
      canDelete: boolean
      canDuplicate: boolean
      canOpenProperties: boolean
      /** False when the node is nested inside an AND/OR/N-of group (no canvas wires). */
      canConnect: boolean
      connectTargets: ConnectTarget[]
    }
  | {
      kind: 'connect'
      nodeId: string
      x: number
      y: number
      targets: ConnectTarget[]
    }
  | { kind: 'edge'; edgeId: string; x: number; y: number }
  | null

interface Props {
  menu: CanvasContextMenuState
  onClose: () => void
  onRenameNode: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
  onDuplicateNode: (nodeId: string) => void
  onOpenProperties: (nodeId: string) => void
  onConnectNodes: (sourceId: string, targetId: string) => void
  onDisconnectEdge: (edgeId: string) => void
  onEnterConnectPicker: (nodeId: string, x: number, y: number, targets: ConnectTarget[]) => void
}

export function L2CanvasContextMenu({
  menu,
  onClose,
  onRenameNode,
  onDeleteNode,
  onDuplicateNode,
  onOpenProperties,
  onConnectNodes,
  onDisconnectEdge,
  onEnterConnectPicker,
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
            {menu.canOpenProperties ? (
              <button
                type="button"
                role="menuitem"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onOpenProperties(menu.nodeId)
                }}
              >
                Open properties
              </button>
            ) : null}
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
            {menu.canDuplicate ? (
              <button
                type="button"
                role="menuitem"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onDuplicateNode(menu.nodeId)
                }}
              >
                Duplicate node
              </button>
            ) : null}
            {menu.canConnect && menu.connectTargets.length > 0 ? (
              <button
                type="button"
                role="menuitem"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onEnterConnectPicker(menu.nodeId, menu.x, menu.y, menu.connectTargets)
                }}
              >
                Connect to…
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
        ) : menu.kind === 'connect' ? (
          <>
            <div className="l2-context-menu-heading">Connect to</div>
            {menu.targets.map((t) => (
              <button
                key={t.id}
                type="button"
                role="menuitem"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onConnectNodes(menu.nodeId, t.id)
                }}
              >
                {t.label}
              </button>
            ))}
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
