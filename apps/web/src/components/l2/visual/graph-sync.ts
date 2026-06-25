import type { Connection, Edge, Node } from '@xyflow/react'
import type { L2GroupLogic, L2NodeProvenance, L2NodeTrace, L2RuleGroup, L2RuleNode } from '@cfb/core-types'
import {
  layoutMatchFlow,
  conditionNodeTitle,
  groupNodeTitle,
  edgesWouldCycle,
  isAllowedCanvasEdge,
  normalizeRuleGroup,
  sanitizeCanvasEdges,
  snapNestedConditionPosition,
} from '@cfb/l2-graph'
import { findInMatch, canDropIntoGroup } from '../../../lib/l2-form'
import type { GraphNodeData } from './graph-nodes'
import { FLOW_EDGE_INTERACTION_WIDTH } from './graph-edges'

export type NodePositions = Record<string, { x: number; y: number }>
export type NodeLabels = Record<string, string>
export type NodeSources = Record<string, L2NodeProvenance>
export type CanvasEdge = { id: string; source: string; target: string; branch?: boolean }

export function matchStructureKey(match: L2RuleGroup): string {
  const root = normalizeRuleGroup(match)
  const walk = (n: L2RuleNode): string => {
    if (n.type === 'group') {
      return `g:${n.id}:${n.logic}[${(n.children ?? []).map(walk).join(',')}]`
    }
    return `c:${n.id}:${n.type}`
  }
  return walk(root)
}

export function defaultCanvasEdges(match: L2RuleGroup): CanvasEdge[] {
  return layoutMatchFlow(match).edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    branch: e.branch,
  }))
}

function nestedConditionSlotIndex(match: L2RuleGroup, nodeId: string, parentId: string): number {
  const parent = findInMatch(match, parentId)
  if (!parent || parent.type !== 'group') return 0
  const siblings = parent.children.filter((c) => c.type !== 'group')
  const index = siblings.findIndex((c) => c.id === nodeId)
  return index >= 0 ? index : 0
}

function resolveNodePosition(
  match: L2RuleGroup,
  box: { id: string; x: number; y: number; parentId?: string; kind: string },
  positions: NodePositions,
): { x: number; y: number } {
  if (box.parentId && box.kind === 'condition') {
    const index = nestedConditionSlotIndex(match, box.id, box.parentId)
    return snapNestedConditionPosition({ x: box.x, y: box.y }, index)
  }
  return positions[box.id] ?? { x: box.x, y: box.y }
}

export function flowGraphToRfNodes(
  match: L2RuleGroup,
  selectedId: string | null,
  positions: NodePositions,
  nodeLabels: NodeLabels = {},
  nodeSources: NodeSources = {},
): Node<GraphNodeData>[] {
  const layout = layoutMatchFlow(normalizeRuleGroup(match))

  return layout.nodes.map((box) => {
    const nested = Boolean(box.parentId)
    const isTopLevel = Boolean(box.topLevel)
    const groupId = box.groupId ?? (box.kind === 'group-frame' ? box.id : undefined)
    const selected =
      box.id === selectedId ||
      groupId === selectedId ||
      (box.kind === 'condition' && box.id === selectedId)

    const showPorts =
      box.kind === 'start' ||
      box.kind === 'end' ||
      isTopLevel
    const draggableFrame = box.kind === 'group-frame'

    const position = resolveNodePosition(match, box, positions)

    const base = {
      id: box.id,
      position,
      parentId: box.parentId,
      extent: nested ? ('parent' as const) : undefined,
      data: {
        label: box.label,
        subtitle: box.subtitle,
        logic: box.logic?.toUpperCase(),
        nodeId: groupId ?? box.id,
        selected,
        isRoot: false,
        groupLogic: box.logic,
        showPorts,
        nested,
        topLevel: isTopLevel,
        draggableFrame,
        canExtract: nested,
      },
      draggable: true,
      connectable: showPorts,
      selectable: true,
      selected,
      zIndex:
        selected && isTopLevel
          ? 10
          : selected && box.kind === 'group-frame'
            ? 5
            : box.kind === 'group-frame'
              ? 0
              : box.kind === 'condition'
                ? 2
                : 1,
    }

    switch (box.kind) {
      case 'start':
        return { ...base, type: 'start' as const, style: { width: box.width, height: box.height } }
      case 'end':
        return { ...base, type: 'end' as const, style: { width: box.width, height: box.height } }
      case 'group-frame': {
        const inMatch = findInMatch(match, box.id)
        const logic: L2GroupLogic =
          inMatch?.type === 'group' ? inMatch.logic : (box.logic ?? 'all')
        const minPass = inMatch?.type === 'group' ? inMatch.minPass : undefined
        const title = groupNodeTitle(logic, minPass)
        const customName =
          inMatch?.type === 'group' ? inMatch.label?.trim() || undefined : undefined
        return {
          ...base,
          type: 'groupFrame' as const,
          data: {
            ...base.data,
            label: title,
            title,
            customName,
            subtitle: undefined,
            groupLogic: logic,
          },
          style: { width: box.width, height: box.height },
        }
      }
      case 'condition':
        return {
          ...base,
          type: 'condition' as const,
          data: {
            ...base.data,
            nodeId: box.id,
            ruleType: box.rule?.type,
            rule: box.rule,
            title: box.rule ? conditionNodeTitle(box.rule) : box.label,
            customName:
              nodeLabels[box.id]?.trim() ||
              (box.rule?.type === 'logic_block_ref' ? box.rule.label?.trim() : undefined) ||
              undefined,
            nodeProvenance: nodeSources[box.id] ?? defaultNodeProvenance(box.rule),
          },
          style: { width: box.width, height: box.height },
        }
    }
  })
}

