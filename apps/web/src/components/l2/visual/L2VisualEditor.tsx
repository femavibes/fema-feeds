import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { FeedConfig, L2NodeProvenance, L2NodeTrace, L2RuleGroup, AuthorListConfig, LogicBlockPackage } from '@cfb/core-types'
import type { ListCacheEntry } from '../../../api/client'
import { useVisualEditorHistory, type VisualEditorSnapshot } from '../../../hooks/useVisualEditorHistory'
import { useVisualEditorRails } from '../../../hooks/useVisualEditorRails'
import { retainBodyEditorOpen } from '../../../lib/body-editor-open'
import { VisualEditorNestContext } from './visual-editor-nest'
import {
  addToGroup,
  clearPositionsForSubtree,
  cloneNodeWithNewIds,
  extractNodeFromGroup,
  findInMatch,
  findParentId,
  isTopLevelMatchNode,
  newLogicBlockRef,
  removeNode,
  reparentNode,
  resolveAddTargetGroupId,
  updateGroup,
  updateInMatch,
  newId,
} from '../../../lib/l2-form'
import { flattenTopLevelMatch, normalizeCanvasFeedStorage, normalizeRuleGroup, sanitizeCanvasEdges, syncSharedParamControlFromPanel } from '@cfb/l2-graph'
import { L2CanvasContextMenu, type CanvasContextMenuState } from './L2CanvasContextMenu'
import { L2GraphCanvas } from './L2GraphCanvas'
import { L2PropertiesInspector } from './L2NodeInspector'
import { L2PreviewRail } from './L2PreviewRail'
import { RailCollapseStrip, RailPanelHead, RailResizeHandle } from './L2RailChrome'
import { PropertiesHelpModal } from './PropertiesHelpModal'
import { MobileSheetHandle } from './MobileSheetHandle'
import { L2NodePalette } from './L2NodePalette'
import { L2NodeRenameDialog } from './L2NodeRenameDialog'
import { LogicBlockInnerPreview } from '../../logic-blocks/LogicBlockInnerPreview'
import { LogicBlockVersionCompare } from '../../logic-blocks/LogicBlockVersionCompare'
import {
  collectDescendantLeafIds,
  isValidCanvasConnection,
  newCanvasEdge,
  resolveCanvasEdges,
  subtreeContainsLocked,
  type CanvasEdge,
  type NodeLabels,
  type NodePositions,
  type NodeSources,
} from './graph-sync'
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
  /** Read-only canvas (no edits, palette, or save). */
  readOnly?: boolean
  /** Hide manual save when draft autosave is enabled (feed editor). */
  hideSaveDraft?: boolean
  /** Project prefilter editor — ingest-only palette, no pool toggle. */
  prefilterMode?: boolean
  paletteItemFilter?: (item: import('./palette').PaletteItem) => boolean
  /** Discard autosaved draft and restore live rules (feed editor). */
  revertToLive?: { enabled: boolean; onRevert: () => void }
  /** Update live button inside the visual editor toolbar. */
  onUpdateLive?: () => Promise<void>
  /** Optional panel rendered at top of the right inspector rail. */
  metadataPanel?: ReactNode
  projectAuthorLists?: AuthorListConfig[]
  listCache?: ListCacheEntry[]
  onRefreshList?: (listId: string) => Promise<void>
  onListsChanged?: () => void | Promise<void>
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
  closeLabel: _closeLabel = 'Back to rules',
  canvasHint = 'Separate paths from START are OR. Chain on one path (START → A → B → FEED) for AND. Changes autosave as draft — use Deploy in the sidebar to update live or publish.',
  hideJsonButton = false,
  readOnly = false,
  hideSaveDraft = false,
  revertToLive,
  onUpdateLive,
  metadataPanel,
  prefilterMode = false,
  paletteItemFilter,
  projectAuthorLists = [],
  listCache = [],
  onRefreshList,
  onListsChanged,
}: Props) {
  const rails = useVisualEditorRails()
  const [propertiesHelpOpen, setPropertiesHelpOpen] = useState(false)
  const [innerLogicPreview, setInnerLogicPreview] = useState<{
    packageId: string
    versionPin: string
    title?: string
    updatePolicy?: 'pinned' | 'notify' | 'auto_minor'
  } | null>(null)
  const [logicBlockCompare, setLogicBlockCompare] = useState<{
    packageId: string
    fromVersion: string
    toVersion: string
    title?: string
  } | null>(null)
  const nestedOverlayOpen = innerLogicPreview !== null || logicBlockCompare !== null

  // Mobile: rails render as bottom sheets toggled from the editor's bottom
  // bar. Start with all sheets closed, and only allow one open at a time.
  const railsRef = useRef(rails)
  railsRef.current = rails
  useEffect(() => {
    if (!window.matchMedia('(max-width: 768px)').matches) return
    const r = railsRef.current
    if (r.paletteOpen) r.togglePalette()
    if (r.propsOpen) r.toggleProps()
    if (r.previewOpen) r.togglePreview()
  }, [])

  // Double-click / double-tap on a canvas node: select it and make sure the
  // properties panel is showing (as the exclusive sheet on mobile).
  const openPropertiesForNode = useCallback((nodeId: string) => {
    setSelectedId(nodeId)
    const r = railsRef.current
    if (window.matchMedia('(max-width: 768px)').matches) {
      if (r.paletteOpen) r.togglePalette()
      if (r.previewOpen) r.togglePreview()
    }
    if (!r.propsOpen) r.toggleProps()
  }, [])

  const toggleMobileRail = (which: 'palette' | 'props' | 'preview') => {
    if (which !== 'palette' && rails.paletteOpen) rails.togglePalette()
    if (which !== 'props' && rails.propsOpen) rails.toggleProps()
    if (which !== 'preview' && rails.previewOpen) rails.togglePreview()
    if (which === 'palette') rails.togglePalette()
    if (which === 'props') rails.toggleProps()
    if (which === 'preview') rails.togglePreview()
  }

  const registerNestedOverlay = useCallback(() => {
    return () => {}
  }, [])

  const nestContext = useMemo(
    () => ({ registerNestedOverlay }),
    [registerNestedOverlay],
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [testTrace, setTestTrace] = useState<L2NodeTrace[] | null>(null)
  const [updatingLive, setUpdatingLive] = useState(false)
  const updatingLiveRef = useRef(false)

  const handleUpdateLiveClick = useCallback(() => {
    if (!onUpdateLive || updatingLiveRef.current) return
    updatingLiveRef.current = true
    setUpdatingLive(true)
    onUpdateLive().then(
      () => { updatingLiveRef.current = false; setUpdatingLive(false) },
      () => { updatingLiveRef.current = false; setUpdatingLive(false) },
    )
  }, [onUpdateLive])

  const handleSelectNode = useCallback((nodeId: string, trace?: L2NodeTrace[]) => {
    setSelectedId(nodeId)
    if (trace?.length) setTestTrace(trace)
  }, [])

  const match = useMemo(() => normalizeRuleGroup(draft.match), [draft.match])
  const positions = draft.visualLayout?.positions ?? {}
  const savedCanvasEdges = draft.visualLayout?.edges
  const canvasEdges = savedCanvasEdges ?? []
  const nodeLabels = draft.visualLayout?.labels ?? {}
  const nodeSources = draft.visualLayout?.nodeSources ?? {}
  const expandedNodeIds = draft.visualLayout?.expandedNodeIds ?? []
  const lockedNodeIds = draft.visualLayout?.lockedNodeIds ?? []
  const lockedSet = useMemo(() => new Set(lockedNodeIds), [lockedNodeIds])
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState>(null)
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null)
  /** After "Connect to…", the next node tap completes the wire. */
  const [connectFromId, setConnectFromId] = useState<string | null>(null)

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
      expandedNodeIds?: string[]
      lockedNodeIds?: string[]
    }) => ({
      positions: patch.positions ?? positions,
      edges: patch.edges ?? canvasEdges,
      labels: patch.labels ?? nodeLabels,
      nodeSources: patch.nodeSources ?? nodeSources,
      expandedNodeIds: patch.expandedNodeIds ?? expandedNodeIds,
      lockedNodeIds: patch.lockedNodeIds ?? lockedNodeIds,
    }),
    [positions, canvasEdges, nodeLabels, nodeSources, expandedNodeIds, lockedNodeIds],
  )

  const patchDraft = useCallback(
    (patch: Partial<FeedConfig>) => {
      recordBeforeChange()
      onDraftChange((prev) => {
        const next = { ...prev, ...patch }
        // Merge visualLayout so a follow-up match patch in the same tick cannot
        // clobber freshly saved node positions (root-node drag snap-back bug).
        if (patch.visualLayout) {
          next.visualLayout = { ...prev.visualLayout, ...patch.visualLayout }
        }
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
      // Only touch edges — keep whatever positions are already on the draft
      // (including a positions patch queued earlier in this drag-stop).
      patchDraft({
        match: next,
        visualLayout: {
          edges: resolveCanvasEdges(next, savedCanvasEdges),
        } as FeedConfig['visualLayout'],
      })
    },
    [patchDraft, savedCanvasEdges],
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

  const toggleNodeExpanded = useCallback(
    (nodeId: string) => {
      const set = new Set<string>(expandedNodeIds)
      if (set.has(nodeId)) set.delete(nodeId)
      else set.add(nodeId)
      patchDraft({ visualLayout: visualLayout({ expandedNodeIds: [...set] }) })
    },
    [expandedNodeIds, patchDraft, visualLayout],
  )

  const toggleNodeLocked = useCallback(
    (nodeId: string) => {
      if (nodeId === 'start' || nodeId === 'end' || nodeId === match.id) return
      const set = new Set<string>(lockedNodeIds)
      if (set.has(nodeId)) set.delete(nodeId)
      else set.add(nodeId)
      patchDraft({ visualLayout: visualLayout({ lockedNodeIds: [...set] }) })
    },
    [lockedNodeIds, match.id, patchDraft, visualLayout],
  )

  const collapseAllInGroup = useCallback(
    (groupId: string) => {
      const leaves = collectDescendantLeafIds(match, groupId)
      if (leaves.length === 0) return
      const remove = new Set(leaves.filter((id) => !lockedSet.has(id)))
      if (remove.size === 0) return
      const next = expandedNodeIds.filter((id: string) => !remove.has(id))
      if (next.length === expandedNodeIds.length) return
      patchDraft({ visualLayout: visualLayout({ expandedNodeIds: next }) })
    },
    [expandedNodeIds, lockedSet, match, patchDraft, visualLayout],
  )

  const expandAllInGroup = useCallback(
    (groupId: string) => {
      const leaves = collectDescendantLeafIds(match, groupId)
      if (leaves.length === 0) return
      const set = new Set<string>(expandedNodeIds)
      let changed = false
      for (const id of leaves) {
        if (lockedSet.has(id)) continue
        if (!set.has(id)) {
          set.add(id)
          changed = true
        }
      }
      if (!changed) return
      patchDraft({ visualLayout: visualLayout({ expandedNodeIds: [...set] }) })
    },
    [expandedNodeIds, lockedSet, match, patchDraft, visualLayout],
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

  const deleteNodes = useCallback(
    (nodeIds: string[]) => {
      const ids = [
        ...new Set(
          nodeIds.filter(
            (id) =>
              id !== 'start' &&
              id !== 'end' &&
              id !== match.id &&
              !subtreeContainsLocked(match, id, lockedSet),
          ),
        ),
      ]
      if (ids.length === 0) return

      const idSet = new Set(ids)
      const nextPositions = { ...positions }
      const nextLabels = { ...nodeLabels }
      for (const id of ids) {
        delete nextPositions[id]
        delete nextLabels[id]
      }
      const nextEdges = canvasEdges.filter(
        (e) => !idSet.has(e.source) && !idSet.has(e.target),
      )
      let nextMatch = match
      for (const id of ids) {
        nextMatch = removeNode(nextMatch, id)
      }
      const nextLocked = lockedNodeIds.filter((id) => !idSet.has(id))
      const nextExpanded = expandedNodeIds.filter((id) => !idSet.has(id))
      patchDraft({
        match: nextMatch,
        visualLayout: visualLayout({
          positions: nextPositions,
          edges: nextEdges,
          labels: nextLabels,
          lockedNodeIds: nextLocked,
          expandedNodeIds: nextExpanded,
        }),
      })
      setSelectedId(null)
      setContextMenu(null)
    },
    [
      match,
      canvasEdges,
      positions,
      nodeLabels,
      lockedSet,
      lockedNodeIds,
      expandedNodeIds,
      patchDraft,
      visualLayout,
    ],
  )

  const deleteNode = useCallback(
    (nodeId: string) => {
      deleteNodes([nodeId])
    },
    [deleteNodes],
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

  const flash = useCallback((msg: string | null) => {
    setStatusMessage(msg)
    window.setTimeout(() => setStatusMessage(null), 2200)
  }, [])

  const cancelConnectPicker = useCallback(() => {
    setConnectFromId(null)
    setStatusMessage(null)
  }, [])

  const openNodeContextMenu = useCallback(
    (nodeId: string, x: number, y: number) => {
      setConnectFromId(null)
      const isEndpoint = nodeId === 'start' || nodeId === 'end'
      const isRoot = nodeId === match.id
      // Nested inside an AND/OR/N-of: canvas wires are hidden, so no Connect to.
      const nested =
        !isEndpoint && !isRoot && !isTopLevelMatchNode(match, nodeId) && findParentId(match, nodeId) !== null
      const canConnect = !nested && !isRoot
      const locked = lockedSet.has(nodeId) || subtreeContainsLocked(match, nodeId, lockedSet)
      setContextMenu({
        kind: 'node',
        nodeId,
        x,
        y,
        canRename: !isEndpoint && !isRoot,
        canDelete: !isEndpoint && !isRoot && !locked,
        canDuplicate: !isEndpoint && !isRoot,
        canOpenProperties: !isEndpoint,
        canConnect,
      })
    },
    [match, lockedSet],
  )

  const openEdgeContextMenu = useCallback((edgeId: string, x: number, y: number) => {
    setConnectFromId(null)
    setContextMenu({ kind: 'edge', edgeId, x, y })
  }, [])

  const enterConnectPicker = useCallback((nodeId: string) => {
    setContextMenu(null)
    setConnectFromId(nodeId)
    setSelectedId(nodeId)
    setSelectedEdgeId(null)
    setStatusMessage('Tap a node to connect · Esc cancels')
  }, [])

  const connectNodes = useCallback(
    (sourceId: string, targetId: string) => {
      if (
        !isValidCanvasConnection(
          { source: sourceId, target: targetId, sourceHandle: null, targetHandle: null },
          match,
          canvasEdges,
        )
      ) {
        return false
      }
      const edge = newCanvasEdge(sourceId, targetId)
      if (!canvasEdges.some((e) => e.id === edge.id)) {
        patchDraft({ visualLayout: visualLayout({ edges: [...canvasEdges, edge] }) })
      }
      setConnectFromId(null)
      setContextMenu(null)
      flash('Connected')
      return true
    },
    [match, canvasEdges, patchDraft, visualLayout, flash],
  )

  const handleCanvasSelect = useCallback(
    (id: string | null) => {
      if (connectFromId) {
        if (!id) {
          cancelConnectPicker()
          setSelectedId(null)
          return
        }
        if (id === connectFromId) {
          setSelectedId(id)
          return
        }
        if (!connectNodes(connectFromId, id)) {
          setStatusMessage("Can't connect to that node · tap another · Esc cancels")
        }
        setSelectedId(id)
        return
      }
      setSelectedId(id)
    },
    [connectFromId, connectNodes, cancelConnectPicker],
  )

  const duplicateNode = useCallback(
    (nodeId: string) => {
      if (nodeId === 'start' || nodeId === 'end' || nodeId === match.id) return
      const source = findInMatch(match, nodeId)
      if (!source) return
      const clone = cloneNodeWithNewIds(source)
      const parentId = findParentId(match, nodeId) ?? match.id
      const nextMatch =
        parentId === match.id
          ? { ...match, children: [...match.children, clone] }
          : addToGroup(match, parentId, clone)
      const origin = positions[nodeId]
      const nextPositions = {
        ...positions,
        [clone.id]: {
          x: (origin?.x ?? 80) + 40,
          y: (origin?.y ?? 80) + 40,
        },
      }
      const nextLabels = { ...nodeLabels }
      if (nodeLabels[nodeId]) nextLabels[clone.id] = `${nodeLabels[nodeId]} copy`
      patchDraft({
        match: nextMatch,
        visualLayout: visualLayout({
          positions: nextPositions,
          labels: nextLabels,
        }),
      })
      setSelectedId(clone.id)
      setContextMenu(null)
      flash('Duplicated')
    },
    [match, positions, nodeLabels, patchDraft, visualLayout, flash],
  )

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
        if (nestedOverlayOpen) return
        if (renameTargetId) {
          setRenameTargetId(null)
          return
        }
        if (connectFromId) {
          setConnectFromId(null)
          setStatusMessage(null)
          return
        }
        if (contextMenu) {
          setContextMenu(null)
          return
        }
        handleClose()
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId) {
        // Node multi-delete is handled by React Flow → onNodesDelete → deleteNodes.
        // Only edges go through this window handler (inspector still uses deleteSelected).
        if (editing) return
        e.preventDefault()
        deleteEdge(selectedEdgeId)
      }
    }
    window.addEventListener('keydown', onKey)
    const releaseBodyEditorOpen = retainBodyEditorOpen()
    return () => {
      window.removeEventListener('keydown', onKey)
      releaseBodyEditorOpen()
    }
  }, [
    handleClose,
    contextMenu,
    renameTargetId,
    selectedEdgeId,
    deleteEdge,
    undo,
    redo,
    saving,
    dirty,
    onSaveDraft,
    nestedOverlayOpen,
    connectFromId,
  ])

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
          expandedNodeIds: [...new Set([...expandedNodeIds, ref.id])],
        }),
      })
      setSelectedId(ref.id)
      return ref.id
    },
    [match, selectedId, positions, nodeSources, expandedNodeIds, patchDraft, visualLayout],
  )

  const insertLogicBlockIntoGroup = useCallback(
    (
      targetGroupId: string,
      pkg: LogicBlockPackage,
      versionPin: string,
      provenance: L2NodeProvenance,
    ) => {
      const ref = newLogicBlockRef({ id: pkg.id, version: versionPin, name: pkg.name })
      const nextMatch = addToGroup(match, targetGroupId, ref)
      setTestTrace(null)
      patchDraft({
        match: nextMatch,
        visualLayout: visualLayout({
          edges: resolveCanvasEdges(nextMatch, savedCanvasEdges),
          nodeSources: { ...nodeSources, [ref.id]: provenance },
          expandedNodeIds: [...new Set([...expandedNodeIds, ref.id])],
        }),
      })
      setSelectedId(ref.id)
    },
    [match, nodeSources, expandedNodeIds, patchDraft, visualLayout, savedCanvasEdges],
  )

  const useLogicBlockHere = useCallback(
    (groupId: string, pkg: LogicBlockPackage) => {
      const isRoot = match.id === groupId
      const refId = isRoot ? newId('logic') : groupId
      const ref = {
        type: 'logic_block_ref' as const,
        id: refId,
        packageId: pkg.id,
        versionPin: pkg.version,
        label: pkg.name,
        updatePolicy: 'auto_minor' as const,
      }
      const nextMatch: L2RuleGroup = isRoot
        ? { ...match, logic: 'any', minPass: undefined, children: [ref] }
        : updateInMatch(match, groupId, ref)
      setTestTrace(null)
      patchDraft({
        match: nextMatch,
        visualLayout: visualLayout({
          edges: resolveCanvasEdges(nextMatch, savedCanvasEdges),
          nodeSources: { ...nodeSources, [refId]: 'collection' },
          expandedNodeIds: [...new Set([...expandedNodeIds, refId])],
        }),
      })
      setSelectedId(refId)
    },
    [match, nodeSources, expandedNodeIds, patchDraft, visualLayout, savedCanvasEdges],
  )

  const addSourceNode = useCallback(
    (
      entry: import('./palette').PaletteSourceEntry,
      position?: { x: number; y: number },
    ) => {
      const nodeId = entry.sourceId
      // Add source node position to layout (source nodes live outside the match tree)
      const pos = position ?? { x: -380, y: 150 }
      const nextEdges = [
        ...canvasEdges,
        { id: `e-${nodeId}-end`, source: nodeId, target: 'end', branch: true },
      ]
      patchDraft({
        visualLayout: visualLayout({
          positions: { ...positions, [nodeId]: pos },
          edges: nextEdges,
        }),
      })
      setSelectedId(nodeId)
    },
    [canvasEdges, positions, patchDraft, visualLayout],
  )

  // On mobile the palette is a bottom sheet; close it once a node lands so
  // the user immediately sees the canvas result.
  const closeMobilePalette = useCallback(() => {
    if (!window.matchMedia('(max-width: 768px)').matches) return
    const r = railsRef.current
    if (r.paletteOpen) r.togglePalette()
  }, [])

  const handlePalettePick = (pick: PalettePick) => {
    if (pick.kind === 'native') {
      addPaletteNode(pick.item)
      closeMobilePalette()
      return
    }
    if (pick.kind === 'source') {
      addSourceNode(pick.entry)
      closeMobilePalette()
      return
    }
    addLogicBlockNode(pick.entry)
    closeMobilePalette()
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
        closeMobilePalette()
        return
      }

      if (pick.kind === 'source') {
        addSourceNode(pick.entry, flowPosition)
        closeMobilePalette()
        return
      }

      const groupId =
        dropGroupId ?? resolveAddTargetGroupId(match, selectedId, 'condition')
      addLogicBlockNode(pick.entry, { groupId, position: flowPosition })
      closeMobilePalette()
    },
    [addLogicBlockNode, addPaletteNode, closeMobilePalette, match, selectedId],
  )

  const onExtractNode = useCallback(
    (nodeId: string, flowPosition: { x: number; y: number }) => {
      if (lockedSet.has(nodeId)) {
        flash('Unlock node to move it out of the group')
        return
      }
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
    [match, positions, patchDraft, visualLayout, flash, lockedSet],
  )

  const overlay = (
    <VisualEditorNestContext.Provider value={nestContext}>
    <div
      className={`l2-visual-fullscreen${readOnly ? ' l2-visual-fullscreen--nested' : ''}${
        !readOnly && nestedOverlayOpen ? ' l2-visual-fullscreen--obscured' : ''
      }${connectFromId ? ' l2-visual-fullscreen--connect-pick' : ''}`}
      style={rails.gridStyle}
      role="dialog"
      aria-modal="true"
      aria-label={readOnly ? 'Logic block preview' : 'Visual rule editor'}
      aria-hidden={!readOnly && nestedOverlayOpen ? true : undefined}
    >
      <header className="l2-visual-toolbar">
        <div className="l2-visual-toolbar-left">
          <h2>{editorTitle ?? draft.name}</h2>
          <span className="l2-visual-toolbar-sub">{editorSubtitle}</span>
          {autosaveBadge(autosaveState, dirty)}
          {statusMessage ? <span className="l2-json-status">{statusMessage}</span> : null}
        </div>
        <div className="l2-visual-toolbar-actions">
          {!readOnly ? (
            <>
              {onUpdateLive ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={saving || updatingLive}
                  onClick={() => void handleUpdateLiveClick()}
                  title="Make draft rules live and rebuild the candidate list from the L1 pool"
                >
                  {updatingLive ? 'Updating…' : 'Update Live'}
                </button>
              ) : null}
              {hideSaveDraft && revertToLive ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
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
                  className="btn btn-secondary btn-sm"
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
                <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenJson}>
                  JSON Editor
                </button>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm l2-editor-close"
            onClick={handleClose}
            aria-label="Close editor"
            title="Close"
          >
            ×
          </button>
        </div>
      </header>

      {!readOnly ? (
      <aside className={`l2-visual-rail l2-visual-rail-left${rails.paletteOpen ? ' is-open' : ''}`}>
        {rails.paletteOpen ? (
          <>
            <MobileSheetHandle onClose={rails.togglePalette} />
            <RailPanelHead
              title="Palette"
              collapseSide="start"
              onCollapse={rails.togglePalette}
              collapseLabel="Collapse palette"
              sourceFile="L2NodePalette.tsx"
            />
            <L2NodePalette
              onPick={handlePalettePick}
              itemFilter={paletteItemFilter}
              nativeOnly={prefilterMode}
              feedSources={draft.sources?.native}
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
      ) : null}

      <p className="l2-visual-canvas-hint" aria-hidden="true">
        {canvasHint}
      </p>

      <main className="l2-visual-main">
        <ReactFlowProvider>
          <L2GraphCanvas
            readOnly={readOnly}
            match={match}
            positions={positions}
            feedSources={draft.sources?.native}
            canvasEdges={canvasEdges}
            selectedId={selectedId}
            selectedEdgeId={selectedEdgeId}
            testTrace={testTrace}
            onSelect={handleCanvasSelect}
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
            expandedNodeIds={expandedNodeIds}
            lockedNodeIds={lockedNodeIds}
            onToggleNodeExpanded={toggleNodeExpanded}
            onToggleNodeLocked={toggleNodeLocked}
            onCollapseAllInGroup={collapseAllInGroup}
            onExpandAllInGroup={expandAllInGroup}
            onNodeContextMenu={openNodeContextMenu}
            onEdgeContextMenu={openEdgeContextMenu}
            onNodeOpenProperties={openPropertiesForNode}
            onPatchParameterValues={(nodeId, values) => {
              const rule = findInMatch(match, nodeId)
              if (!rule || rule.type !== 'parameters') return
              const updated = updateInMatch(match, nodeId, { ...rule, values })
              patchMatch(syncSharedParamControlFromPanel(updated, nodeId))
            }}
            onPatchRuleNode={(nodeId, next) => {
              patchMatch(updateInMatch(match, nodeId, next))
            }}
            onDeleteNodes={deleteNodes}
            onReparent={(nodeId, targetGroupId) => {
              if (lockedSet.has(nodeId)) {
                flash('Unlock node to move it into a group')
                return
              }
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
          />
          <L2CanvasContextMenu
            menu={contextMenu}
            onClose={() => setContextMenu(null)}
            onRenameNode={renameNode}
            onDeleteNode={deleteNode}
            onDuplicateNode={duplicateNode}
            onOpenProperties={(nodeId) => {
              setContextMenu(null)
              openPropertiesForNode(nodeId)
            }}
            onDisconnectEdge={deleteEdge}
            onEnterConnectPicker={enterConnectPicker}
          />
          <L2NodeRenameDialog
            nodeId={renameTargetId}
            initialName={renameInitialName}
            onSave={applyNodeRename}
            onClose={() => setRenameTargetId(null)}
          />
        </ReactFlowProvider>
      </main>

      {!nestedOverlayOpen ? (
      <aside className={`l2-visual-rail l2-visual-rail-props${rails.propsOpen ? ' is-open' : ''}`}>
        {rails.propsOpen ? (
          <>
            <MobileSheetHandle onClose={rails.toggleProps} />
            {!readOnly ? (
              <RailResizeHandle
                label="Resize properties panel"
                onMouseDown={rails.startResizeProps}
              />
            ) : null}
            <RailPanelHead
              title="Properties"
              onCollapse={rails.toggleProps}
              collapseLabel="Collapse properties"
              sourceFile="L2NodeInspector.tsx"
              onHelp={() => setPropertiesHelpOpen(true)}
              helpLabel="About this node"
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
              onDeleteSelected={deleteSelected}
              selectedNodeLocked={
                Boolean(
                  selectedId &&
                    subtreeContainsLocked(match, selectedId, lockedSet),
                )
              }
              onRenameNode={renameNode}
              onDraftChange={onDraftChange}
              onPatchDraft={patchDraft}
              projectAuthorLists={projectAuthorLists}
              listCache={listCache}
              onRefreshList={onRefreshList}
              onListsChanged={onListsChanged}
              prefilterMode={prefilterMode}
              readOnly={readOnly}
              onOpenInnerLogicPreview={setInnerLogicPreview}
              onOpenLogicBlockCompare={setLogicBlockCompare}
              onUseLogicBlockHere={useLogicBlockHere}
              onInsertLogicBlock={insertLogicBlockIntoGroup}
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
      ) : null}

      {!readOnly && !nestedOverlayOpen ? (
      <aside className={`l2-visual-rail l2-visual-rail-preview${rails.previewOpen ? ' is-open' : ''}`}>
        {rails.previewOpen ? (
          <>
            <MobileSheetHandle onClose={rails.togglePreview} />
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
      ) : null}

      <div className="l2-visual-mobile-bar">
        {!readOnly ? (
          <button
            type="button"
            className={rails.paletteOpen ? 'active' : undefined}
            onClick={() => toggleMobileRail('palette')}
          >
            Nodes
          </button>
        ) : null}
        <button
          type="button"
          className={rails.propsOpen ? 'active' : undefined}
          onClick={() => toggleMobileRail('props')}
        >
          Properties
        </button>
        {!readOnly ? (
          <button
            type="button"
            className={rails.previewOpen ? 'active' : undefined}
            onClick={() => toggleMobileRail('preview')}
          >
            Matches
          </button>
        ) : null}
      </div>
    </div>
    {innerLogicPreview ? (
      <LogicBlockInnerPreview
        packageId={innerLogicPreview.packageId}
        versionPin={innerLogicPreview.versionPin}
        updatePolicy={innerLogicPreview.updatePolicy}
        title={innerLogicPreview.title}
        onClose={() => setInnerLogicPreview(null)}
      />
    ) : null}
    {logicBlockCompare ? (
      <LogicBlockVersionCompare
        packageId={logicBlockCompare.packageId}
        fromVersion={logicBlockCompare.fromVersion}
        toVersion={logicBlockCompare.toVersion}
        title={logicBlockCompare.title}
        onClose={() => setLogicBlockCompare(null)}
      />
    ) : null}
    <PropertiesHelpModal
      open={propertiesHelpOpen}
      onClose={() => setPropertiesHelpOpen(false)}
      context={{
        selected: selectedId ? findInMatch(match, selectedId) : null,
        selectedEdgeId,
        prefilterMode,
      }}
    />
    </VisualEditorNestContext.Provider>
  )

  return createPortal(overlay, document.body)
}
