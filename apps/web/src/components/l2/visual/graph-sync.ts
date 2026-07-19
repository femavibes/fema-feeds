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
import { findInMatch, findParentId, canDropIntoGroup } from '../../../lib/l2-form'
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

function resolveNodePosition(
  match: L2RuleGroup,
  box: { id: string; x: number; y: number; parentId?: string; kind: string },
  positions: NodePositions,
): { x: number; y: number } {
  // Nested children follow layoutMatchFlow in match-child order (conditions and
  // nested groups interleaved). Never prefer stale drag slots that forced
  // leaves above subgroups.
  if (box.parentId && (box.kind === 'condition' || box.kind === 'group-frame')) {
    return { x: box.x, y: box.y }
  }
  return positions[box.id] ?? { x: box.x, y: box.y }
}

export function flowGraphToRfNodes(
  match: L2RuleGroup,
  selectedId: string | null,
  positions: NodePositions,
  nodeLabels: NodeLabels = {},
  nodeSources: NodeSources = {},
  feedSources?: import('@cfb/core-types').NativeFeedSource[],
  expandedNodeIds: readonly string[] = [],
  lockedNodeIds: readonly string[] = [],
): Node<GraphNodeData>[] {
  const layout = layoutMatchFlow(normalizeRuleGroup(match), { expandedIds: expandedNodeIds })
  const expandedSet = new Set(expandedNodeIds)
  const lockedSet = new Set(lockedNodeIds)

  const nodes: Node<GraphNodeData>[] = layout.nodes.map((box) => {
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
      extent: undefined,
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
        return {
          ...base,
          type: 'start' as const,
          deletable: false,
          // Keep START/FEED above group frames so wires and chips stay visible.
          zIndex: 4,
          style: { width: box.width, height: box.height },
        }
      case 'end':
        return {
          ...base,
          type: 'end' as const,
          deletable: false,
          zIndex: 4,
          style: { width: box.width, height: box.height },
        }
      case 'group-frame': {
        const inMatch = findInMatch(match, box.id)
        const logic: L2GroupLogic =
          inMatch?.type === 'group' ? inMatch.logic : (box.logic ?? 'all')
        const minPass = inMatch?.type === 'group' ? inMatch.minPass : undefined
        const title = groupNodeTitle(logic, minPass)
        const customName =
          inMatch?.type === 'group' ? inMatch.label?.trim() || undefined : undefined
        const leafIds = collectDescendantLeafIds(match, box.id)
        const locked = lockedSet.has(box.id)
        return {
          ...base,
          type: 'groupFrame' as const,
          deletable: !locked,
          draggable: !locked,
          data: {
            ...base.data,
            label: title,
            title,
            customName,
            subtitle: undefined,
            groupLogic: logic,
            locked,
            hasExpandableContents: leafIds.length > 0,
            contentsExpanded: leafIds.some((id) => expandedSet.has(id)),
          },
          style: { width: box.width, height: box.height },
        }
      }
      case 'condition': {
        const ruleType = box.rule?.type
        const isScore = ruleType === 'score'
        const locked = lockedSet.has(box.id)
        return {
          ...base,
          // Score keeps a dedicated RF type for the +points layout; chrome matches
          // other native conditions (green). Scout/substitute are conditions too.
          type: isScore ? ('score' as const) : ('condition' as const),
          deletable: !locked,
          draggable: !locked,
          data: {
            ...base.data,
            nodeId: box.id,
            ruleType,
            rule: box.rule,
            title: box.rule ? conditionNodeTitle(box.rule) : box.label,
            subtitle: isScore ? `+${(box.rule as { points: number }).points}` : undefined,
            customName:
              nodeLabels[box.id]?.trim() ||
              (ruleType === 'logic_block_ref'
                ? (box.rule as { label?: string }).label?.trim()
                : undefined) ||
              undefined,
            nodeProvenance: nodeSources[box.id] ?? defaultNodeProvenance(box.rule),
            expanded: expandedSet.has(box.id),
            locked,
          },
          style: { width: box.width, height: box.height },
        }
      }
    }
  })

  // Add source nodes that have been placed on the canvas (from positions)
  if (feedSources?.length) {
    feedSources.forEach((src, i) => {
      const sourceId = `source-${i}`
      const pos = positions[sourceId]
      if (!pos) return // not placed yet — still in palette only
      const label = src.type === 'feed' ? src.feedId : src.type === 'project_pool' ? src.projectId : `${src.uris.length} URIs`
      nodes.push({
        id: sourceId,
        type: 'source' as const,
        position: pos,
        data: {
          label,
          subtitle: src.type,
          nodeId: sourceId,
          selected: sourceId === selectedId,
          showPorts: true,
        },
        draggable: true,
        connectable: true,
        selectable: true,
        selected: sourceId === selectedId,
        zIndex: 1,
        style: { width: 160, height: 40 },
      })
    })
  }

  return nodes
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

