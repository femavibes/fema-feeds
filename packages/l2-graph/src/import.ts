import type { L2RuleGroup, L2RuleNode } from '@cfb/core-types'
import type { FeedGenGraph } from './import-visual.js'
import { importGrazeFilter, isGrazeRules } from './import-graze.js'
import { importLegacyAssignmentRules, type LegacyAssignmentRules } from './import-legacy.js'
import { importVisualGraph } from './import-visual.js'

export type { LegacyAssignmentRules } from './import-legacy.js'
export type { FeedGenGraph } from './import-visual.js'
export { importLegacyAssignmentRules } from './import-legacy.js'
export { importVisualGraph } from './import-visual.js'
export { importGrazeFilter, isGrazeRules, extractGrazeFilter } from './import-graze.js'

/** Auto-detect feed-gen assignment_rules or Graze manifest.filter shape. */
export function importFeedGenRules(raw: unknown): L2RuleGroup | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  if (isGrazeRules(raw)) {
    return importGrazeFilter(raw)
  }

  if (Array.isArray(obj.nodes) && Array.isArray(obj.edges)) {
    return importVisualGraph(obj as unknown as FeedGenGraph)
  }

  if (Array.isArray(obj.groups)) {
    return importLegacyAssignmentRules(obj as LegacyAssignmentRules)
  }

  return null
}

export function countImportableConditions(match: L2RuleGroup): number {
  let n = 0
  const walk = (node: L2RuleNode) => {
    if (node.type === 'group') {
      for (const c of node.children ?? []) walk(c)
    } else {
      n++
    }
  }
  walk(match)
  return n
}
