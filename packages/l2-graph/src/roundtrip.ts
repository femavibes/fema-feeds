import type { L2GroupLogic, L2RuleGroup, L2RuleNode } from '@cfb/core-types'
import type { L2FlowGraph } from './flow.js'
import { matchToFlowGraph } from './flow.js'

/** Follow solid flow edges through condition nodes (not into FEED). */
function walkConditionChain(graph: L2FlowGraph, startId: string): L2RuleNode[] {
  const conditions: L2RuleNode[] = []
  let current: string | null = startId
  const seen = new Set<string>()

  while (current && !seen.has(current)) {
    seen.add(current)
    const next = graph.edges.find(
      (e) => e.source === current && e.kind === 'flow' && e.target !== 'end',
    )
    if (!next) break
    const node = graph.nodes.find((n) => n.id === next.target)
    if (!node || node.type !== 'condition') break
    conditions.push(node.rule)
    current = node.id
  }

  return conditions
}

/** Legacy dashed edges: junction → condition (older visual layouts). */
function logicChildren(graph: L2FlowGraph, groupId: string): L2RuleNode[] {
  const out: L2RuleNode[] = []
  for (const le of graph.edges) {
    if (le.source !== groupId || le.kind !== 'logic') continue
    const condNode = graph.nodes.find((n) => n.id === le.target)
    if (condNode?.type === 'condition') out.push(condNode.rule)
  }
  return out
}

function mergeConditions(chain: L2RuleNode[], legacy: L2RuleNode[]): L2RuleNode[] {
  const seen = new Set<string>()
  const merged: L2RuleNode[] = []
  for (const c of [...chain, ...legacy]) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    merged.push(c)
  }
  return merged
}

/** Rebuild rule tree from a flow graph produced by matchToFlowGraph. */
export function flowGraphToMatch(graph: L2FlowGraph): L2RuleGroup | null {
  const rootId = graph.edges.find((e) => e.source === 'start' && e.kind === 'flow')?.target
  if (!rootId) return null

  const rootNode = graph.nodes.find((n) => n.id === rootId)
  if (!rootNode || rootNode.type !== 'junction') return null

  const children: L2RuleNode[] = []

  for (const edge of graph.edges) {
    if (edge.source !== rootId) continue
    if (edge.target === 'end') continue

    const target = graph.nodes.find((n) => n.id === edge.target)
    if (!target) continue

    if (edge.kind === 'flow' && target.type === 'junction') {
      const groupChildren = mergeConditions(
        walkConditionChain(graph, target.id),
        logicChildren(graph, target.id),
      )
      children.push({
        type: 'group',
        id: target.id,
        logic: target.logic,
        children: groupChildren,
      })
    } else if (
      (edge.kind === 'flow' || edge.kind === 'logic') &&
      target.type === 'condition'
    ) {
      children.push(target.rule)
    }
  }

  return {
    type: 'group',
    id: rootId,
    logic: rootNode.logic as L2GroupLogic,
    children,
  }
}

/** True when flow export → import preserves structure. */
export function matchRoundTripEquals(original: L2RuleGroup): boolean {
  const graph = matchToFlowGraph(original)
  const rebuilt = flowGraphToMatch(graph)
  if (!rebuilt) return false
  return JSON.stringify(rebuilt) === JSON.stringify(original)
}
