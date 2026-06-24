import type {
  L2AuthorCondition,
  L2BoolCondition,
  L2CompareCondition,
  L2CompareOp,
  L2GroupLogic,
  L2NumericField,
  L2RuleGroup,
  L2RuleNode,
  L2TextCondition,
} from '@cfb/core-types'
import { newId } from './ids.js'

/** Legacy feed-gen groups format (assignment_rules v1). */
export interface LegacyAssignmentRules {
  logic?: 'OR' | 'AND'
  groups?: Array<{
    logic?: 'OR' | 'AND'
    conditions?: LegacyCondition[]
  }>
}

interface LegacyCondition {
  field?: string
  operator?: string
  value?: string | number | boolean
}

function mapRootLogic(logic?: string): L2GroupLogic {
  if (logic === 'AND') return 'all'
  if (logic === 'OR') return 'any'
  return 'any'
}

function mapGroupLogic(logic?: string): L2GroupLogic {
  if (logic === 'OR') return 'any'
  if (logic === 'AND') return 'all'
  return 'all'
}

function mapTextOp(op: string): L2TextCondition['op'] {
  const o = op.toLowerCase()
  if (o === 'not contains' || o === 'not_contains') return 'not_contains'
  if (o === 'equals') return 'equals'
  if (o === 'matches regex' || o === 'regex') return 'regex'
  return 'contains'
}

function mapCompareOp(op: string): L2CompareOp {
  const allowed: L2CompareOp[] = ['==', '!=', '<', '<=', '>', '>=']
  return allowed.includes(op as L2CompareOp) ? (op as L2CompareOp) : '>='
}

function mapNumericField(field: string): L2NumericField {
  if (field === 'follower_count') return 'author_follower_count'
  if (field === 'like_count') return 'like_count'
  if (field === 'repost_count') return 'repost_count'
  if (field === 'reply_count') return 'reply_count'
  return 'like_count'
}

function legacyConditionToNode(c: LegacyCondition): L2RuleNode | null {
  const field = c.field ?? ''
  const op = (c.operator ?? '').toLowerCase()

  if (field === 'text') {
    return {
      type: 'text',
      id: newId('text'),
      field: 'text',
      op: mapTextOp(c.operator ?? 'contains'),
      value: String(c.value ?? ''),
    }
  }

  if (field === 'author_did' && (op === 'in_list' || op === 'not_in_list')) {
    const node: L2AuthorCondition = {
      type: 'author',
      id: newId('author'),
      op: op === 'in_list' ? 'in_list' : 'not_in_list',
      listId: typeof c.value === 'string' ? c.value : undefined,
    }
    return node
  }

  if (
    field === 'like_count' ||
    field === 'repost_count' ||
    field === 'reply_count' ||
    field === 'follower_count'
  ) {
    const node: L2CompareCondition = {
      type: 'compare',
      id: newId('math'),
      left: { type: 'field', field: mapNumericField(field) },
      op: mapCompareOp(c.operator ?? '>='),
      right: { type: 'literal', value: Number(c.value ?? 0) },
    }
    return node
  }

  if (field === 'has_images' || field === 'has_image') {
    const node: L2BoolCondition = {
      type: 'bool',
      id: newId('bool'),
      field: 'has_image',
      value: op === 'is true' || op === 'true',
    }
    return node
  }
  if (field === 'has_video') {
    return {
      type: 'bool',
      id: newId('bool'),
      field: 'has_video',
      value: op === 'is true' || op === 'true',
    }
  }
  if (field === 'has_link' || field === 'has_link_card') {
    return {
      type: 'bool',
      id: newId('bool'),
      field: 'has_link_card',
      value: op === 'is true' || op === 'true',
    }
  }

  return null
}

export function importLegacyAssignmentRules(rules: LegacyAssignmentRules): L2RuleGroup {
  const children: L2RuleNode[] = []
  for (const group of rules.groups ?? []) {
    const conds = (group.conditions ?? [])
      .map(legacyConditionToNode)
      .filter((n): n is L2RuleNode => n !== null)
    if (conds.length === 0) continue
    children.push({
      type: 'group',
      id: newId('group'),
      logic: mapGroupLogic(group.logic),
      children: conds,
    })
  }

  return {
    type: 'group',
    id: 'root',
    logic: mapRootLogic(rules.logic),
    children: children.length > 0 ? children : [],
  }
}
