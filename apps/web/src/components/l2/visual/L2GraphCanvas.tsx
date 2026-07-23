import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react'
import {
  Background,
  Controls,
  ConnectionLineType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnConnect,
  type OnNodeDrag,
} from '@xyflow/react'
import type { L2NodeTrace, L2RuleGroup } from '@cfb/core-types'
import { reorderMatchFromLayout } from '../../../lib/l2-form'
import type { EditorParamPreview } from '../../../lib/param-bind-preview'
import { graphNodeTypes, type GraphNodeData } from './graph-nodes'
import { graphEdgeTypes } from './graph-edges'
import { L2CanvasToolbar } from './L2CanvasToolbar'
import { NodeExpandProvider } from './node-expand-context'
import {
  PALETTE_DRAG_MIME,
  PALETTE_ITEM_BY_ID,
  PALETTE_LOGIC_BLOCK_MIME,
  parseLogicBlockDragData,
  type PalettePick,
} from './palette'
import {
  applyNestedLayoutPositions,
  applyTraceOutcomes,
  absoluteNodeBounds,
  absoluteNodePosition,
  canvasEdgesToRf,
  extractPositions,
  findGroupAtFlowPoint,
  findGroupDropTarget,
  flowGraphToRfNodes,
  isValidCanvasConnection,
  layoutNodesForReorder,
  matchStructureKey,
  namespaceRfEdgesForDom,
  namespaceRfNodesForDom,
  newCanvasEdge,
  resolveCanvasSelectionId,
  sanitizeFlowInstanceId,
  shouldRelockInOriginGroup,
  stripFlowDomId,
  updateRfNodeLabels,
  type CanvasEdge,
  type NodeLabels,
  type NodePositions,
  type NodeSources,
} from './graph-sync'

/** Re-fit after nodes measure — dual compare panes often mount before they have height. */
function FitViewWhenReady({ enabled }: { enabled: boolean }) {
  const { fitView } = useReactFlow()
  const ready = useNodesInitialized()
  useEffect(() => {
    if (!enabled || !ready) return
    const id = requestAnimationFrame(() => {
      void fitView({ padding: 0.15, duration: 0 })
    })
    return () => cancelAnimationFrame(id)
  }, [enabled, ready, fitView])
  return null
}

export type L2GraphCanvasHandle = {
  getPlacement: () => { x: number; y: number }
}

interface Props {
  match: L2RuleGroup
  positions: NodePositions
  nodeLabels?: NodeLabels
  nodeSources?: NodeSources
  expandedNodeIds?: string[]
  collapsedGroupFrameIds?: string[]
  lockedNodeIds?: string[]
  onToggleNodeExpanded?: (nodeId: string) => void
  onToggleNodeLocked?: (nodeId: string) => void
  onCollapseAllInGroup?: (groupId: string) => void
  onExpandAllInGroup?: (groupId: string) => void
  feedSources?: import('@cfb/core-types').NativeFeedSource[]
  canvasEdges: CanvasEdge[]
  selectedId: string | null
  selectedEdgeId: string | null
  testTrace?: L2NodeTrace[] | null
  onSelect: (id: string | null) => void
  onSelectEdge: (edgeId: string | null) => void
  onPositionsChange: (positions: NodePositions) => void
  onEdgesChange: (edges: CanvasEdge[]) => void
  onMatchReorder: (match: L2RuleGroup) => void
  onReparent: (nodeId: string, targetGroupId: string) => void
  onExtract: (nodeId: string, flowPosition: { x: number; y: number }) => void
  onPaletteDrop: (
    pick: PalettePick,
    flowPosition: { x: number; y: number },
    dropGroupId: string | null,
  ) => void
  onNodeContextMenu: (nodeId: string, x: number, y: number) => void
  onEdgeContextMenu: (edgeId: string, x: number, y: number) => void
  /** Double-click / double-tap on a node — open its properties panel. */
  onNodeOpenProperties?: (nodeId: string) => void
  /** Open Parameter control mode modal for a target node. */
  onOpenParamControlMode?: (nodeId: string) => void
  /** Persist Parameter Node live values from expanded canvas controls. */
  onPatchParameterValues?: (
    nodeId: string,
    values: Record<string, import('@cfb/core-types').L2ParamValue>,
  ) => void
  /** Persist condition edits from Properties-style expanded canvas forms. */
  onPatchRuleNode?: (nodeId: string, next: import('@cfb/core-types').L2RuleNode) => void
  /** Persist node removals from React Flow delete / multi-select. */
  onDeleteNodes?: (nodeIds: string[]) => void
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  onResetPanels?: () => void
  readOnly?: boolean
  liveParamValues?: Record<string, import('@cfb/core-types').L2ParamValue>
  editorParamPreview?: EditorParamPreview
  /**
   * Unique id when multiple canvases share a page (e.g. version compare).
   * Namespaces React Flow markers + edge DOM ids so both panes render wires.
   */
  instanceId?: string
}

