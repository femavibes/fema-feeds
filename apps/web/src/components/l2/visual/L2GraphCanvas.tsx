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
import { NodeExtractContext } from './node-extract-context'
import {
  PALETTE_DRAG_MIME,
  PALETTE_ITEM_BY_ID,
  PALETTE_LOGIC_BLOCK_MIME,
  parseLogicBlockDragData,
  type PalettePick,
} from './palette'
import {
  applyTraceOutcomes,
  absoluteNodeBounds,
  absoluteNodePosition,
  canvasEdgesToRf,
  extractPositions,
  findExtractDropHighlight,
  findGroupAtFlowPoint,
  findGroupDropTarget,
  flowGraphToRfNodes,
  isValidCanvasConnection,
  layoutNodesForReorder,
  matchStructureKey,
  newCanvasEdge,
  relockNodeInParent,
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
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  onResetPanels?: () => void
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
    canUndo = false,
    canRedo = false,
    onUndo,
    onRedo,
    onResetPanels,
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
  const customExtractRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const extractSessionRef = useRef<{ nodeId: string; originParentId: string } | null>(null)

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

  const liftNodeForExtract = useCallback(
    (node: Node<GraphNodeData>) => {
      if (!node.parentId) return node
      const nodeById = new Map(getNodes().map((n) => [n.id, n as Node<GraphNodeData>]))
      const abs = absoluteNodePosition(node, nodeById)
      return {
        ...node,
        parentId: undefined,
        extent: undefined,
        position: abs,
        data: {
          ...node.data,
          extracting: true,
          extractOriginParentId: node.parentId,
        },
      }
    },
    [getNodes],
  )

  const revertExtractDrag = useCallback(
    (node: Node<GraphNodeData>, originParentId: string) => {
      const nodeById = new Map(getNodes().map((n) => [n.id, n as Node<GraphNodeData>]))
      return relockNodeInParent(node, originParentId, nodeById)
    },
    [getNodes],
  )

  const persistRelockedNodes = useCallback(
    (updatedNodes: Node<GraphNodeData>[]) => {
      onPositionsChange(extractPositions(updatedNodes))
      const reordered = reorderMatchFromLayout(match, layoutNodesForReorder(updatedNodes))
      if (reordered !== match) onMatchReorder(reordered)
    },
    [match, onMatchReorder, onPositionsChange],
  )

  const clearExtractState = useCallback(
    (nds: Node<GraphNodeData>[]) =>
      nds.map((n) =>
        n.data.extracting
          ? {
              ...n,
              data: {
                ...n.data,
                extracting: false,
                extractOriginParentId: undefined,
              },
            }
          : n,
      ),
    [],
  )

  const finishExtractDrag = useCallback(
    (nodeId: string) => {
      const session = extractSessionRef.current
      if (!session || session.nodeId !== nodeId) return false

      const nds = getNodes() as Node<GraphNodeData>[]
      const node = nds.find((n) => n.id === nodeId)
      if (!node) return false

      const originParentId = session.originParentId
      const nodeById = new Map(nds.map((n) => [n.id, n]))
      const origin = nodeById.get(originParentId)
      if (!origin) return false

      const originBounds = absoluteNodeBounds(origin, nodeById)
      const hits = getIntersectingNodes(node) as Node<GraphNodeData>[]
      const dropTarget = findGroupDropTarget(node, hits, match)

      setDropHighlight(null)
      extractSessionRef.current = null

      if (dropTarget && dropTarget !== originParentId) {
        setNodes(clearExtractState(nds))
        onReparent(nodeId, dropTarget)
        return true
      }

      if (shouldRelockInOriginGroup(node, originBounds, nodeById)) {
        const relocked = revertExtractDrag(node, originParentId)
        const updatedNodes = clearExtractState(nds).map((n) =>
          n.id === nodeId ? relocked : n,
        ) as Node<GraphNodeData>[]
        setNodes(updatedNodes)
        persistRelockedNodes(updatedNodes)
        return true
      }

      setNodes(clearExtractState(nds))
      onExtract(nodeId, absoluteNodePosition(node, nodeById))
      return true
    },
    [
      clearExtractState,
      getIntersectingNodes,
      getNodes,
      match,
      onExtract,
      onReparent,
      persistRelockedNodes,
      revertExtractDrag,
      setDropHighlight,
      setNodes,
    ],
  )

  const startExtractDrag = useCallback(
    (nodeId: string, event: { clientX: number; clientY: number }) => {
      const node = getNode(nodeId) as Node<GraphNodeData> | undefined
      if (!node?.parentId) return

      customExtractRef.current = true
      extractSessionRef.current = { nodeId, originParentId: node.parentId }

      const lifted = liftNodeForExtract(node)
      const flow = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      dragOffsetRef.current = {
        x: flow.x - lifted.position.x,
        y: flow.y - lifted.position.y,
      }

      setNodes((nds) => nds.map((n) => (n.id === nodeId ? lifted : n)))

      const move = (e: PointerEvent) => {
        const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  position: {
                    x: flowPos.x - dragOffsetRef.current.x,
                    y: flowPos.y - dragOffsetRef.current.y,
                  },
                  data: {
                    ...n.data,
                    extracting: true,
                    extractOriginParentId: extractSessionRef.current?.originParentId,
                  },
                }
              : n,
          ),
        )
        const current = getNode(nodeId) as Node<GraphNodeData> | undefined
        if (current) {
          const hits = getIntersectingNodes(current) as Node<GraphNodeData>[]
          setDropHighlight(
            findExtractDropHighlight(
              current,
              hits,
              match,
              extractSessionRef.current?.originParentId ?? null,
            ),
          )
        }
      }

      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        customExtractRef.current = false
        finishExtractDrag(nodeId)
      }

      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    [
      finishExtractDrag,
      getIntersectingNodes,
      getNode,
      liftNodeForExtract,
      match,
      screenToFlowPosition,
      setDropHighlight,
      setNodes,
    ],
  )

  const onNodeDrag: OnNodeDrag<Node<GraphNodeData>> = useCallback(
    (_event, node) => {
      const hits = getIntersectingNodes(node) as Node<GraphNodeData>[]
      const targetId = findGroupDropTarget(node, hits, match)
      setDropHighlight(targetId)
    },
    [getIntersectingNodes, match, setDropHighlight],
  )

  const applyDragStopLayout = useCallback(
    (draggedNodes: Node<GraphNodeData>[]) => {
      const merged = getNodes() as Node<GraphNodeData>[]
      const withDragged = merged.map((n) => {
        const dragged = draggedNodes.find((d) => d.id === n.id)
        return dragged ? { ...n, position: dragged.position } : n
      })
      const reordered = reorderMatchFromLayout(match, layoutNodesForReorder(withDragged))
      if (reordered !== match) onMatchReorder(reordered)
      onPositionsChange(extractPositions(withDragged))
    },
    [getNodes, match, onMatchReorder, onPositionsChange],
  )

  const onNodeDragStop: OnNodeDrag<Node<GraphNodeData>> = useCallback(
    (_event, node, draggedNodes) => {
      if (customExtractRef.current) return

      setDropHighlight(null)

      const hits = getIntersectingNodes(node) as Node<GraphNodeData>[]
      const targetId = findGroupDropTarget(node, hits, match)
      if (targetId) {
        onReparent(node.id, targetId)
        return
      }

      applyDragStopLayout(draggedNodes)
    },
    [applyDragStopLayout, getIntersectingNodes, match, onReparent, setDropHighlight],
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
    return () => {
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
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
    <NodeExtractContext.Provider value={startExtractDrag}>
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
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        connectionLineType={ConnectionLineType.SmoothStep}
        isValidConnection={(c) => isValidCanvasConnection(c as Connection, match, edgesRef.current)}
        nodesDraggable
        nodesConnectable
        edgesReconnectable={false}
        deleteKeyCode={['Delete', 'Backspace']}
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
    </NodeExtractContext.Provider>
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
