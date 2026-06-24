import type { L2GroupLogic, L2RuleGroup, L2RuleNode } from '@cfb/core-types'
import { formatFollowRingDirection } from '@cfb/core-types'
import { normalizeRuleGroup } from './normalize-match.js'

export interface FlowPosition {
  x: number
  y: number
}

export interface FlowNodeBase {
  id: string
  position: FlowPosition
}

export interface FlowStartNode extends FlowNodeBase {
  type: 'start'
}

export interface FlowEndNode extends FlowNodeBase {
  type: 'end'
}

export interface FlowJunctionNode extends FlowNodeBase {
  type: 'junction'
  logic: L2GroupLogic
}

export interface FlowConditionNode extends FlowNodeBase {
  type: 'condition'
  rule: L2RuleNode
}

export type FlowNode = FlowStartNode | FlowEndNode | FlowJunctionNode | FlowConditionNode

export interface FlowEdge {
  id: string
  source: string
  target: string
  kind: 'flow' | 'logic'
}

export interface L2FlowGraph {
  version: 1
  nodes: FlowNode[]
  edges: FlowEdge[]
}

const X = { start: 40, root: 240, branch: 440, condStep: 200, end: 1280 } as const
const ROW = 120

function logicLabel(logic: L2GroupLogic, minPass?: number): string {
  if (logic === 'any') return 'ANY'
  if (logic === 'all') return 'ALL'
  if (logic === 'n_of') return `${minPass ?? 2}-OF`
  return 'NOT'
}

export function junctionTitle(logic: L2GroupLogic, minPass?: number): string {
  if (logic === 'none') return 'NOT'
  return logicLabel(logic, minPass)
}

export function junctionSubtitle(logic: L2GroupLogic, minPass?: number): string {
  if (logic === 'any') return 'Any child inside can pass'
  if (logic === 'all') return 'Every child inside must pass'
  if (logic === 'n_of') return `At least ${minPass ?? 2} children inside must pass`
  return 'Reject if any child inside matches'
}

/** Compact canvas title for logic group frames. */
export function groupNodeTitle(logic: L2GroupLogic, minPass?: number): string {
  if (logic === 'any') return 'OR'
  if (logic === 'all') return 'AND'
  if (logic === 'n_of') return `${minPass ?? 2}-OF`
  return 'NOT'
}

/** Human-readable group frame title (no duplicated ALL/ANY tag). */
export function groupFrameLabel(
  logic: L2GroupLogic,
  minPass?: number,
  options?: { isRoot?: boolean; customLabel?: string },
): string {
  if (options?.customLabel) return options.customLabel
  if (options?.isRoot) return 'Feed rules'
  if (logic === 'any') return 'OR group'
  if (logic === 'all') return 'AND group'
  if (logic === 'n_of') return `${minPass ?? 2}-of group`
  return 'NOT group'
}

export function groupFrameSubtitle(
  logic: L2GroupLogic,
  minPass?: number,
  isRoot = false,
): string {
  if (isRoot) {
    if (logic === 'any') return 'Post matches if any top-level branch passes'
    if (logic === 'all') return 'Post matches if every top-level branch passes'
    if (logic === 'n_of') return `Post matches if at least ${minPass ?? 2} branches pass`
    return 'Post matches unless a branch matches'
  }
  return junctionSubtitle(logic, minPass)
}

function formatConditionBracket(op: string): string {
  const labels: Record<string, string> = {
    includes: 'INCLUDES',
    excludes: 'EXCLUDES',
    matches: 'MATCHES',
    not_matches: 'NOT MATCHES',
    is: 'IS',
    is_not: 'IS NOT',
    newer_than: 'WITHIN',
    older_than: 'OLDER THAN',
    has: 'HAS',
    missing: 'MISSING',
    in_list: 'IN LIST',
    not_in_list: 'NOT IN LIST',
    '==': '==',
    '!=': '!=',
    '<': '<',
    '<=': '<=',
    '>': '>',
    '>=': '>=',
  }
  return `[${labels[op] ?? op.replace(/_/g, ' ').toUpperCase()}]`
}

/** Compact canvas title — type + mode only (no term lists). */
export function conditionNodeTitle(node: L2RuleNode): string {
  switch (node.type) {
    case 'text':
      return `TEXT ${formatConditionBracket(node.op)}`
    case 'keyword':
      return `KEYWORD ${formatConditionBracket(node.op)}`
    case 'regex':
      return `REGEX ${formatConditionBracket(node.op)}`
    case 'hashtag':
      return `HASHTAG ${formatConditionBracket(node.op)}`
    case 'url':
      return `URL ${formatConditionBracket(node.op)}`
    case 'mention':
      return `MENTION ${formatConditionBracket(node.op)}`
    case 'follow_ring':
      return `FOLLOW RING ${formatConditionBracket(node.op)}`
    case 'media_type':
      return `MEDIA TYPE ${formatConditionBracket(node.op)}`
    case 'alt_text':
      return `ALT TEXT ${formatConditionBracket(node.op)}`
    case 'post_age':
      return `POST AGE ${formatConditionBracket(node.op)}`
    case 'media_stats':
      return `MEDIA STATS ${formatConditionBracket(node.op)}`
    case 'mime_type':
      return `MIME ${formatConditionBracket(node.op)}`
    case 'bool': {
      const mode = node.value ? 'required' : 'excluded'
      return `EMBED ${formatConditionBracket(mode)}`
    }
    case 'language':
      return 'LANGUAGE [ALLOW]'
    case 'post_kind':
      return `POST TYPE ${formatConditionBracket(node.op)}`
    case 'labels':
      return `LABELS ${formatConditionBracket(node.op)}`
    case 'compare':
      return `ENGAGEMENT ${formatConditionBracket(node.op)}`
    case 'author':
      return `AUTHOR ${formatConditionBracket(node.op)}`
    case 'graze_stub':
      return (node.title ?? node.grazeType ?? 'GRAZE').toUpperCase()
    case 'logic_block_ref':
      return 'LOGIC BLOCK'
    case 'group':
      return `GROUP [${node.logic.toUpperCase()}]`
  }
}