export function canvasEdgesToRf(
  edges: CanvasEdge[],
  selectedEdgeId: string | null = null,
): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'branchFlow',
    animated: true,
    selectable: true,
    selected: e.id === selectedEdgeId,
    interactionWidth: FLOW_EDGE_INTERACTION_WIDTH,
    zIndex: 1000,
    className: 'l2-flow-edge-branch',
  }))
}

export function resolveCanvasEdges(
  match: L2RuleGroup,
  saved?: CanvasEdge[],
): CanvasEdge[] {
  if (!saved?.length) return defaultCanvasEdges(match)
  const cleaned = sanitizeCanvasEdges(match, saved)
  return cleaned.length ? cleaned : defaultCanvasEdges(match)
}

export function defaultNodeProvenance(rule?: L2RuleNode): L2NodeProvenance {
  if (rule?.type === 'logic_block_ref') return 'subscription'
  return 'native'
}

export function updateRfNodeLabels(
  nodes: Node<GraphNodeData>[],
  match: L2RuleGroup,
  selectedId: string | null,
  nodeLabels: NodeLabels = {},
  nodeSources: NodeSources = {},
): Node<GraphNodeData>[] {
  return nodes.map((node) => {
    if (node.type === 'groupFrame') {
      const inMatch = findInMatch(match, node.id)
      const logic: L2GroupLogic = inMatch?.type === 'group' ? inMatch.logic : 'all'
      const minPass = inMatch?.type === 'group' ? inMatch.minPass : undefined
      const title = groupNodeTitle(logic, minPass)
      const customName =
        inMatch?.type === 'group' ? inMatch.label?.trim() || undefined : undefined
      return {
        ...node,
        selected: node.id === selectedId,
        data: {
          ...node.data,
          selected: node.id === selectedId,
          label: title,
          title,
          customName,
          subtitle: undefined,
          logic: logic.toUpperCase(),
          isRoot: false,
          groupLogic: logic,
        },
      }
    }
    if (node.type === 'condition') {
      const rule = findInMatch(match, node.id)
      if (rule && rule.type !== 'group') {
        const customName =
          nodeLabels[node.id]?.trim() ||
          (rule.type === 'logic_block_ref' ? rule.label?.trim() : undefined)
        return {
          ...node,
          selected: node.id === selectedId,
          data: {
            ...node.data,
            selected: node.id === selectedId,
            title: conditionNodeTitle(rule),
            customName: customName || undefined,
            ruleType: rule.type,
            rule,
            nodeProvenance: nodeSources[node.id] ?? defaultNodeProvenance(rule),
          },
        }
      }
    }
    return {
      ...node,
      selected: node.id === selectedId,
      data: { ...node.data, selected: node.id === selectedId },
    }
  })
}

export function extractPositions(nodes: Node<GraphNodeData>[]): NodePositions {
  const out: NodePositions = {}
  for (const n of nodes) {
    // Nested conditions use layout slots derived from match order — do not persist drag coords.
    if (n.parentId && n.type === 'condition') continue
    out[n.id] = { x: n.position.x, y: n.position.y }
  }
  return out
}

