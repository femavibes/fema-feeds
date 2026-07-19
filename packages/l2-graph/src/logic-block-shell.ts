import type { L2RuleGroup } from '@cfb/core-types'

import { normalizeCanvasFeedStorage } from './canvas-match.js'
import { normalizeRuleGroup } from './normalize-match.js'

/**
 * Synthetic feed-root id used only while editing/previewing a logic block on the
 * visual canvas. Must never be persisted as the package root — doing so stacks
 * OR shells on every save/open cycle.
 */
export const LOGIC_BLOCK_EDITOR_ROOT_ID = 'logic-block-preview-root'

function isEditorShell(group: L2RuleGroup): boolean {
  return group.id === LOGIC_BLOCK_EDITOR_ROOT_ID && group.logic === 'any'
}

/**
 * Peel accidentally persisted editor OR shells until the real package root.
 * Safe for already-clean roots (AND/OR/n_of with real ids).
 */
export function peelLogicBlockEditorShell(root: L2RuleGroup): L2RuleGroup {
  let g = normalizeRuleGroup(root)
  while (
    isEditorShell(g) &&
    g.children.length === 1 &&
    g.children[0]?.type === 'group'
  ) {
    g = normalizeRuleGroup(g.children[0] as L2RuleGroup)
  }
  // Saved shell with multiple canvas children — keep children, drop fake id.
  if (isEditorShell(g)) {
    return normalizeCanvasFeedStorage({ ...g, id: 'root' })
  }
  return g
}

/** True when `root` still has the editor preview shell id (needs peel / repair). */
export function logicBlockRootHasEditorShell(root: L2RuleGroup): boolean {
  return normalizeRuleGroup(root).id === LOGIC_BLOCK_EDITOR_ROOT_ID
}

/** Wrap a package root so the canvas shows it as one nested frame under START/FEED. */
export function wrapLogicBlockForCanvas(root: L2RuleGroup): L2RuleGroup {
  const packagedRoot = peelLogicBlockEditorShell(root)
  return {
    type: 'group',
    id: LOGIC_BLOCK_EDITOR_ROOT_ID,
    logic: 'any',
    children: [packagedRoot],
  }
}

/** Persistable root from an editor/preview draft match (unwrap shell + flatten path-*). */
export function logicBlockRootFromCanvasMatch(match: L2RuleGroup): L2RuleGroup {
  const root = normalizeRuleGroup(match)
  if (isEditorShell(root) && root.children.length === 1 && root.children[0]?.type === 'group') {
    return peelLogicBlockEditorShell(root.children[0] as L2RuleGroup)
  }
  if (isEditorShell(root)) {
    return normalizeCanvasFeedStorage({ ...root, id: 'root' })
  }
  return peelLogicBlockEditorShell(normalizeCanvasFeedStorage(root))
}
