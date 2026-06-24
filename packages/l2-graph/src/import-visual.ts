import type {
  L2AuthorCondition,
  L2BoolCondition,
  L2CompareCondition,
  L2GroupLogic,
  L2MentionCondition,
  L2RegexCondition,
  L2RuleGroup,
  L2RuleNode,
  L2TextCondition,
  L2UrlCondition,
} from '@cfb/core-types'
import { newId } from './ids.js'

export interface FeedGenGraph {
  version?: number
  nodes: FeedGenNode[]
  edges: FeedGenEdge[]
}

export interface FeedGenNode {
  id: string
  type: string
  data?: Record<string, unknown>
  config?: Record<string, unknown>
}

export interface FeedGenEdge {
  id?: string
  source: string
  target: string
  type?: string
  logic?: string
  sourceHandle?: string
  targetHandle?: string
}

const CONDITION_TYPES = new Set([
  'text',
  'regex',
  'hashtag',
  'url',
  'links',
  'language',
  'posttype',
  'author',
  'mentions',
  'image',
  'video',
  'media',
  'engagement',
  'labels',
])

function nodeData(node: FeedGenNode): Record<string, unknown> {
  return { ...node.config, ...node.data }
}

function isFlowEdge(e: FeedGenEdge): boolean {
  if (e.type === 'flow') return true
  if (e.type === 'logic') return false
  if (e.sourceHandle === 'output-right' && e.targetHandle === 'input-left') return true
  return !e.type && !e.logic && !e.sourceHandle?.startsWith('logic')
}

function isLogicEdge(e: FeedGenEdge): boolean {
  return e.type === 'logic' || Boolean(e.logic) || Boolean(e.sourceHandle?.startsWith('logic'))
}

function mapJunctionLogic(node: FeedGenNode): L2GroupLogic {
  const data = nodeData(node)
  const mode = String(data.logicModeTop ?? data.logic ?? 'and').toLowerCase()
  if (mode === 'or') return 'any'
  if (mode === 'nof' || mode === 'none') return 'none'
  return 'all'
}

function feedGenNodeToCondition(node: FeedGenNode): L2RuleNode | null {
  const data = nodeData(node)
  const t = node.type

  if (t === 'regex') {
    const node: L2RegexCondition = {
      type: 'regex',
      id: newId('regex'),
      op: 'matches',
      pattern: String(data.value ?? data.pattern ?? data.text ?? ''),
      fields: ['text'],
      caseInsensitive: data.caseInsensitive !== false,
    }
    return node
  }

  if (t === 'text') {
    const op = String(data.operator ?? data.op ?? 'contains').includes('not')
      ? 'not_contains'
      : 'contains'
    return {
      type: 'text',
      id: newId('text'),
      field: 'text',
      op: op as L2TextCondition['op'],
      value: String(data.value ?? data.text ?? ''),
    }
  }

  if (t === 'hashtag') {
    const tags = Array.isArray(data.tags)
      ? data.tags.map(String)
      : String(data.value ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
    return {
      type: 'hashtag',
      id: newId('tag'),
      op: String(data.operator ?? '').includes('exclude') ? 'excludes' : 'includes',
      tags,
    }
  }

  if (t === 'image' || t === 'video' || t === 'media') {
    const field =
      t === 'video' ? 'has_video' : t === 'image' ? 'has_image' : 'has_image'
    const node: L2BoolCondition = {
      type: 'bool',
      id: newId('bool'),
      field,
      value: data.required !== false && data.value !== false,
    }
    return node
  }

  if (t === 'author') {
    const listUri = String(data.listUri ?? data.listId ?? data.list ?? '')
    const node: L2AuthorCondition = {
      type: 'author',
      id: newId('author'),
      op: data.exclude ? 'not_in_list' : 'in_list',
      listId: listUri || undefined,
    }
    return node
  }

  if (t === 'mentions') {
    const accounts = Array.isArray(data.accounts)
      ? data.accounts.map(String)
      : Array.isArray(data.dids)
        ? data.dids.map(String)
        : String(data.value ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
    const node: L2MentionCondition = {
      type: 'mention',
      id: newId('mention'),
      op: String(data.operator ?? data.op ?? '').includes('exclude') ? 'excludes' : 'includes',
      accounts,
      listUri: data.listUri ? String(data.listUri) : undefined,
    }
    return node
  }

  if (t === 'links' || t === 'url') {
    const patterns = Array.isArray(data.patterns)
      ? data.patterns.map(String)
      : String(data.value ?? data.url ?? data.pattern ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
    const node: L2UrlCondition = {
      type: 'url',
      id: newId('url'),
      op: String(data.operator ?? '').includes('exclude') ? 'excludes' : 'includes',
      patterns,
      sources: ['link_card', 'facet_link', 'bridgy_original'],
    }
    return node
  }

  if (t === 'engagement') {
    const metric = String(data.metric ?? 'likes').toLowerCase()
    const field =
      metric.includes('repost') ? 'repost_count' : metric.includes('reply') ? 'reply_count' : 'like_count'
    const node: L2CompareCondition = {
      type: 'compare',
      id: newId('math'),
      left: { type: 'field', field },
      op: '>=',
      right: { type: 'literal', value: Number(data.min ?? data.threshold ?? data.value ?? 1) },
    }
    return node
  }

  if (!CONDITION_TYPES.has(t)) return null

  return null
}

/**
 * Best-effort import of feed-gen visual graph (v2) → CFB rule tree.
 * Supports: start → root junction → branch junctions → conditions → end.
 */
export function importVisualGraph(graph: FeedGenGraph): L2RuleGroup | null {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  const start = graph.nodes.find((n) => n.type === 'start' || n.type === 'manualposts')
  if (!start) return null

  const rootEdge = graph.edges.find((e) => e.source === start.id && isFlowEdge(e))
  const rootNode = rootEdge ? nodeById.get(rootEdge.target) : undefined
  if (!rootNode || (rootNode.type !== 'junction' && rootNode.type !== 'logicgroup')) {
    return null
  }

  const rootLogic = mapJunctionLogic(rootNode)
  const children: L2RuleNode[] = []

  const branchEdges = graph.edges.filter(
    (e) => e.source === rootNode.id && isFlowEdge(e) && nodeById.get(e.target)?.type !== 'end',
  )

  for (const edge of branchEdges) {
    const branch = nodeById.get(edge.target)
    if (!branch) continue

    if (branch.type === 'junction' || branch.type === 'logicgroup' || branch.type === 'and') {
      const conds: L2RuleNode[] = []
      for (const le of graph.edges.filter((e) => e.source === branch.id && isLogicEdge(e))) {
        const condNode = nodeById.get(le.target)
        if (!condNode || !CONDITION_TYPES.has(condNode.type)) continue
        const mapped = feedGenNodeToCondition(condNode)
        if (mapped) conds.push(mapped)
      }
      if (conds.length > 0) {
        children.push({
          type: 'group',
          id: newId('group'),
          logic: mapJunctionLogic(branch),
          children: conds,
        })
      }
    } else if (CONDITION_TYPES.has(branch.type)) {
      const mapped = feedGenNodeToCondition(branch)
      if (mapped) children.push(mapped)
    }
  }

  // Logic edges directly from root junction
  for (const le of graph.edges.filter((e) => e.source === rootNode.id && isLogicEdge(e))) {
    const condNode = nodeById.get(le.target)
    if (!condNode) continue
    const mapped = feedGenNodeToCondition(condNode)
    if (mapped) children.push(mapped)
  }

  return {
    type: 'group',
    id: 'root',
    logic: rootLogic,
    children,
  }
}
