import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { FeedConfig, L2NodeTrace, L2RuleGroup, AuthorListConfig } from '@cfb/core-types'
import type { ListCacheEntry } from '../../../api/client'
import { useVisualEditorHistory, type VisualEditorSnapshot } from '../../../hooks/useVisualEditorHistory'
import { useVisualEditorRails } from '../../../hooks/useVisualEditorRails'
import {
  addToGroup,
  clearPositionsForSubtree,
  extractNodeFromGroup,
  findInMatch,
  newLogicBlockRef,
  removeNode,
  reparentNode,
  resolveAddTargetGroupId,
  updateGroup,
} from '../../../lib/l2-form'
import { flattenTopLevelMatch, normalizeCanvasFeedStorage, normalizeRuleGroup, sanitizeCanvasEdges } from '@cfb/l2-graph'
import { L2CanvasContextMenu, type CanvasContextMenuState } from './L2CanvasContextMenu'
import { L2GraphCanvas } from './L2GraphCanvas'
import { L2PropertiesInspector } from './L2NodeInspector'
import { L2PreviewRail } from './L2PreviewRail'
import { RailCollapseStrip, RailPanelHead, RailResizeHandle } from './L2RailChrome'
import { L2NodePalette } from './L2NodePalette'
import { L2NodeRenameDialog } from './L2NodeRenameDialog'
import { resolveCanvasEdges, type CanvasEdge, type NodeLabels, type NodePositions, type NodeSources } from './graph-sync'
import { type PaletteItem, type PaletteLogicBlockEntry, type PalettePick } from './palette'

type AutosaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

function autosaveBadge(state: AutosaveState, dirty: boolean) {
  if (state === 'saving' || state === 'pending') {
    return <span className="badge badge-muted">Autosaving…</span>
  }
  if (state === 'saved') return <span className="badge badge-on">Draft autosaved</span>
  if (state === 'error') return <span className="badge badge-warn">Autosave failed</span>
  if (dirty) return <span className="badge badge-warn">Unsaved changes</span>
  return null
}

interface Props {
  draft: FeedConfig
  dirty: boolean
  saving?: boolean
  autosaveState?: AutosaveState
  onDraftChange: (next: FeedConfig | ((prev: FeedConfig) => FeedConfig)) => void
  onSaveDraft: () => void
  onReset: () => void
  onClose: () => void
  onOpenJson?: () => void
  /** Override toolbar copy for non-feed editors (e.g. logic blocks). */
  editorTitle?: string
  editorSubtitle?: string
  saveLabel?: string
  closeLabel?: string
  canvasHint?: string
  hideJsonButton?: boolean
  /** Hide manual save when draft autosave is enabled (feed editor). */
  hideSaveDraft?: boolean
  /** Project prefilter editor — ingest-only palette, no pool toggle. */
  prefilterMode?: boolean
  paletteItemFilter?: (item: import('./palette').PaletteItem) => boolean
  /** Discard autosaved draft and restore live rules (feed editor). */
  revertToLive?: { enabled: boolean; onRevert: () => void }
  /** Optional panel rendered at top of the right inspector rail. */
  metadataPanel?: ReactNode
  projectAuthorLists?: AuthorListConfig[]
  listCache?: ListCacheEntry[]
  onRefreshList?: (listId: string) => Promise<void>
}