/**
 * Sanitize a multi-canvas React Flow `id` (HTML id + handle data-id prefix).
 * Avoid dots/colons so querySelector / svg url(#…) stay valid.
 */
export function sanitizeFlowInstanceId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned || 'flow'
}

/** Prefix node/edge DOM ids so two React Flow trees can share a page safely. */
export function namespaceRfNodesForDom<T extends Node<GraphNodeData>>(
  nodes: T[],
  instanceId: string | undefined,
): T[] {
  if (!instanceId) return nodes
  const ns = sanitizeFlowInstanceId(instanceId)
  const mapId = (id: string) => `${ns}__${id}`
  return nodes.map((n) => ({
    ...n,
    id: mapId(n.id),
    parentId: n.parentId ? mapId(n.parentId) : undefined,
  }))
}

export function namespaceRfEdgesForDom(edges: Edge[], instanceId: string | undefined): Edge[] {
  if (!instanceId) return edges
  const ns = sanitizeFlowInstanceId(instanceId)
  const mapId = (id: string) => `${ns}__${id}`
  return edges.map((e) => ({
    ...e,
    id: mapId(e.id),
    source: mapId(e.source),
    target: mapId(e.target),
  }))
}

export function stripFlowDomId(id: string, instanceId: string | undefined): string {
  if (!instanceId) return id
  const prefix = `${sanitizeFlowInstanceId(instanceId)}__`
  return id.startsWith(prefix) ? id.slice(prefix.length) : id
}

export function resolveCanvasEdges(
  match: L2RuleGroup,
  saved?: CanvasEdge[],
): CanvasEdge[] {
  // Only invent START→node→FEED wires when the draft has never stored edges.
  // An explicit [] (or edges wiped by sanitize after nest) must stay empty —
  // otherwise disconnecting / nesting keeps "healing" auto-wires back in.
  if (saved === undefined) return defaultCanvasEdges(match)
  return sanitizeCanvasEdges(match, saved)
}

export function defaultNodeProvenance(rule?: L2RuleNode): L2NodeProvenance {
  // Untagged refs: treat as collection (★ teal). Insert/convert paths set this
  // explicitly; marketplace palette sets 'subscription'.
  if (rule?.type === 'logic_block_ref') return 'collection'
  return 'native'
}