export function layoutNodesForReorder(nodes: Node<GraphNodeData>[]) {
  return nodes.map((n) => ({
    id: n.id,
    parentId: n.parentId,
    type: n.type,
    position: n.position,
  }))
}

/** Align nested condition nodes to even vertical slots inside logic group frames. */
export function snapNestedConditionNodes(nodes: Node<GraphNodeData>[]): Node<GraphNodeData>[] {
  const byParent = new Map<string, Node<GraphNodeData>[]>()
  for (const node of nodes) {
    if (!node.parentId || node.type !== 'condition') continue
    const list = byParent.get(node.parentId) ?? []
    list.push(node)
    byParent.set(node.parentId, list)
  }

  const snappedPos = new Map<string, { x: number; y: number }>()
  for (const siblings of byParent.values()) {
    const sorted = [...siblings].sort((a, b) => a.position.y - b.position.y)
    sorted.forEach((node, index) => {
      snappedPos.set(node.id, snapNestedConditionPosition(node.position, index))
    })
  }

  if (snappedPos.size === 0) return nodes
  return nodes.map((node) => {
    const position = snappedPos.get(node.id)
    return position ? { ...node, position } : node
  })
}

export function resolveCanvasSelectionId(nodeId: string, data: GraphNodeData): string {
  if (nodeId === 'start' || nodeId === 'end') return nodeId
  return data.nodeId ?? nodeId
}

export function isValidCanvasConnection(
  connection: Connection,
  match: L2RuleGroup,
  edges: CanvasEdge[],
): boolean {
  const { source, target } = connection
  if (!source || !target || source === target) return false

  const edgeKey = (s: string, t: string) => `${s}\0${t}`
  const existing = new Set(edges.map((e) => edgeKey(e.source, e.target)))
  if (existing.has(edgeKey(source, target))) return false
  if (
    edgesWouldCycle(
      edges.map((e) => ({ source: e.source, target: e.target })),
      source,
      target,
    )
  ) {
    return false
  }

  return isAllowedCanvasEdge(match, { source, target })
}

export function edgesForTopLevelNode(nodeId: string): CanvasEdge[] {
  return [
    { id: `e-start-${nodeId}`, source: 'start', target: nodeId, branch: true },
    { id: `e-${nodeId}-end`, source: nodeId, target: 'end', branch: true },
  ]
}

export function newCanvasEdge(source: string, target: string, branch = true): CanvasEdge {
  return { id: `e-${source}-${target}`, source, target, branch }
}

function nodeArea(n: Node<GraphNodeData>): number {
  const w = n.measured?.width ?? (typeof n.style?.width === 'number' ? n.style.width : 220)
  const h = n.measured?.height ?? (typeof n.style?.height === 'number' ? n.style.height : 80)
  return w * h
}

/** Smallest intersecting group frame wins — drop node into that container. */
export function findGroupDropTarget(
  dragged: Node<GraphNodeData>,
  intersecting: Node<GraphNodeData>[],
  match: L2RuleGroup,
): string | null {
  if (dragged.id === 'start' || dragged.id === 'end') return null
  if (dragged.type !== 'groupFrame' && dragged.type !== 'condition') return null

  const ranked = intersecting
    .filter(
      (n) =>
        n.type === 'groupFrame' &&
        n.id !== dragged.id &&
        n.id !== match.id &&
        canDropIntoGroup(match, dragged.id, n.id),
    )
    .map((n) => ({ id: n.id, area: nodeArea(n) }))
    .sort((a, b) => a.area - b.area)

  return ranked[0]?.id ?? null
}

export type FlowBounds = { x: number; y: number; width: number; height: number }

export function nodeFlowBounds(node: Node<GraphNodeData>): FlowBounds {
  const width =
    node.measured?.width ?? (typeof node.style?.width === 'number' ? node.style.width : 200)
  const height =
    node.measured?.height ?? (typeof node.style?.height === 'number' ? node.style.height : 56)
  return { x: node.position.x, y: node.position.y, width, height }
}

/** Absolute flow position (handles nested parents). */
export function absoluteNodePosition(
  node: Node<GraphNodeData>,
  nodeById: Map<string, Node<GraphNodeData>>,
): { x: number; y: number } {
  let x = node.position.x
  let y = node.position.y
  let parentId = node.parentId
  while (parentId) {
    const parent = nodeById.get(parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    parentId = parent.parentId
  }
  return { x, y }
}

export function absoluteNodeBounds(
  node: Node<GraphNodeData>,
  nodeById: Map<string, Node<GraphNodeData>>,
): FlowBounds {
  const abs = absoluteNodePosition(node, nodeById)
  const { width, height } = nodeFlowBounds(node)
  return { x: abs.x, y: abs.y, width, height }
}

function pointInBounds(px: number, py: number, b: FlowBounds): boolean {
  return px >= b.x && px <= b.x + b.width && py >= b.y && py <= b.y + b.height
}

function rectsOverlapArea(a: FlowBounds, b: FlowBounds): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return xOverlap * yOverlap
}