export function L2VisualEditor({
  draft,
  dirty,
  saving = false,
  autosaveState = 'idle',
  onDraftChange,
  onSaveDraft,
  onReset,
  onClose,
  onOpenJson,
  editorTitle,
  editorSubtitle = 'Visual rule editor',
  saveLabel = 'Save draft',
  closeLabel = 'Back to rules',
  canvasHint = 'Separate paths from START are OR. Chain on one path (START → A → B → FEED) for AND. Changes autosave as draft — use Deploy in the sidebar to update live or publish.',
  hideJsonButton = false,
  hideSaveDraft = false,
  revertToLive,
  metadataPanel,
  prefilterMode = false,
  paletteItemFilter,
  projectAuthorLists = [],
  listCache = [],
  onRefreshList,
}: Props) {
  const rails = useVisualEditorRails()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [testTrace, setTestTrace] = useState<L2NodeTrace[] | null>(null)

  const handleSelectNode = useCallback((nodeId: string, trace?: L2NodeTrace[]) => {
    setSelectedId(nodeId)
    if (trace?.length) setTestTrace(trace)
  }, [])

  const match = useMemo(() => normalizeRuleGroup(draft.match), [draft.match])
  const positions = draft.visualLayout?.positions ?? {}
  const canvasEdges = draft.visualLayout?.edges ?? []
  const nodeLabels = draft.visualLayout?.labels ?? {}
  const nodeSources = draft.visualLayout?.nodeSources ?? {}
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState>(null)
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null)

  const applyHistorySnapshot = useCallback(
    (snapshot: VisualEditorSnapshot) => {
      setTestTrace(null)
      onDraftChange((prev) => ({
        ...prev,
        match: snapshot.match,
        visualLayout: snapshot.visualLayout,
      }))
    },
    [onDraftChange],
  )

  const { recordBeforeChange, undo, redo, canUndo, canRedo, resetHistory } = useVisualEditorHistory(
    draft,
    applyHistorySnapshot,
    draft.feedId,
  )

  const visualLayout = useCallback(    (patch: {
      positions?: NodePositions
      edges?: CanvasEdge[]
      labels?: NodeLabels
      nodeSources?: NodeSources
    }) => ({
      positions: patch.positions ?? positions,
      edges: patch.edges ?? canvasEdges,
      labels: patch.labels ?? nodeLabels,
      nodeSources: patch.nodeSources ?? nodeSources,
    }),
    [positions, canvasEdges, nodeLabels, nodeSources],
  )

  const patchDraft = useCallback(
    (patch: Partial<FeedConfig>) => {
      recordBeforeChange()
      onDraftChange((prev) => {
        const next = { ...prev, ...patch }
        const nextMatch = normalizeRuleGroup(next.match)
        if (next.visualLayout?.edges?.length) {
          const cleaned = sanitizeCanvasEdges(nextMatch, next.visualLayout.edges)
          if (cleaned.length !== next.visualLayout.edges.length) {
            next.visualLayout = { ...next.visualLayout, edges: cleaned }
          }
        }
        if (next.visualLayout?.edges?.length) {
          next.match = normalizeCanvasFeedStorage(next.match)
        }
        return next
      })
    },
    [onDraftChange, recordBeforeChange],
  )
  const patchMatch = useCallback(
    (next: L2RuleGroup) => {
      setTestTrace(null)
      patchDraft({
        match: next,
        visualLayout: visualLayout({ edges: resolveCanvasEdges(next, canvasEdges) }),
      })
    },
    [patchDraft, visualLayout, canvasEdges],
  )

  const patchLayout = useCallback(
    (nextPositions: NodePositions, nextEdges?: CanvasEdge[]) =>
      patchDraft({
        visualLayout: visualLayout({
          positions: { ...positions, ...nextPositions },
          edges: nextEdges ?? canvasEdges,
        }),
      }),
    [patchDraft, visualLayout, positions, canvasEdges],
  )

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  const deleteEdge = useCallback(
    (edgeId: string) => {
      const nextEdges = canvasEdges.filter((e) => e.id !== edgeId)
      setTestTrace(null)
      patchDraft({ visualLayout: visualLayout({ edges: nextEdges }) })
      if (selectedEdgeId === edgeId) setSelectedEdgeId(null)
      setContextMenu(null)
    },
    [canvasEdges, patchDraft, selectedEdgeId, visualLayout],
  )

  const deleteNode = useCallback(
    (nodeId: string) => {
      if (nodeId === 'start' || nodeId === 'end' || nodeId === match.id) return
      const nextPositions = { ...positions }
      delete nextPositions[nodeId]
      const nextEdges = canvasEdges.filter((e) => e.source !== nodeId && e.target !== nodeId)
      const nextLabels = { ...nodeLabels }
      delete nextLabels[nodeId]
      const nextMatch = removeNode(match, nodeId)
      patchDraft({
        match: nextMatch,
        visualLayout: visualLayout({
          positions: nextPositions,
          edges: nextEdges,
          labels: nextLabels,
        }),
      })
      setSelectedId(null)
      setContextMenu(null)
    },
    [match, canvasEdges, positions, nodeLabels, patchDraft, visualLayout],
  )

  const deleteSelected = useCallback(() => {
    if (selectedEdgeId) {
      deleteEdge(selectedEdgeId)
      return
    }
    if (!selectedId || selectedId === 'start' || selectedId === 'end' || selectedId === match.id) {
      return
    }
    deleteNode(selectedId)
  }, [selectedEdgeId, selectedId, match.id, deleteEdge, deleteNode])

  const applyNodeRename = useCallback(
    (nodeId: string, name: string) => {
      if (nodeId === 'start' || nodeId === 'end') return
      const node = findInMatch(match, nodeId)
      if (!node) return

      const trimmed = name.trim()
      if (node.type === 'group') {
        patchMatch(updateGroup(match, nodeId, (g) => ({ ...g, label: trimmed || undefined })))
      } else {
        const labels = { ...nodeLabels }
        if (trimmed) labels[nodeId] = trimmed
        else delete labels[nodeId]
        patchDraft({ visualLayout: visualLayout({ labels }) })
      }
    },
    [match, nodeLabels, patchMatch, patchDraft, visualLayout],
  )

  const renameNode = useCallback(
    (nodeId: string) => {
      if (nodeId === 'start' || nodeId === 'end') return
      const node = findInMatch(match, nodeId)
      if (!node) return
      setContextMenu(null)
      setRenameTargetId(nodeId)
    },
    [match],
  )

  const renameInitialName = renameTargetId
    ? (() => {
        const node = findInMatch(match, renameTargetId)
        if (!node) return ''
        return node.type === 'group' ? (node.label ?? '') : (nodeLabels[renameTargetId] ?? '')
      })()
    : ''

  const openNodeContextMenu = useCallback(
    (nodeId: string, x: number, y: number) => {
      setContextMenu({
        kind: 'node',
        nodeId,
        x,
        y,
        canRename: nodeId !== 'start' && nodeId !== 'end',
        canDelete: nodeId !== 'start' && nodeId !== 'end' && nodeId !== match.id,
      })
    },
    [match.id],
  )

  const openEdgeContextMenu = useCallback((edgeId: string, x: number, y: number) => {
    setContextMenu({ kind: 'edge', edgeId, x, y })
  }, [])

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) =>
      Boolean(
        target &&
          (target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]'),
      )

    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const editing = isEditableTarget(e.target)

      if (mod && e.key.toLowerCase() === 'z' && !editing) {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y' && !editing) {
        e.preventDefault()
        redo()
        return
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (!saving && dirty) onSaveDraft()
        return
      }

      if (e.key === 'Escape') {
        if (renameTargetId) {
          setRenameTargetId(null)
          return
        }
        if (contextMenu) {
          setContextMenu(null)
          return
        }
        handleClose()
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && (selectedEdgeId || selectedId)) {
        if (editing) return
        e.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    document.body.classList.add('l2-editor-open')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('l2-editor-open')
    }
  }, [
    handleClose,
    contextMenu,
    renameTargetId,
    selectedEdgeId,
    selectedId,
    deleteSelected,
    undo,
    redo,
    saving,
    dirty,
    onSaveDraft,
  ])
  const flash = (msg: string | null) => {
    setStatusMessage(msg)
    window.setTimeout(() => setStatusMessage(null), 2200)
  }

  const addPaletteNode = useCallback(
    (
      item: PaletteItem,
      options?: { groupId?: string; position?: { x: number; y: number } },
    ) => {
      if (!item.factory) return null

      const groupId = options?.groupId ?? resolveAddTargetGroupId(match, selectedId, item.action)
      const node = item.factory()
      const nextMatch = addToGroup(match, groupId, node)
      setTestTrace(null)

      const nextPositions = options?.position
        ? { ...positions, [node.id]: options.position }
        : positions

      patchDraft({
        match: nextMatch,
        visualLayout: visualLayout({
          positions: nextPositions,
          nodeSources: { ...nodeSources, [node.id]: 'native' },
        }),
      })
      setSelectedId(node.id)
      return node.id
    },
    [match, selectedId, positions, nodeSources, patchDraft, visualLayout],
  )

  const addLogicBlockNode = useCallback(
    (
      entry: PaletteLogicBlockEntry,
      options?: { groupId?: string; position?: { x: number; y: number } },
    ) => {
      const groupId =
        options?.groupId ?? resolveAddTargetGroupId(match, selectedId, 'condition')
      const ref = newLogicBlockRef({
        id: entry.packageId,
        version: entry.versionPin,
        name: entry.name,
      })
      const nextMatch = addToGroup(match, groupId, ref)
      setTestTrace(null)

      const nextPositions = options?.position
        ? { ...positions, [ref.id]: options.position }
        : positions

      patchDraft({
        match: nextMatch,
        visualLayout: visualLayout({
          positions: nextPositions,
          nodeSources: { ...nodeSources, [ref.id]: entry.provenance },
        }),
      })
      setSelectedId(ref.id)
      return ref.id
    },
    [match, selectedId, positions, nodeSources, patchDraft, visualLayout],
  )

  const handlePalettePick = (pick: PalettePick) => {
    if (pick.kind === 'native') {
      addPaletteNode(pick.item)
      return
    }
    addLogicBlockNode(pick.entry)
  }

  const onPaletteDrop = useCallback(
    (
      pick: PalettePick,
      flowPosition: { x: number; y: number },
      dropGroupId: string | null,
    ) => {
      if (pick.kind === 'native') {
        const item = pick.item
        const groupId =
          dropGroupId ?? resolveAddTargetGroupId(match, selectedId, item.action)
        addPaletteNode(item, { groupId, position: flowPosition })
        return
      }

      const groupId =
        dropGroupId ?? resolveAddTargetGroupId(match, selectedId, 'condition')
      addLogicBlockNode(pick.entry, { groupId, position: flowPosition })
    },
    [addLogicBlockNode, addPaletteNode, match, selectedId],
  )

  const onExtractNode = useCallback(
    (nodeId: string, flowPosition: { x: number; y: number }) => {
      const nextMatch = extractNodeFromGroup(match, nodeId)
      if (nextMatch === match) return

      patchDraft({
        match: nextMatch,
        visualLayout: visualLayout({
          positions: { ...positions, [nodeId]: flowPosition },
        }),
      })
      setSelectedId(nodeId)
      flash('Moved out of group')
    },
    [match, positions, patchDraft, visualLayout, flash],
  )

  const overlay = (
    <div
      className="l2-visual-fullscreen"
      style={rails.gridStyle}
      role="dialog"
      aria-modal="true"
      aria-label="Visual rule editor"
    >
      <header className="l2-visual-toolbar">
        <div className="l2-visual-toolbar-left">
          <h2>{editorTitle ?? draft.name}</h2>
          <span className="l2-visual-toolbar-sub">{editorSubtitle}</span>
          {autosaveBadge(autosaveState, dirty)}
          {statusMessage ? <span className="l2-json-status">{statusMessage}</span> : null}
        </div>
        <div className="l2-visual-toolbar-actions">
          <div className="l2-visual-history-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!canUndo}
              onClick={undo}
              title="Undo (Ctrl+Z)"
            >
              Undo
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!canRedo}
              onClick={redo}
              title="Redo (Ctrl+Shift+Z)"
            >
              Redo
            </button>
          </div>
          <span className="l2-editor-switch" aria-hidden="true" />
          {hideSaveDraft && revertToLive ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!revertToLive.enabled || saving}
              title={
                revertToLive.enabled
                  ? 'Discard autosaved draft changes and restore the live rule graph'
                  : 'Draft already matches live rules'
              }
              onClick={() => {
                resetHistory()
                revertToLive.onRevert()
              }}
            >
              Revert to live
            </button>
          ) : !hideSaveDraft ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!dirty}
              onClick={() => {
                resetHistory()
                onReset()
              }}
            >
              Reset
            </button>
          ) : null}
          {!hideSaveDraft ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!dirty || saving}
              onClick={onSaveDraft}
            >
              {saving ? 'Saving…' : saveLabel}
            </button>
          ) : null}
          {!hideJsonButton && onOpenJson ? (
            <>
              <span className="l2-editor-switch" aria-hidden="true" />
              <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenJson}>
                Open JSON editor
              </button>
            </>
          ) : null}
          <span className="l2-visual-hint" title="Keyboard shortcuts">
            {hideSaveDraft ? 'Ctrl+Z · Esc' : 'Ctrl+Z · Ctrl+S · Esc'}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleClose}>
            {closeLabel}
          </button>
        </div>
      </header>

      <aside className="l2-visual-rail l2-visual-rail-left">
        {rails.paletteOpen ? (
          <>
            <RailPanelHead
              title="Palette"
              collapseSide="start"
              onCollapse={rails.togglePalette}
              collapseLabel="Collapse palette"
            />
            <L2NodePalette
              onPick={handlePalettePick}
              itemFilter={paletteItemFilter}
              nativeOnly={prefilterMode}
            />
            <RailResizeHandle
              label="Resize palette"
              onMouseDown={rails.startResizePalette}
            />
          </>
        ) : (
          <RailCollapseStrip
            label="Nodes"
            edge="left"
            expandLabel="Show palette"
            onExpand={rails.togglePalette}
          />
        )}
      </aside>

      <p className="l2-visual-canvas-hint" aria-hidden="true">
        {canvasHint}
      </p>

      <main className="l2-visual-main">
        <ReactFlowProvider>
          <L2GraphCanvas
            match={match}
            positions={positions}
            canvasEdges={canvasEdges}
            selectedId={selectedId}
            selectedEdgeId={selectedEdgeId}
            testTrace={testTrace}
            onSelect={setSelectedId}
            onSelectEdge={setSelectedEdgeId}
            onPositionsChange={(next) => patchLayout(next)}
            onEdgesChange={(edges) => {
              setTestTrace(null)
              if (selectedEdgeId && !edges.some((e) => e.id === selectedEdgeId)) {
                setSelectedEdgeId(null)
              }
              patchDraft({ visualLayout: visualLayout({ edges }) })
            }}
            onMatchReorder={patchMatch}
            nodeLabels={nodeLabels}
            nodeSources={nodeSources}
            onNodeContextMenu={openNodeContextMenu}
            onEdgeContextMenu={openEdgeContextMenu}
            onReparent={(nodeId, targetGroupId) => {
              const nextMatch = reparentNode(match, nodeId, targetGroupId)
              if (nextMatch === match) return
              const nextPositions = clearPositionsForSubtree(positions, match, nodeId)
              patchDraft({
                match: nextMatch,
                visualLayout: visualLayout({
                  positions: nextPositions,
                }),
              })
              setSelectedId(nodeId)
              flash('Dropped into group')
            }}
            onExtract={onExtractNode}
            onPaletteDrop={onPaletteDrop}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            onResetPanels={rails.resetPanels}
          />          <L2CanvasContextMenu
            menu={contextMenu}
            onClose={() => setContextMenu(null)}
            onRenameNode={renameNode}
            onDeleteNode={deleteNode}
            onDisconnectEdge={deleteEdge}
          />
          <L2NodeRenameDialog
            nodeId={renameTargetId}
            initialName={renameInitialName}
            onSave={applyNodeRename}
            onClose={() => setRenameTargetId(null)}
          />
        </ReactFlowProvider>
      </main>

      <aside className="l2-visual-rail l2-visual-rail-props">
        {rails.propsOpen ? (
          <>
            <RailResizeHandle
              label="Resize properties panel"
              onMouseDown={rails.startResizeProps}
            />
            <RailPanelHead
              title="Properties"
              onCollapse={rails.toggleProps}
              collapseLabel="Collapse properties"
            />
            {metadataPanel ? (
              <div className="logic-block-editor-metadata">{metadataPanel}</div>
            ) : null}
            <L2PropertiesInspector
              match={match}
              draft={draft}
              nodeLabels={nodeLabels}
              selectedId={selectedId}
              selectedEdgeId={selectedEdgeId}
              canvasEdges={canvasEdges}
              onChange={patchMatch}
              onLabelsChange={(labels) => patchDraft({ visualLayout: visualLayout({ labels }) })}
              onDeleteSelected={deleteSelected}
              onRenameNode={renameNode}
              onDraftChange={onDraftChange}
              onPatchDraft={patchDraft}
              projectAuthorLists={projectAuthorLists}
              listCache={listCache}
              onRefreshList={onRefreshList}
              prefilterMode={prefilterMode}
            />
          </>
        ) : (
          <RailCollapseStrip
            label="Props"
            expandLabel="Show properties"
            onExpand={rails.toggleProps}
          />
        )}
      </aside>

      <aside className="l2-visual-rail l2-visual-rail-preview">
        {rails.previewOpen ? (
          <>
            <RailResizeHandle
              label="Resize matches panel"
              onMouseDown={rails.startResizePreview}
            />
            <L2PreviewRail
              draft={draft}
              match={match}
              onCollapse={rails.togglePreview}
              onTestTrace={setTestTrace}
              onSelectNode={handleSelectNode}
            />
          </>
        ) : (
          <RailCollapseStrip
            label="Matches"
            expandLabel="Show matches panel"
            onExpand={rails.togglePreview}
          />
        )}
      </aside>
    </div>
  )

  return createPortal(overlay, document.body)
}
