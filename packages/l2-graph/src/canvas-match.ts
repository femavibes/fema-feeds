import type { FeedConfig, L2RuleGroup, L2RuleNode } from '@cfb/core-types'
import { layoutMatchFlow } from './nested-flow-layout.js'
import { normalizeRuleGroup } from './normalize-match.js'

export interface FlowCanvasEdge {
  source: string
  target: string
}

function findInTree(root: L2RuleGroup, nodeId: string): L2RuleGroup | L2RuleNode | null {
  if (root.id === nodeId) return root
  for (const child of root.children ?? []) {
    if (child.id === nodeId) return child
    if (child.type === 'group') {
      const found = findInTree(child, nodeId)
      if (found) return found
    }
  }
  return null
}

function findParentIdInMatch(root: L2RuleGroup, nodeId: string): string | null {
  if (nodeId === root.id) return null
  for (const child of root.children) {
    if (child.id === nodeId) return root.id
    if (child.type === 'group') {
      const found = findParentIdInMatch(child, nodeId)
      if (found) return found
    }
  }
  return null
}

/** Canvas wires only connect start/end and direct children of the feed root. */
export function isTopLevelCanvasNode(match: L2RuleGroup, nodeId: string): boolean {
  if (nodeId === 'start' || nodeId === 'end' || nodeId === match.id) return false
  return findParentIdInMatch(match, nodeId) === match.id
}

/** True when an edge may appear on the visual flow canvas (nested nodes are group-internal only). */
export function isAllowedCanvasEdge(match: L2RuleGroup, edge: FlowCanvasEdge): boolean {
  const { source, target } = edge
  if (!source || !target || source === target) return false
  if (target === 'start' || source === 'end') return false

  if (source === 'start') {
    return target !== 'end' && isTopLevelCanvasNode(match, target)
  }
  if (target === 'end') {
    return source !== 'start' && isTopLevelCanvasNode(match, source)
  }
  return isTopLevelCanvasNode(match, source) && isTopLevelCanvasNode(match, target)
}

/** Drop stale wires to nested nodes (e.g. after dragging a condition into a group). */
export function sanitizeCanvasEdges<T extends FlowCanvasEdge>(
  match: L2RuleGroup,
  edges: T[],
): T[] {
  return edges.filter((e) => isAllowedCanvasEdge(match, e))
}

/** All simple paths START → … → END (intermediate node ids only). */
export function enumeratePathsStartToEnd(edges: FlowCanvasEdge[]): string[][] {
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    const list = adj.get(e.source) ?? []
    list.push(e.target)
    adj.set(e.source, list)
  }

  const paths: string[][] = []
  const walk = (node: string, acc: string[]) => {
    if (node === 'end') {
      paths.push(acc)
      return
    }
    for (const next of adj.get(node) ?? []) {
      if (next === 'end') {
        paths.push(acc)
      } else if (next !== 'start') {
        walk(next, [...acc, next])
      }
    }
  }
  walk('start', [])
  return paths
}

function pathGroupId(path: string[]): string {
  return `path-${path.join('--')}`
}

function pathToBranch(match: L2RuleGroup, path: string[]): L2RuleNode | null {
  if (path.length === 0) return null

  const nodes = path
    .map((id) => findInTree(match, id))
    .filter((n): n is L2RuleNode => n !== null && n.id !== match.id)

  if (nodes.length === 0) return null
  if (nodes.length === 1) return structuredClone(nodes[0]!)

  const children = nodes.map((n) => structuredClone(n))
  return {
    type: 'group',
    id: pathGroupId(path),
    logic: 'all',
    children,
  }
}

/**
 * Derive feed rules from canvas wiring:
 * - Each START → … → END path is one OR branch.
 * - Multiple nodes on the same path are AND (serial filters).
 */
export function canvasEdgesToMatch(
  current: L2RuleGroup,
  edges: FlowCanvasEdge[],
): L2RuleGroup {
  const paths = enumeratePathsStartToEnd(edges)
  const branches: L2RuleNode[] = []

  for (const path of paths) {
    const branch = pathToBranch(current, path)
    if (branch) branches.push(branch)
  }

  return {
    type: 'group',
    id: current.id,
    logic: 'any',
    children: branches,
  }
}

export function defaultEdgesForTopLevelNode(nodeId: string): FlowCanvasEdge[] {
  return [
    { source: 'start', target: nodeId },
    { source: nodeId, target: 'end' },
  ]
}

export function edgesWouldCycle(
  edges: FlowCanvasEdge[],
  source: string,
  target: string,
): boolean {
  if (source === target) return true
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    const list = adj.get(e.source) ?? []
    list.push(e.target)
    adj.set(e.source, list)
  }
  adj.get(source)?.push(target)

  const seen = new Set<string>()
  const stack = [target]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node === source) return true
    if (seen.has(node)) continue
    seen.add(node)
    for (const next of adj.get(node) ?? []) {
      if (next !== 'end') stack.push(next)
    }
  }
  return false
}

/** Flatten synthesized path-* AND wrappers back to top-level nodes for the canvas. */
export function flattenTopLevelMatch(match: L2RuleGroup): L2RuleGroup {
  const root = normalizeRuleGroup(match)
  const flat: L2RuleNode[] = []
  for (const child of root.children) {
    if (child.type === 'group' && child.id.startsWith('path-') && child.logic === 'all') {
      flat.push(...child.children)
    } else {
      flat.push(child)
    }
  }
  return { ...root, logic: 'any', children: flat }
}

/** Canvas feeds: flat node defs at root; OR/AND between paths comes from edges only. */
export function normalizeCanvasFeedStorage(match: L2RuleGroup): L2RuleGroup {
  return flattenTopLevelMatch(match)
}

/** Effective rules for eval: canvas edges define OR paths and AND chains. */
export function resolveFeedMatch(feed: Pick<FeedConfig, 'match' | 'visualLayout'>): L2RuleGroup {
  if (!feed.visualLayout) return feed.match

  const flat = flattenTopLevelMatch(feed.match)
  const rawEdges = feed.visualLayout.edges?.length
    ? feed.visualLayout.edges.map((e) => ({ source: e.source, target: e.target }))
    : layoutMatchFlow(flat).edges.map((e) => ({ source: e.source, target: e.target }))
  const edges = sanitizeCanvasEdges(flat, rawEdges)

  return canvasEdgesToMatch(flat, edges)
}