/** True when the node has been dragged mostly outside its origin group frame. */
export function shouldExtractOutside(
  node: Node<GraphNodeData>,
  originBounds: FlowBounds,
  nodeById: Map<string, Node<GraphNodeData>>,
): boolean {
  const nodeBounds = absoluteNodeBounds(node, nodeById)
  const nodeArea = Math.max(1, nodeBounds.width * nodeBounds.height)
  const overlapRatio = rectsOverlapArea(nodeBounds, originBounds) / nodeArea
  if (overlapRatio < 0.45) return true
  return isNodeCenterOutsideBounds(node, originBounds, nodeById)
}

/** Prefer re-locking in the origin group when still overlapping it on drop. */
export function shouldRelockInOriginGroup(
  node: Node<GraphNodeData>,
  originBounds: FlowBounds,
  nodeById: Map<string, Node<GraphNodeData>>,
): boolean {
  if (!shouldExtractOutside(node, originBounds, nodeById)) return true
  const nodeBounds = absoluteNodeBounds(node, nodeById)
  const nodeArea = Math.max(1, nodeBounds.width * nodeBounds.height)
  return rectsOverlapArea(nodeBounds, originBounds) / nodeArea >= 0.2
}

export function findExtractDropHighlight(
  dragged: Node<GraphNodeData>,
  intersecting: Node<GraphNodeData>[],
  match: L2RuleGroup,
  originParentId: string | null,
): string | null {
  const target = findGroupDropTarget(dragged, intersecting, match)
  if (target) return target
  if (originParentId && intersecting.some((n) => n.id === originParentId)) {
    return originParentId
  }
  return null
}

export function relockNodeInParent(
  node: Node<GraphNodeData>,
  parentId: string,
  nodeById: Map<string, Node<GraphNodeData>>,
): Node<GraphNodeData> {
  const parent = nodeById.get(parentId)
  if (!parent) return node
  const parentAbs = absoluteNodePosition(parent, nodeById)
  const abs = absoluteNodePosition({ ...node, parentId: undefined }, nodeById)
  return {
    ...node,
    parentId,
    extent: 'parent' as const,
    position: { x: abs.x - parentAbs.x, y: abs.y - parentAbs.y },
    data: {
      ...node.data,
      extracting: false,
      extractOriginParentId: undefined,
    },
  }
}

export function isNodeCenterOutsideBounds(
  node: Node<GraphNodeData>,
  bounds: FlowBounds,
  nodeById: Map<string, Node<GraphNodeData>>,
): boolean {
  const abs = absoluteNodeBounds(node, nodeById)
  const cx = abs.x + abs.width / 2
  const cy = abs.y + abs.height / 2
  return !pointInBounds(cx, cy, bounds)
}

/** Smallest group frame containing a flow point (for palette drops). */
export function findGroupAtFlowPoint(
  point: { x: number; y: number },
  nodes: Node<GraphNodeData>[],
  match: L2RuleGroup,
): string | null {
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const ranked = nodes
    .filter((n) => n.type === 'groupFrame' && n.id !== match.id)
    .map((n) => ({ id: n.id, area: nodeArea(n), bounds: absoluteNodeBounds(n, nodeById) }))
    .filter(({ bounds }) => pointInBounds(point.x, point.y, bounds))
    .sort((a, b) => a.area - b.area)
  return ranked[0]?.id ?? null
}

export function applyTraceOutcomes(
  nodes: Node<GraphNodeData>[],
  trace: L2NodeTrace[] | null | undefined,
): Node<GraphNodeData>[] {
  if (!trace?.length) {
    return nodes.map((n) => ({
      ...n,
      data: { ...n.data, traceOutcome: undefined },
    }))
  }

  const byId = new Map(trace.map((t) => [t.nodeId, t.outcome]))
  return nodes.map((n) => {
    const ruleId = n.data.nodeId ?? n.id
    const outcome = byId.get(ruleId) ?? byId.get(n.id)
    return {
      ...n,
      data: { ...n.data, traceOutcome: outcome },
    }
  })
}
