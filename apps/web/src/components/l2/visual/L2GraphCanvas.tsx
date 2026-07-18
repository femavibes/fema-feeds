import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import {
  Background,
  Controls,
  ConnectionLineType,
  MiniMap,
  ReactFlow,
  useEdgesState,
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
import { graphNodeTypes, type GraphNodeData } from './graph-nodes'
import { graphEdgeTypes } from './graph-edges'
import { L2CanvasToolbar } from './L2CanvasToolbar'
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
  newCanvasEdge,
  resolveCanvasSelectionId,
  shouldRelockInOriginGroup,
  updateRfNodeLabels,
  type CanvasEdge,
  type NodeLabels,
  type NodePositions,
  type NodeSources,
} from './graph-sync'

export type L2GraphCanvasHandle = {
  getPlacement: () => { x: number; y: number }
}

interface Props {
  match: L2RuleGroup
  positions: NodePositions
  nodeLabels?: NodeLabels
  nodeSources?: NodeSources
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
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  onResetPanels?: () => void
  readOnly?: boolean
}

function minimapNodeColor(node: Node<GraphNodeData>): string {
  if (node.id === 'start' || node.id === 'end') return '#5b8def'
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
    canUndo = false,
    canRedo = false,
    onUndo,
    onRedo,
    onResetPanels,
    readOnly = false,
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
  const edgesRef = useRef(canvasEdges)
  edgesRef.current = canvasEdges
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

  useEffect(() => {
    setNodes(
      flowGraphToRfNodes(
        match,
        selectedId,
        positionsRef.current,
        nodeLabelsRef.current,
        nodeSourcesRef.current,
        feedSources,
      ),
    )
    setEdges(canvasEdgesToRf(canvasEdges, selectedEdgeId))
  }, [structureKey, match, selectedEdgeId, canvasEdges, setNodes, setEdges])

  useEffect(() => {
    setNodes((nds) =>
      applyTraceOutcomes(
        updateRfNodeLabels(
          nds,
          match,
          selectedId,
          nodeLabelsRef.current,
          nodeSourcesRef.current,
        ),
        testTrace,
      ),
    )
  }, [match, selectedId, testTrace, nodeLabels, nodeSources, setNodes])

  useEffect(() => {
    setEdges(canvasEdgesToRf(canvasEdges, selectedEdgeId))
  }, [canvasEdges, selectedEdgeId, setEdges])

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
      const laidOut = applyNestedLayoutPositions(withDragged, layoutMatch)
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

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onRfEdgesChange>[0]) => {
      onRfEdgesChange(changes)
      let next = [...edgesRef.current]
      for (const c of changes) {
        if (c.type === 'remove') {
          next = next.filter((e) => e.id !== c.id)
        } else if (c.type === 'add' && 'item' in c && c.item) {
          const item = c.item
          if (!next.some((e) => e.id === item.id)) {
            next.push({
              id: item.id,
              source: item.source,
              target: item.target,
              branch: true,
            })
          }
        } else if (c.type === 'replace' && 'item' in c && c.item) {
          next = next.map((e) =>
            e.id === c.id
              ? { ...e, source: c.item.source, target: c.item.target }
              : e,
          )
        }
      }
      const removed = changes.some((c) => c.type === 'remove')
      const added = changes.some((c) => c.type === 'add' || c.type === 'replace')
      if (removed || added) onEdgesChange(next)
    },
    [onEdgesChange, onRfEdgesChange],
  )

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={graphNodeTypes}
        edgeTypes={graphEdgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={handleEdgesChange}
        noDragClassName="nodrag"
        noPanClassName="nopan"
        onNodeClick={(_, node) => {
          onSelectEdge(null)
          onSelect(resolveCanvasSelectionId(node.id, node.data))
        }}
        onNodeDoubleClick={(_, node) => {
          if (!onNodeOpenProperties) return
          onSelectEdge(null)
          onNodeOpenProperties(resolveCanvasSelectionId(node.id, node.data))
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault()
          onSelectEdge(null)
          const resolvedId = resolveCanvasSelectionId(node.id, node.data)
          onSelect(resolvedId)
          onNodeContextMenu(resolvedId, event.clientX, event.clientY)
        }}
        onEdgeClick={(_, edge) => {
          onSelect(null)
          onSelectEdge(edge.id)
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault()
          onSelect(null)
          onSelectEdge(edge.id)
          onEdgeContextMenu(edge.id, event.clientX, event.clientY)
        }}
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
        edgesReconnectable={false}
        deleteKeyCode={readOnly ? null : ['Delete', 'Backspace']}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.15 }}
        panOnDrag
        panOnScroll
        zoomOnScroll
        minZoom={0.1}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
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
    </>
  )
})

export const L2GraphCanvas = forwardRef<L2GraphCanvasHandle, Props>(function L2GraphCanvas(
  props,
  ref,
) {
  return (
    <div className="l2-visual-canvas">
      <CanvasBody ref={ref} {...props} />
    </div>
  )
})