function minimapNodeColor(node: Node<GraphNodeData>): string {
  if (node.id === 'start') return '#10b981'
  if (node.id === 'end') return '#f97316'
  if (node.type === 'groupFrame') {
    return node.data.groupLogic === 'any' ? '#f97316' : '#3b82f6'
  }
  return '#22c55e'
}

const CanvasBody = forwardRef<L2GraphCanvasHandle, Props>(function CanvasBody(
  {
    match,
    positions,
    nodeLabels = {},
    nodeSources = {},
    expandedNodeIds = [],
    collapsedGroupFrameIds = [],
    lockedNodeIds = [],
    onToggleNodeExpanded,
    onToggleNodeLocked,
    onCollapseAllInGroup,
    onExpandAllInGroup,
    feedSources,
    canvasEdges,
    selectedId,
    selectedEdgeId,
    testTrace,
    onSelect,
    onSelectEdge,
    onPositionsChange,
    onEdgesChange,
    onMatchReorder,
    onReparent,
    onExtract,
    onPaletteDrop,
    onNodeContextMenu,
    onEdgeContextMenu,
    onNodeOpenProperties,
    onOpenParamControlMode,
    onPatchParameterValues,
    onPatchRuleNode,
    onDeleteNodes,
    canUndo = false,
    canRedo = false,
    onUndo,
    onRedo,
    onResetPanels,
    readOnly = false,
    liveParamValues,
    editorParamPreview,
    instanceId,
  },
  ref,
) {
  const structureKey = matchStructureKey(match)
  const positionsRef = useRef(positions)
  positionsRef.current = positions
  const nodeLabelsRef = useRef(nodeLabels)
  nodeLabelsRef.current = nodeLabels
  const nodeSourcesRef = useRef(nodeSources)
  nodeSourcesRef.current = nodeSources
  const expandedNodeIdsRef = useRef(expandedNodeIds)
  expandedNodeIdsRef.current = expandedNodeIds
  const collapsedGroupFrameIdsRef = useRef(collapsedGroupFrameIds)
  collapsedGroupFrameIdsRef.current = collapsedGroupFrameIds
  const lockedNodeIdsRef = useRef(lockedNodeIds)
  lockedNodeIdsRef.current = lockedNodeIds
  const edgesRef = useRef(canvasEdges)
  edgesRef.current = canvasEdges
  const expandedKey = expandedNodeIds.join('\0')
  const collapsedGroupKey = collapsedGroupFrameIds.join('\0')
  const lockedKey = lockedNodeIds.join('\0')
  const [layoutTick, setLayoutTick] = useState(0)

  const paramPreviewOverrides = editorParamPreview?.overrides

  const expandApi = useMemo(
    () => ({
      toggleExpanded: (nodeId: string) => onToggleNodeExpanded?.(nodeId),
      collapseAllInGroup: (groupId: string) => onCollapseAllInGroup?.(groupId),
      expandAllInGroup: (groupId: string) => onExpandAllInGroup?.(groupId),
      toggleLocked: (nodeId: string) => onToggleNodeLocked?.(nodeId),
      openProperties: (nodeId: string) => onNodeOpenProperties?.(nodeId),
      openParamControlMode: (nodeId: string) => onOpenParamControlMode?.(nodeId),
      requestLayoutRefresh: () => setLayoutTick((n) => n + 1),
      patchParameterValues: onPatchParameterValues,
      patchRuleNode: onPatchRuleNode,
      match,
      liveParamValues,
      paramPreviewOverrides,
      productionParams: editorParamPreview?.productionParams,
      readOnly,
    }),
    [
      onToggleNodeExpanded,
      onCollapseAllInGroup,
      onExpandAllInGroup,
      onToggleNodeLocked,
      onNodeOpenProperties,
      onOpenParamControlMode,
      onPatchParameterValues,
      onPatchRuleNode,
      match,
      liveParamValues,
      paramPreviewOverrides,
      editorParamPreview?.productionParams,
      readOnly,
    ],
  )
  const { screenToFlowPosition, getIntersectingNodes, getNode, getNodes } = useReactFlow()

  useImperativeHandle(
    ref,
    () => ({
      getPlacement: () => {
        const el = document.querySelector('.l2-visual-canvas')
        if (!el) return { x: 240, y: 120 }
        const r = el.getBoundingClientRect()
        return screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
      },
    }),
    [screenToFlowPosition],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<GraphNodeData>>([])
  const [edges, setEdges, onRfEdgesChange] = useEdgesState<Edge>([])

  const lockNodesForReadOnly = useCallback(
    (list: Node<GraphNodeData>[]): Node<GraphNodeData>[] => {
      if (!readOnly) return list
      // Per-node `draggable: true` from graph-sync overrides ReactFlow's nodesDraggable={false}.
      return list.map((n) => ({
        ...n,
        draggable: false,
        connectable: false,
        deletable: false,
      }))
    },
    [readOnly],
  )

  useEffect(() => {
    setNodes(
      lockNodesForReadOnly(
        flowGraphToRfNodes(
          match,
          selectedId,
          positionsRef.current,
          nodeLabelsRef.current,
          nodeSourcesRef.current,
          feedSources,
          expandedNodeIdsRef.current,
          lockedNodeIdsRef.current,
          paramPreviewOverrides,
          collapsedGroupFrameIdsRef.current,
        ),
      ),
    )
    setEdges(canvasEdgesToRf(canvasEdges, selectedEdgeId))
  }, [structureKey, match, selectedEdgeId, canvasEdges, expandedKey, collapsedGroupKey, lockedKey, feedSources, layoutTick, paramPreviewOverrides, lockNodesForReadOnly, setNodes, setEdges])

  useEffect(() => {
    setNodes((nds) =>
      lockNodesForReadOnly(
        applyTraceOutcomes(
          updateRfNodeLabels(
            nds,
            match,
            selectedId,
            nodeLabelsRef.current,
            nodeSourcesRef.current,
            expandedNodeIdsRef.current,
            lockedNodeIdsRef.current,
            paramPreviewOverrides,
            collapsedGroupFrameIdsRef.current,
          ),
          testTrace,
        ),
      ),
    )
  }, [match, selectedId, testTrace, nodeLabels, nodeSources, expandedKey, collapsedGroupKey, lockedKey, layoutTick, paramPreviewOverrides, lockNodesForReadOnly, setNodes])

  useEffect(() => {
    setEdges(canvasEdgesToRf(canvasEdges, selectedEdgeId))
  }, [canvasEdges, selectedEdgeId, setEdges])

  const flowDomId = useMemo(
    () => (instanceId ? sanitizeFlowInstanceId(instanceId) : undefined),
    [instanceId],
  )
  const displayNodes = useMemo(
    () => namespaceRfNodesForDom(nodes, flowDomId),
    [nodes, flowDomId],
  )
  const displayEdges = useMemo(
    () => namespaceRfEdgesForDom(edges, flowDomId),
    [edges, flowDomId],
  )
  const setDropHighlight = useCallback(
    (targetId: string | null) => {
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: { ...n.data, dropTarget: n.type === 'groupFrame' && n.id === targetId },
        })),
      )
    },
    [setNodes],
  )

  const onNodeDrag: OnNodeDrag<Node<GraphNodeData>> = useCallback(
    (_event, node) => {
      const nds = getNodes() as Node<GraphNodeData>[]
      const hits = getIntersectingNodes(node) as Node<GraphNodeData>[]
      setDropHighlight(findGroupDropTarget(node, hits, match, nds))
    },
    [getIntersectingNodes, getNodes, match, setDropHighlight],
  )

  const applyDragStopLayout = useCallback(
    (draggedNodes: Node<GraphNodeData>[]) => {
      const merged = getNodes() as Node<GraphNodeData>[]
      const withDragged = merged.map((n) => {
        const dragged = draggedNodes.find((d) => d.id === n.id)
        return dragged ? { ...n, position: dragged.position } : n
      })
      const reordered = reorderMatchFromLayout(match, layoutNodesForReorder(withDragged))
      const layoutMatch = reordered !== match ? reordered : match
      const laidOut = applyNestedLayoutPositions(
        withDragged,
        layoutMatch,
        expandedNodeIdsRef.current,
        collapsedGroupFrameIdsRef.current,
      )
      if (laidOut !== withDragged) setNodes(laidOut)
      onPositionsChange(extractPositions(laidOut))
      if (reordered !== match) onMatchReorder(reordered)
    },
    [getNodes, match, onMatchReorder, onPositionsChange, setNodes],
  )

  const onNodeDragStop: OnNodeDrag<Node<GraphNodeData>> = useCallback(
    (_event, node, draggedNodes) => {
      setDropHighlight(null)

      const nds = getNodes() as Node<GraphNodeData>[]
      const finalNode: Node<GraphNodeData> = {
        ...node,
        position: draggedNodes.find((d) => d.id === node.id)?.position ?? node.position,
      }
      const nodeById = new Map(
        nds.map((n) => [n.id, n.id === finalNode.id ? finalNode : n]),
      )
      const hits = getIntersectingNodes(finalNode) as Node<GraphNodeData>[]
      const targetId = findGroupDropTarget(finalNode, hits, match, [...nodeById.values()])

      // Nested: stay parented during drag. Reorder if still inside this group;
      // only reparent/extract once the center leaves the group frame.
      if (finalNode.parentId) {
        const parent = nodeById.get(finalNode.parentId)
        if (parent) {
          const parentBounds = absoluteNodeBounds(parent, nodeById)
          // Prefer overlap over center-point so reordering near the frame edge
          // doesn't count as "left the group" and promote to the parent.
          const stillInParent = shouldRelockInOriginGroup(finalNode, parentBounds, nodeById)

          if (stillInParent) {
            // findGroupDropTarget only allows descendant groups while parented
            if (targetId) {
              onReparent(finalNode.id, targetId)
              return
            }
            applyDragStopLayout(draggedNodes)
            return
          }

          if (targetId) {
            onReparent(finalNode.id, targetId)
            return
          }
          onExtract(finalNode.id, absoluteNodePosition(finalNode, nodeById))
          return
        }
      }

      if (targetId) {
        onReparent(finalNode.id, targetId)
        return
      }
      applyDragStopLayout(draggedNodes)
    },
    [
      applyDragStopLayout,
      getIntersectingNodes,
      getNodes,
      match,
      onExtract,
      onReparent,
      setDropHighlight,
    ],
  )

  useEffect(() => {
    const el = document.querySelector('.l2-visual-canvas')
    if (!el) return

    const onDragOver = (e: Event) => {
      const de = e as DragEvent
      const types = de.dataTransfer?.types ?? []
      if (!types.includes(PALETTE_DRAG_MIME) && !types.includes(PALETTE_LOGIC_BLOCK_MIME)) return
      de.preventDefault()
      if (de.dataTransfer) de.dataTransfer.dropEffect = 'copy'
      el.classList.add('l2-canvas-palette-drag-over')
    }
    const onDragLeave = (e: Event) => {
      if (e.target === el) el.classList.remove('l2-canvas-palette-drag-over')
    }
    const onDrop = (e: Event) => {
      const de = e as DragEvent
      el.classList.remove('l2-canvas-palette-drag-over')
      de.preventDefault()
      const flowPosition = screenToFlowPosition({ x: de.clientX, y: de.clientY })
      const dropGroupId = findGroupAtFlowPoint(
        flowPosition,
        getNodes() as Node<GraphNodeData>[],
        match,
      )

      let pick: PalettePick | null = null
      if (de.dataTransfer?.types.includes(PALETTE_LOGIC_BLOCK_MIME)) {
        const raw = de.dataTransfer.getData(PALETTE_LOGIC_BLOCK_MIME)
        const entry = parseLogicBlockDragData(raw)
        if (entry) pick = { kind: 'logic_block', entry }
      } else {
        const itemId = de.dataTransfer?.getData(PALETTE_DRAG_MIME)
        const item = itemId ? PALETTE_ITEM_BY_ID[itemId] : undefined
        if (item) pick = { kind: 'native', item }
      }
      if (!pick) return
      onPaletteDrop(pick, flowPosition, dropGroupId)
    }

    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)

    // Touch drag from the palette (mobile bottom sheet). The palette
    // dispatches these because HTML5 drag events never fire on touch.
    const onTouchDrag = (e: Event) => {
      const { phase } = (e as CustomEvent<{ phase: 'start' | 'end' }>).detail
      el.classList.toggle('l2-canvas-palette-drag-over', phase === 'start')
    }
    const onTouchDrop = (e: Event) => {
      const { pick, clientX, clientY } = (
        e as CustomEvent<{ pick: PalettePick; clientX: number; clientY: number }>
      ).detail
      const rect = el.getBoundingClientRect()
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return
      }
      // The palette sheet overlaps the canvas rect on mobile — releasing
      // over the sheet itself is not a drop.
      if (document.elementFromPoint(clientX, clientY)?.closest('.l2-visual-rail')) return
      const flowPosition = screenToFlowPosition({ x: clientX, y: clientY })
      const dropGroupId = findGroupAtFlowPoint(
        flowPosition,
        getNodes() as Node<GraphNodeData>[],
        match,
      )
      onPaletteDrop(pick, flowPosition, dropGroupId)
    }
    window.addEventListener('cfb:palette-touch-drag', onTouchDrag)
    window.addEventListener('cfb:palette-touch-drop', onTouchDrop)

    return () => {
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
      window.removeEventListener('cfb:palette-touch-drag', onTouchDrag)
      window.removeEventListener('cfb:palette-touch-drop', onTouchDrop)
      el.classList.remove('l2-canvas-palette-drag-over')
    }
  }, [getNodes, match, onPaletteDrop, screenToFlowPosition])

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!isValidCanvasConnection(connection, match, edgesRef.current)) return
      const { source, target } = connection
      if (!source || !target) return
      const edge = newCanvasEdge(source, target)
      const next = [...edgesRef.current]
      if (!next.some((e) => e.id === edge.id)) next.push(edge)
      onEdgesChange(next)
    },
    [match, onEdgesChange],
  )

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      // Strip multi-canvas DOM prefixes before touching local (logical) ids.
      const unprefixed = changes.map((c) =>
        'id' in c && typeof c.id === 'string'
          ? { ...c, id: stripFlowDomId(c.id, flowDomId) }
          : c,
      )
      // Never let React Flow drop START/FEED from local state.
      let filtered = unprefixed.filter(
        (c) => !(c.type === 'remove' && (c.id === 'start' || c.id === 'end')),
      )
      // Read-only previews/compares: pan/zoom only — allow selection highlight,
      // ignore drag/resize/remove/structure mutations from React Flow.
      if (readOnly) {
        filtered = filtered.filter((c) => c.type === 'select')
      }
      if (filtered.length > 0) onNodesChange(filtered)
    },
    [onNodesChange, readOnly, flowDomId],
  )

  const handleNodesDelete = useCallback(
    (deleted: Node<GraphNodeData>[]) => {
      if (!onDeleteNodes || readOnly) return
      const ids = deleted
        .map((n) => stripFlowDomId(n.id, flowDomId))
        .filter((id) => id !== 'start' && id !== 'end')
      if (ids.length > 0) onDeleteNodes(ids)
    },
    [onDeleteNodes, readOnly, flowDomId],
  )

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onRfEdgesChange>[0]) => {
      const unprefixed = changes.map((c) =>
        'id' in c && typeof c.id === 'string'
          ? { ...c, id: stripFlowDomId(c.id, flowDomId) }
          : c,
      )
      if (readOnly) {
        const selectOnly = unprefixed.filter((c) => c.type === 'select')
        if (selectOnly.length > 0) onRfEdgesChange(selectOnly)
        return
      }
      onRfEdgesChange(unprefixed)
      let next = [...edgesRef.current]
      for (const c of unprefixed) {
        if (c.type === 'remove') {
          next = next.filter((e) => e.id !== c.id)
        } else if (c.type === 'add' && 'item' in c && c.item) {
          const item = c.item
          const source = stripFlowDomId(item.source, flowDomId)
          const target = stripFlowDomId(item.target, flowDomId)
          const id = stripFlowDomId(item.id, flowDomId)
          if (!next.some((e) => e.id === id)) {
            next.push({
              id,
              source,
              target,
              branch: true,
            })
          }
        } else if (c.type === 'replace' && 'item' in c && c.item) {
          next = next.map((e) =>
            e.id === c.id
              ? {
                  ...e,
                  source: stripFlowDomId(c.item.source, flowDomId),
                  target: stripFlowDomId(c.item.target, flowDomId),
                }
              : e,
          )
        }
      }
      const removed = unprefixed.some((c) => c.type === 'remove')
      const added = unprefixed.some((c) => c.type === 'add' || c.type === 'replace')
      if (removed || added) onEdgesChange(next)
    },
    [onEdgesChange, onRfEdgesChange, readOnly, flowDomId],
  )

  return (
    <NodeExpandProvider value={expandApi}>
      <ReactFlow
        id={flowDomId}
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={graphNodeTypes}
        edgeTypes={graphEdgeTypes}
        onNodesChange={handleNodesChange}
        onNodesDelete={readOnly ? undefined : handleNodesDelete}
        onEdgesChange={handleEdgesChange}
        noDragClassName="nodrag"
        noPanClassName="nopan"
        onNodeClick={(_, node) => {
          onSelectEdge(null)
          onSelect(
            resolveCanvasSelectionId(stripFlowDomId(node.id, flowDomId), node.data),
          )
        }}
        onNodeDoubleClick={(_, node) => {
          if (readOnly && !onNodeOpenProperties) return
          if (!onNodeOpenProperties) return
          onSelectEdge(null)
          onNodeOpenProperties(
            resolveCanvasSelectionId(stripFlowDomId(node.id, flowDomId), node.data),
          )
        }}
        onNodeContextMenu={
          readOnly
            ? (event) => {
                event.preventDefault()
              }
            : (event, node) => {
                event.preventDefault()
                onSelectEdge(null)
                const resolvedId = resolveCanvasSelectionId(
                  stripFlowDomId(node.id, flowDomId),
                  node.data,
                )
                onSelect(resolvedId)
                onNodeContextMenu(resolvedId, event.clientX, event.clientY)
              }
        }
        onEdgeClick={(_, edge) => {
          onSelect(null)
          onSelectEdge(stripFlowDomId(edge.id, flowDomId))
        }}
        onEdgeContextMenu={
          readOnly
            ? (event) => {
                event.preventDefault()
              }
            : (event, edge) => {
                event.preventDefault()
                onSelect(null)
                const edgeId = stripFlowDomId(edge.id, flowDomId)
                onSelectEdge(edgeId)
                onEdgeContextMenu(edgeId, event.clientX, event.clientY)
              }
        }
        onPaneClick={() => {
          onSelect(null)
          onSelectEdge(null)
        }}
        onNodeDrag={readOnly ? undefined : onNodeDrag}
        onNodeDragStop={readOnly ? undefined : onNodeDragStop}
        onConnect={readOnly ? undefined : onConnect}
        connectionLineType={ConnectionLineType.SmoothStep}
        isValidConnection={
          readOnly ? undefined : (c) => isValidCanvasConnection(c as Connection, match, edgesRef.current)
        }
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable
        nodesFocusable={!readOnly}
        edgesFocusable={!readOnly}
        edgesReconnectable={false}
        deleteKeyCode={readOnly ? null : ['Delete', 'Backspace']}
        selectionOnDrag={false}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.15 }}
        panOnDrag
        panOnScroll
        zoomOnScroll
        zoomOnDoubleClick={!readOnly}
        minZoom={0.1}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        className={readOnly ? 'l2-visual-flow--readonly' : undefined}
      >
        <FitViewWhenReady enabled={Boolean(readOnly || flowDomId)} />
        <Background gap={20} size={1} color="var(--l2-grid)" />
        {onUndo && onRedo ? (
          <L2CanvasToolbar
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
            onResetPanels={onResetPanels}
          />
        ) : null}
        <Controls showInteractive={false} position="bottom-left" className="l2-visual-controls" />
        <MiniMap
          pannable
          zoomable
          nodeStrokeWidth={2}
          position="bottom-right"
          className="l2-visual-minimap"
          nodeColor={minimapNodeColor}
          maskColor="color-mix(in srgb, var(--bg) 35%, transparent)"
          bgColor="var(--bg-card)"
        />
      </ReactFlow>
    </NodeExpandProvider>
  )
})

export const L2GraphCanvas = forwardRef<L2GraphCanvasHandle, Props>(function L2GraphCanvas(
  props,
  ref,
) {
  return (
    <div className={`l2-visual-canvas${props.readOnly ? ' l2-visual-canvas--readonly' : ''}`}>
      <CanvasBody ref={ref} {...props} />
    </div>
  )
})