export function summarizeRule(node: L2RuleNode): string {
  switch (node.type) {
    case 'text':
      return `text ${node.op} "${node.value.slice(0, 40)}"`
    case 'keyword':
      return `keyword ${node.op} ${(node.terms ?? []).join(', ') || '…'}`
    case 'regex':
      return `regex ${node.op} /${(node.pattern ?? '').slice(0, 40)}/`
    case 'hashtag':
      return `hashtag ${node.op} ${(node.tags ?? []).join(', ') || '…'}`
    case 'url':
      return `url ${node.op} ${(node.patterns ?? []).join(', ') || '…'}`
    case 'mention':
      return `mention ${node.op} ${(node.accounts ?? []).join(', ') || '…'}`
    case 'follow_ring': {
      const hub =
        (node.hubSource ?? 'account') === 'viewer'
          ? 'viewer'
          : node.hub || '…'
      return `follow ring ${node.op} ${hub} ${formatFollowRingDirection(node.direction)}`
    }
    case 'media_type':
      return `media ${node.op} type ${(node.mediaTypes ?? []).join('|') || '…'}`
    case 'alt_text':
      return `alt text ${node.op}`
    case 'post_age':
      return `age ${node.op} ${node.hours}h (${node.use})`
    case 'media_stats':
      return `${node.metric} ${node.op} ${node.value}`
    case 'mime_type':
      return `mime ${node.op} ${node.pattern || '…'}`
    case 'bool': {
      const req = node.value ? 'required' : 'excluded'
      return `embed ${node.field.replace(/_/g, ' ')} ${req}`
    }
    case 'language':
      return `lang in ${(node.allow ?? []).join(',') || '…'}`
    case 'post_kind':
      return `post ${node.op} ${(node.kinds ?? []).join('|') || '…'}`
    case 'labels':
      return `labels ${node.op} ${(node.values ?? []).join(',') || '…'} (${node.scope})`
    case 'compare':
      return `math ${node.op} …`
    case 'author':
      return node.op === 'in_list'
        ? `author in ${node.listId ?? node.dids?.length ?? 0} dids`
        : `author not in list`
    case 'graze_stub':
      return node.title ?? node.grazeType
    case 'logic_block_ref':
      return node.label ?? `Logic block ${node.versionPin}`
    case 'group':
      return `group (${node.logic})`
  }
}

/**
 * Map L2 rule tree → left-to-right pipeline graph.
 * Every path is solid flow: filters chain in series; the last node in each path reaches FEED.
 */
export function matchToFlowGraph(match: L2RuleGroup): L2FlowGraph {
  const root = normalizeRuleGroup(match)
  const nodes: FlowNode[] = [
    { id: 'start', type: 'start', position: { x: X.start, y: 200 } },
    { id: 'end', type: 'end', position: { x: X.end, y: 200 } },
    { id: root.id, type: 'junction', logic: root.logic, position: { x: X.root, y: 200 } },
  ]
  const edges: FlowEdge[] = [
    { id: 'e-start-root', source: 'start', target: root.id, kind: 'flow' },
  ]

  let branchY = 48
  for (const child of root.children) {
    if (child.type === 'group') {
      const conds = child.children.filter((c) => c.type !== 'group')
      nodes.push({
        id: child.id,
        type: 'junction',
        logic: child.logic,
        position: { x: X.branch, y: branchY },
      })
      edges.push({ id: `e-${root.id}-${child.id}`, source: root.id, target: child.id, kind: 'flow' })

      if (conds.length === 0) {
        edges.push({ id: `e-${child.id}-end`, source: child.id, target: 'end', kind: 'flow' })
      } else {
        let prevId = child.id
        let x = X.branch + X.condStep
        for (const cond of conds) {
          nodes.push({
            id: cond.id,
            type: 'condition',
            rule: cond,
            position: { x, y: branchY },
          })
          edges.push({ id: `e-${prevId}-${cond.id}`, source: prevId, target: cond.id, kind: 'flow' })
          prevId = cond.id
          x += X.condStep
        }
        edges.push({ id: `e-${prevId}-end`, source: prevId, target: 'end', kind: 'flow' })
      }

      branchY += Math.max(ROW * 1.6, ROW)
    } else {
      nodes.push({
        id: child.id,
        type: 'condition',
        rule: child,
        position: { x: X.branch, y: branchY },
      })
      edges.push({ id: `e-${root.id}-${child.id}`, source: root.id, target: child.id, kind: 'flow' })
      edges.push({ id: `e-${child.id}-end`, source: child.id, target: 'end', kind: 'flow' })
      branchY += ROW
    }
  }

  if (root.children.length === 0) {
    edges.push({ id: 'e-root-end', source: root.id, target: 'end', kind: 'flow' })
  }

  return { version: 1, nodes, edges }
}
