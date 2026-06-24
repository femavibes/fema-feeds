import type { L2GroupLogic, L2RuleGroup, L2RuleNode } from '@cfb/core-types'

import { groupNodeTitle, conditionNodeTitle } from './flow.js'
import { normalizeRuleGroup } from './normalize-match.js'



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

const START_W = 76

const START_H = 40

const FLOW_START_X = 20

const FLOW_BLOCK_X = 120

const FLOW_END_GAP = 48



interface Measured {

  width: number

  height: number

}



interface LayoutCtx {

  nodes: FlowLayoutNode[]

  edges: FlowLayoutEdge[]

}



function pushEdge(ctx: LayoutCtx, source: string, target: string): void {

  ctx.edges.push({ id: `e-${source}-${target}`, source, target, branch: true })

}



/** @param parentSlotW When nested, total frame width must fit this slot (parent inner width). */
function measureGroup(group: L2RuleGroup, parentSlotW = 0): Measured {

  const children = group.children ?? []
  const leaves = children.filter((c) => c.type !== 'group')

  const subgroups = children.filter((c) => c.type === 'group') as L2RuleGroup[]



  let innerH = FRAME_HEADER + FRAME_PAD

  let innerW = Math.max(MIN_FRAME_W - FRAME_PAD * 2, 0)



  if (leaves.length > 0) {

    innerH += leaves.length * COND_H + (leaves.length - 1) * V_GAP + V_GAP

    innerW = Math.max(innerW, COND_W)

  }



  if (subgroups.length > 0) {

    const metrics = subgroups.map((sg) => measureGroup(sg))

    if (group.logic === 'all') {

      const rowW = metrics.reduce((s, m, i) => s + m.width + (i > 0 ? H_GAP : 0), 0)

      const rowH = Math.max(...metrics.map((m) => m.height))

      innerW = Math.max(innerW, rowW)

      innerH += rowH + (leaves.length > 0 ? V_GAP : 0)

    } else {

      const stackH = metrics.reduce((s, m, i) => s + m.height + (i > 0 ? V_GAP : 0), 0)

      const stackW = Math.max(...metrics.map((m) => m.width))

      innerW = Math.max(innerW, stackW)

      innerH += stackH + (leaves.length > 0 ? V_GAP : 0)

    }

  }



  if (children.length === 0) {

    innerH += COND_H

    innerW = Math.max(innerW, COND_W)

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

  const size = measureGroup(group, parentSlotW)

  const innerW = size.width - FRAME_PAD * 2

  const groupChildren = group.children ?? []
  const leaves = groupChildren.filter((c) => c.type !== 'group')

  const subgroups = groupChildren.filter((c) => c.type === 'group') as L2RuleGroup[]



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



  let cy = FRAME_HEADER + FRAME_PAD

  const innerX = FRAME_PAD



  for (const leaf of leaves) {

    ctx.nodes.push({

      id: leaf.id,

      kind: 'condition',

      parentId: group.id,

      x: innerX,

      y: cy,

      width: innerW,

      height: COND_H,

      rule: leaf,

      label: conditionNodeTitle(leaf),

    })

    cy += COND_H + V_GAP

  }



  const groupY = leaves.length > 0 ? cy + V_GAP : FRAME_HEADER + FRAME_PAD

  let gx = innerX

  let stackY = groupY

  let prevGroupId: string | null = null



  for (const child of subgroups) {

    const fillSlot = group.logic === 'any' || subgroups.length === 1

    const slotW = fillSlot ? innerW : 0

    const sub = measureGroup(child, slotW)

    const childX = group.logic === 'all' ? gx : innerX

    const childY = group.logic === 'all' ? groupY : stackY

    layoutGroup(ctx, child, childX, childY, group.id, false, slotW)



    if (group.logic === 'all' && prevGroupId) {

      pushEdge(ctx, prevGroupId, child.id)

    }



    prevGroupId = child.id

    if (group.logic === 'all') {

      gx += sub.width + H_GAP

    } else {

      stackY += sub.height + V_GAP

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

export function layoutMatchFlow(match: L2RuleGroup): NestedFlowLayout {

  const ctx: LayoutCtx = { nodes: [], edges: [] }

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



  for (const child of topChildren) {

    if (child.type === 'group') {

      const size = layoutGroup(ctx, child, flowX, baseY, undefined, true)

      maxHeight = Math.max(maxHeight, size.height)

      pushEdge(ctx, 'start', child.id)

      pushEdge(ctx, child.id, 'end')

      flowX += size.width + H_GAP

    } else {

      const y = baseY + 24

      ctx.nodes.push({

        id: child.id,

        kind: 'condition',

        x: flowX,

        y,

        width: COND_W,

        height: COND_H,

        topLevel: true,

        rule: child,

        label: conditionNodeTitle(child),

      })

      maxHeight = Math.max(maxHeight, COND_H + 48)

      pushEdge(ctx, 'start', child.id)

      pushEdge(ctx, child.id, 'end')

      flowX += COND_W + H_GAP

    }

  }



  const midY = baseY + maxHeight / 2 - START_H / 2

  placeStartEnd(ctx, midY, flowX + FLOW_END_GAP)



  return { nodes: ctx.nodes, edges: ctx.edges }

}


