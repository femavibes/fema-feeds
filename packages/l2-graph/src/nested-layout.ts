import type { L2GroupLogic, L2RuleGroup, L2RuleNode } from '@cfb/core-types'
import { junctionSubtitle, junctionTitle, summarizeRule } from './flow.js'

export interface NestedLayoutBox {
  id: string
  kind: 'group' | 'condition'
  logic?: L2GroupLogic
  rule?: L2RuleNode
  parentId?: string
  x: number
  y: number
  width: number
  height: number
  isRoot?: boolean
  label: string
  subtitle?: string
}

const PAD = 14
const HEADER = 40
const GAP = 10
const LEAF_W = 210
const LEAF_H = 52
const MIN_GROUP_W = 240

interface Measured {
  w: number
  h: number
}

function measureLeaf(): Measured {
  return { w: LEAF_W, h: LEAF_H }
}

function measureGroup(group: L2RuleGroup): Measured {
  if (group.children.length === 0) {
    return { w: MIN_GROUP_W, h: HEADER + LEAF_H + PAD }
  }
  let maxChildW = 0
  let totalH = 0
  for (const child of group.children) {
    const m = child.type === 'group' ? measureGroup(child) : measureLeaf()
    maxChildW = Math.max(maxChildW, m.w)
    totalH += m.h + GAP
  }
  totalH -= GAP
  return {
    w: Math.max(MIN_GROUP_W, maxChildW + PAD * 2),
    h: HEADER + totalH + PAD,
  }
}

function layoutNode(
  node: L2RuleNode,
  parentId: string | undefined,
  ox: number,
  oy: number,
  isRoot: boolean,
  out: NestedLayoutBox[],
): Measured {
  if (node.type !== 'group') {
    out.push({
      id: node.id,
      kind: 'condition',
      rule: node,
      parentId,
      x: ox,
      y: oy,
      width: LEAF_W,
      height: LEAF_H,
      label: summarizeRule(node),
    })
    return measureLeaf()
  }

  const size = measureGroup(node)
  out.push({
    id: node.id,
    kind: 'group',
    logic: node.logic,
    parentId,
    x: ox,
    y: oy,
    width: size.w,
    height: size.h,
    isRoot,
    label: isRoot ? 'Feed match' : (node.label ?? junctionTitle(node.logic)),
    subtitle: isRoot ? 'All top-level groups must pass' : junctionSubtitle(node.logic),
  })

  let cy = HEADER
  const innerW = size.w - PAD * 2

  for (const child of node.children) {
    const childSize =
      child.type === 'group' ? measureGroup(child) : measureLeaf()
    const childX = PAD + Math.max(0, (innerW - childSize.w) / 2)
    layoutNode(child, node.id, childX, cy, false, out)
    cy += childSize.h + GAP
  }

  return size
}

/** Graze-style nested box layout — child positions are relative to parent group frames. */
export function layoutMatchTree(match: L2RuleGroup): NestedLayoutBox[] {
  const boxes: NestedLayoutBox[] = []
  layoutNode(match, undefined, 40, 40, true, boxes)
  return boxes
}
