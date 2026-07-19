import type { L2GroupLogic, L2RuleGroup, L2RuleNode } from '@cfb/core-types'

import { conditionNodeHeight, conditionNodeWidth } from './condition-expand.js'
import { groupNodeTitle, conditionNodeTitle } from './flow.js'
import { normalizeRuleGroup } from './normalize-match.js'

export { conditionNodeHeight, conditionNodeWidth } from './condition-expand.js'

export type FlowLayoutKind = 'start' | 'end' | 'condition' | 'group-frame'

export interface FlowLayoutNode {
  id: string
  kind: FlowLayoutKind
  x: number
  y: number
  width: number
  height: number
  parentId?: string
  logic?: L2GroupLogic
  rule?: L2RuleNode
  label: string
  subtitle?: string
  groupId?: string
  /** Direct child of feed root — connects START » node » FEED. */
  topLevel?: boolean
}

export interface FlowLayoutEdge {
  id: string
  source: string
  target: string
  branch?: boolean
}

export interface NestedFlowLayout {
  nodes: FlowLayoutNode[]
  edges: FlowLayoutEdge[]
}

const COND_W = 200
const COND_H = 56
const H_GAP = 36
const V_GAP = 10
const FRAME_PAD = 16
const FRAME_HEADER = 36

export const NESTED_COND_H = COND_H
export const NESTED_V_GAP = V_GAP
export const NESTED_FRAME_HEADER = FRAME_HEADER
export const NESTED_FRAME_PAD = FRAME_PAD

export type LayoutMatchFlowOptions = {
  /** Leaf ids whose canvas body is expanded (default: all collapsed). */
  expandedIds?: ReadonlySet<string> | readonly string[]
}

function isExpandedId(id: string, opts?: LayoutMatchFlowOptions): boolean {
  const ids = opts?.expandedIds
  if (!ids) return false
  if (ids instanceof Set) return ids.has(id)
  return (ids as readonly string[]).includes(id)
}

function heightFor(rule: L2RuleNode, opts?: LayoutMatchFlowOptions): number {
  return conditionNodeHeight(rule, isExpandedId(rule.id, opts))
}

function widthFor(rule: L2RuleNode, opts?: LayoutMatchFlowOptions): number {
  return conditionNodeWidth(rule, isExpandedId(rule.id, opts), COND_W)
}

/** Y position for the nth stacked condition inside a logic group frame. */
export function nestedConditionSlotY(index: number): number {
  return FRAME_HEADER + FRAME_PAD + index * (COND_H + V_GAP)
}

/** Snap a nested condition node to the standard vertical slots inside its group. */
export function snapNestedConditionPosition(
  position: { x: number; y: number },
  slotIndex: number,
): { x: number; y: number } {
  return {
    x: FRAME_PAD,
    y: nestedConditionSlotY(slotIndex),
  }
}

const MIN_FRAME_W = 220
const START_W = 96
const START_H = 44
const FLOW_START_X = 24
/** Clear gap between START/FEED and the adjacent block (must stay equal). */
const FLOW_ENDPOINT_GAP = 56
const FLOW_BLOCK_X = FLOW_START_X + START_W + FLOW_ENDPOINT_GAP
const FLOW_END_GAP = FLOW_ENDPOINT_GAP

interface Measured {
  width: number
  height: number
}

interface LayoutCtx {
  nodes: FlowLayoutNode[]
  edges: FlowLayoutEdge[]
  opts?: LayoutMatchFlowOptions
}

function pushEdge(ctx: LayoutCtx, source: string, target: string): void {
  ctx.edges.push({
    id: `e-${source}-${target}`,
    source,
    target,
    branch: true,
  })
}

/** True when AND children are all groups — lay out as a horizontal row. */
function isHorizontalAndOfGroups(group: L2RuleGroup): boolean {
  const children = group.children ?? []
  return group.logic === 'all' && children.length > 0 && children.every((c) => c.type === 'group')
}

/** @param parentSlotW When nested, total frame width must fit this slot (parent inner width). */
function measureGroup(group: L2RuleGroup, parentSlotW = 0, opts?: LayoutMatchFlowOptions): Measured {
  const children = group.children ?? []
  let innerH = FRAME_HEADER + FRAME_PAD
  let innerW = Math.max(MIN_FRAME_W - FRAME_PAD * 2, 0)

  if (children.length === 0) {
    innerH += COND_H
    innerW = Math.max(innerW, COND_W)
  } else if (isHorizontalAndOfGroups(group)) {
    const subgroups = children as L2RuleGroup[]
    const metrics = subgroups.map((sg) => measureGroup(sg, 0, opts))
    const rowW = metrics.reduce((s, m, i) => s + m.width + (i > 0 ? H_GAP : 0), 0)
    const rowH = Math.max(...metrics.map((m) => m.height))
    innerW = Math.max(innerW, rowW)
    innerH += rowH
  } else {
    // Interleaved match order: conditions and nested groups share one vertical stack.
    for (let i = 0; i < children.length; i++) {
      const child = children[i]!
      if (child.type === 'group') {
        const m = measureGroup(child, 0, opts)
        innerW = Math.max(innerW, m.width)
        innerH += m.height
      } else {
        innerW = Math.max(innerW, widthFor(child, opts))
        innerH += heightFor(child, opts)
      }
      if (i < children.length - 1) innerH += V_GAP
    }
  }

  let width = Math.max(MIN_FRAME_W, innerW + FRAME_PAD * 2)
  if (parentSlotW > 0) {
    width = parentSlotW
  }

  return {
    width,
    height: innerH + FRAME_PAD,
  }
}

