import type { L2RuleGroup, L2RuleNode } from '@cfb/core-types'
import { conditionCollapseMetrics } from './condition-expand.js'

const previewBodyHeightCache = new Map<string, number>()

export function logicBlockPreviewCacheKey(packageId: string, versionPin: string): string {
  return `${packageId}@${versionPin}`
}

export function setLogicBlockPreviewBodyHeight(
  packageId: string,
  versionPin: string,
  bodyHeight: number,
): void {
  previewBodyHeightCache.set(
    logicBlockPreviewCacheKey(packageId, versionPin),
    Math.max(24, Math.ceil(bodyHeight)),
  )
}

export function getLogicBlockPreviewBodyHeight(
  packageId: string,
  versionPin: string,
): number | undefined {
  return previewBodyHeightCache.get(logicBlockPreviewCacheKey(packageId, versionPin))
}

/** Placeholder body height while the package is loading. */
export const LOGIC_BLOCK_LOADING_BODY_H = 48

const FRAME_HEADER = 30
const FRAME_PAD = 16
const CHILD_GAP = 6
const OUTLINE_PAD = 14
const COND_BASE = 34
const COND_LINE = 14

function estimateNodeHeight(node: L2RuleNode): number {
  if (node.type === 'group') {
    const kids = node.children ?? []
    if (kids.length === 0) return FRAME_HEADER + FRAME_PAD + 24
    const inner =
      kids.map(estimateNodeHeight).reduce((a, b) => a + b, 0) + CHILD_GAP * (kids.length - 1)
    return FRAME_HEADER + FRAME_PAD + inner
  }
  const lines = Math.min(3, conditionCollapseMetrics(node).textLines.length)
  return COND_BASE + (lines > 0 ? 4 + lines * COND_LINE : 0)
}

/** Estimate scroll-free body height for a packaged match tree (mini frames). */
export function estimateLogicBlockPreviewBodyHeight(root: L2RuleGroup | L2RuleNode): number {
  return OUTLINE_PAD + estimateNodeHeight(root)
}