export function updateRfNodeLabels(
  nodes: Node<GraphNodeData>[],
  match: L2RuleGroup,
  selectedId: string | null,
  nodeLabels: NodeLabels = {},
  nodeSources: NodeSources = {},
  expandedNodeIds: readonly string[] = [],
  lockedNodeIds: readonly string[] = [],
): Node<GraphNodeData>[] {
  const expandedSet = new Set(expandedNodeIds)
  const lockedSet = new Set(lockedNodeIds)
  return nodes.map((node) => {
    if (node.type === 'groupFrame') {
      const inMatch = findInMatch(match, node.id)
      const logic: L2GroupLogic = inMatch?.type === 'group' ? inMatch.logic : 'all'
      const minPass = inMatch?.type === 'group' ? inMatch.minPass : undefined
      const title = groupNodeTitle(logic, minPass)
      const customName =
        inMatch?.type === 'group' ? inMatch.label?.trim() || undefined : undefined
      const leafIds = collectDescendantLeafIds(match, node.id)
      const locked = lockedSet.has(node.id)
      return {
        ...node,
        selected: node.id === selectedId,
        deletable: !locked,
        draggable: !locked,
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
          locked,
          hasExpandableContents: leafIds.length > 0,
          contentsExpanded: leafIds.some((id) => expandedSet.has(id)),
        },
      }
    }
    if (node.type === 'condition' || node.type === 'score') {
      const rule = findInMatch(match, node.id)
      if (rule && rule.type !== 'group') {
        const customName =
          nodeLabels[node.id]?.trim() ||
          (rule.type === 'logic_block_ref' ? rule.label?.trim() : undefined)
        const locked = lockedSet.has(node.id)
        return {
          ...node,
          selected: node.id === selectedId,
          deletable: !locked,
          draggable: !locked,
          data: {
            ...node.data,
            selected: node.id === selectedId,
            title: conditionNodeTitle(rule),
            subtitle: rule.type === 'score' ? `+${rule.points}` : node.data.subtitle,
            customName: customName || undefined,
            ruleType: rule.type,
            rule,
            nodeProvenance: nodeSources[node.id] ?? defaultNodeProvenance(rule),
            expanded: expandedSet.has(node.id),
            locked,
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
    // Nested conditions + nested group frames use layoutMatchFlow slots —
    // do not persist drag coords (they go stale when the parent expands).
    if (n.parentId && (n.type === 'condition' || n.type === 'score' || n.type === 'groupFrame')) continue
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

/**
 * Re-apply layoutMatchFlow positions/sizes for every nested child.
 * Call after a drag that did not change match structure so nested frames
 * don't stay at free-drag coords.
 */
export function applyNestedLayoutPositions(
  nodes: Node<GraphNodeData>[],
  match: L2RuleGroup,
  expandedNodeIds: readonly string[] = [],
): Node<GraphNodeData>[] {
  const layout = layoutMatchFlow(normalizeRuleGroup(match), { expandedIds: expandedNodeIds })
  const expandedSet = new Set(expandedNodeIds)
  const byId = new Map(layout.nodes.map((box) => [box.id, box]))
  let changed = false
  const next = nodes.map((node) => {
    if (!node.parentId) {
      // Top-level conditions still need height updates when expand toggles.
      if (node.type !== 'condition' && node.type !== 'score') return node
      const box = byId.get(node.id)
      if (!box) return node
      const height = box.height
      const width = box.width
      const prevW = typeof node.style?.width === 'number' ? node.style.width : undefined
      const prevH = typeof node.style?.height === 'number' ? node.style.height : undefined
      const expanded = expandedSet.has(node.id)
      if (prevW === width && prevH === height && node.data.expanded === expanded) return node
      changed = true
      return {
        ...node,
        data: { ...node.data, expanded },
        style: { ...node.style, width, height },
      }
    }
    if (node.type !== 'condition' && node.type !== 'score' && node.type !== 'groupFrame') {
      return node
    }
    const box = byId.get(node.id)
    if (!box) return node
    const position = { x: box.x, y: box.y }
    const samePos = node.position.x === position.x && node.position.y === position.y
    const width = box.width
    const height = box.height
    const prevW = typeof node.style?.width === 'number' ? node.style.width : undefined
    const prevH = typeof node.style?.height === 'number' ? node.style.height : undefined
    const expanded =
      node.type === 'condition' || node.type === 'score' ? expandedSet.has(node.id) : undefined
    if (
      samePos &&
      prevW === width &&
      prevH === height &&
      (expanded === undefined || node.data.expanded === expanded)
    ) {
      return node
    }
    changed = true
    return {
      ...node,
      position,
      data: expanded === undefined ? node.data : { ...node.data, expanded },
      style: { ...node.style, width, height },
    }
  })
  return changed ? next : nodes
}

/** Every non-group descendant under `groupId` (any depth). */
export function collectDescendantLeafIds(match: L2RuleGroup, groupId: string): string[] {
  const group = findInMatch(match, groupId)
  if (!group || group.type !== 'group') return []
  const out: string[] = []
  const walk = (n: L2RuleNode) => {
    if (n.type === 'group') {
      for (const c of n.children ?? []) walk(c)
    } else {
      out.push(n.id)
    }
  }
  for (const c of group.children ?? []) walk(c)
  return out
}

/** True if `nodeId` is locked, or (for groups) any descendant is locked. */
export function subtreeContainsLocked(
  match: L2RuleGroup,
  nodeId: string,
  locked: ReadonlySet<string>,
): boolean {
  if (locked.has(nodeId)) return true
  const node = findInMatch(match, nodeId)
  if (!node || node.type !== 'group') return false
  const walk = (n: L2RuleNode): boolean => {
    if (locked.has(n.id)) return true
    if (n.type === 'group') {
      for (const c of n.children ?? []) {
        if (walk(c)) return true
      }
    }
    return false
  }
  for (const c of node.children ?? []) {
    if (walk(c)) return true
  }
  return false
}

/** True when `groupId` is nested under `ancestorId` (not equal). */
function isDescendantGroup(match: L2RuleGroup, ancestorId: string, groupId: string): boolean {
  let id: string | null = groupId
  while (id) {
    const parent = findParentId(match, id)
    if (parent === ancestorId) return true
    if (!parent || parent === match.id) return false
    id = parent
  }
  return false
}

/**
 * Pick a group frame under the pointer for nest/reparent.
 * Conditions/score prefer deepest (smallest) frames; group→group prefers
 * outermost (largest) so nested ANDs don't steal the drop.
 */
export function findGroupDropTarget(
  dragged: Node<GraphNodeData>,
  intersecting: Node<GraphNodeData>[],
  match: L2RuleGroup,
  allNodes?: Node<GraphNodeData>[],
): string | null {
  if (dragged.id === 'start' || dragged.id === 'end') return null
  if (dragged.type !== 'groupFrame' && dragged.type !== 'condition' && dragged.type !== 'score') {
    return null
  }

  const nodeById = new Map((allNodes ?? intersecting.concat(dragged)).map((n) => [n.id, n]))
  // Prefer intentional drops: require the dragged node's center to sit inside
  // the target. Mere edge-overlap with a nested sibling OR/AND while reordering
  // must not yank the node into that group.
  const draggedAbs = absoluteNodeBounds(dragged, nodeById)
  const cx = draggedAbs.x + draggedAbs.width / 2
  const cy = draggedAbs.y + draggedAbs.height / 2

  let candidates = intersecting.filter(
    (n) =>
      n.type === 'groupFrame' &&
      n.id !== dragged.id &&
      n.id !== match.id &&
      canDropIntoGroup(match, dragged.id, n.id) &&
      pointInBounds(cx, cy, absoluteNodeBounds(n, nodeById)),
  )

  // Reordering inside a group: the ancestor frame still contains the pointer, so
  // without this guard every vertical drag would "promote" the node one level up.
  // While the center stays in the current parent, only allow drops into nested
  // child groups (e.g. into an OR inside an AND) — never into ancestors.
  const currentParentId = dragged.parentId
  if (currentParentId) {
    const currentParent = nodeById.get(currentParentId)
    if (currentParent) {
      const stillInParent = pointInBounds(cx, cy, absoluteNodeBounds(currentParent, nodeById))
      if (stillInParent) {
        candidates = candidates.filter((n) => isDescendantGroup(match, currentParentId, n.id))
      }
    }
  }

  const ranked = candidates
    .map((n) => ({ id: n.id, area: nodeArea(n) }))
    .sort((a, b) =>
      // Groups dropped onto groups: prefer the outermost frame under the
      // cursor. Smallest-area (deepest) targeting makes a top-level OR fall
      // into a nested AND inside the OR you aimed at.
      dragged.type === 'groupFrame' ? b.area - a.area : a.area - b.area,
    )

  return ranked[0]?.id ?? null
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
  allNodes?: Node<GraphNodeData>[],
): string | null {
  const target = findGroupDropTarget(dragged, intersecting, match, allNodes)
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