/** Place a logic container and nested children (conditions + inner groups). */
function layoutGroup(
  ctx: LayoutCtx,
  group: L2RuleGroup,
  x: number,
  y: number,
  parentId?: string,
  topLevel = false,
  parentSlotW = 0,
): Measured {
  const opts = ctx.opts
  const size = measureGroup(group, parentSlotW, opts)
  const innerW = size.width - FRAME_PAD * 2
  const groupChildren = group.children ?? []

  ctx.nodes.push({
    id: group.id,
    kind: 'group-frame',
    x,
    y,
    width: size.width,
    height: size.height,
    parentId,
    logic: group.logic,
    label: groupNodeTitle(group.logic, group.minPass),
    subtitle: undefined,
    topLevel,
    groupId: group.id,
  })

  const innerX = FRAME_PAD

  if (isHorizontalAndOfGroups(group)) {
    let gx = innerX
    let prevGroupId: string | null = null
    const groupY = FRAME_HEADER + FRAME_PAD
    for (const child of groupChildren as L2RuleGroup[]) {
      const sub = measureGroup(child, 0, opts)
      layoutGroup(ctx, child, gx, groupY, group.id, false, 0)
      if (prevGroupId) pushEdge(ctx, prevGroupId, child.id)
      prevGroupId = child.id
      gx += sub.width + H_GAP
    }
  } else {
    let cy = FRAME_HEADER + FRAME_PAD
    for (const child of groupChildren) {
      if (child.type === 'group') {
        const slotW = innerW
        const sub = measureGroup(child, slotW, opts)
        layoutGroup(ctx, child, innerX, cy, group.id, false, slotW)
        cy += sub.height + V_GAP
      } else {
        const h = heightFor(child, opts)
        ctx.nodes.push({
          id: child.id,
          kind: 'condition',
          parentId: group.id,
          x: innerX,
          y: cy,
          width: innerW,
          height: h,
          rule: child,
          label: conditionNodeTitle(child),
        })
        cy += h + V_GAP
      }
    }
  }

  return size
}

function placeStartEnd(ctx: LayoutCtx, midY: number, endX: number): void {
  ctx.nodes.unshift({
    id: 'start',
    kind: 'start',
    x: FLOW_START_X,
    y: midY,
    width: START_W,
    height: START_H,
    label: 'START',
  })

  ctx.nodes.push({
    id: 'end',
    kind: 'end',
    x: endX,
    y: midY,
    width: START_W,
    height: START_H,
    label: 'FEED',
  })
}

/**
 * Top-level flow: START » each direct child (group or filter) » FEED.
 * Root group logic (AND/OR) affects evaluation only — not shown as a canvas box.
 */
export function layoutMatchFlow(
  match: L2RuleGroup,
  opts?: LayoutMatchFlowOptions,
): NestedFlowLayout {
  const ctx: LayoutCtx = { nodes: [], edges: [], opts }
  const topChildren = normalizeRuleGroup(match).children

  if (topChildren.length === 0) {
    const midY = 40
    placeStartEnd(ctx, midY, FLOW_BLOCK_X + FLOW_END_GAP)
    pushEdge(ctx, 'start', 'end')
    return { nodes: ctx.nodes, edges: ctx.edges }
  }

  let flowX = FLOW_BLOCK_X
  const baseY = 40
  let maxHeight = 0
  let contentRight = FLOW_BLOCK_X

  for (const child of topChildren) {
    if (child.type === 'group') {
      const size = layoutGroup(ctx, child, flowX, baseY, undefined, true)
      maxHeight = Math.max(maxHeight, size.height)
      pushEdge(ctx, 'start', child.id)
      pushEdge(ctx, child.id, 'end')
      contentRight = flowX + size.width
      flowX += size.width + H_GAP
    } else {
      const y = baseY + 24
      const h = heightFor(child, opts)
      const w = widthFor(child, opts)
      ctx.nodes.push({
        id: child.id,
        kind: 'condition',
        x: flowX,
        y,
        width: w,
        height: h,
        topLevel: true,
        rule: child,
        label: conditionNodeTitle(child),
      })
      maxHeight = Math.max(maxHeight, h + 48)
      pushEdge(ctx, 'start', child.id)
      pushEdge(ctx, child.id, 'end')
      contentRight = flowX + w
      flowX += w + H_GAP
    }
  }

  const midY = baseY + maxHeight / 2 - START_H / 2
  placeStartEnd(ctx, midY, contentRight + FLOW_END_GAP)

  return { nodes: ctx.nodes, edges: ctx.edges }
}
