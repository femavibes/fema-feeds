import type { L2RuleGroup, L2RuleNode, FeedConfig } from '@cfb/core-types'
import { resolveFeedMatch } from '@cfb/l2-graph'

/**
 * Extract a SQL WHERE fragment that can pre-filter pool posts.
 * This is a conservative optimization — it only extracts conditions
 * that can be safely pushed to SQL without changing results.
 * The full L2 eval still runs on all returned rows for correctness.
 *
 * Returns null if no SQL pre-filter can be derived.
 */
export interface SqlPreFilter {
  where: string
  params: unknown[]
}

/**
 * Try to extract a pre-filter from feed match conditions.
 * Currently handles:
 * - Labels (includes) using GIN index on allLabelVals/selfLabels
 * - Hashtags (includes) using GIN index on facetTags
 *
 * Only extracts when ALL paths through the graph require the same condition
 * (i.e., a node that every path must pass through).
 * For simplicity, we extract from top-level conditions in the root group,
 * or single-node feeds (START → condition → END).
 */
export function extractPoolPreFilter(feed: FeedConfig, paramOffset = 0): SqlPreFilter | null {
  const match = resolveFeedMatch(feed)
  const conditions = collectIncludeConditions(match)
  if (conditions.length === 0) return null

  const clauses: string[] = []
  const params: unknown[] = []
  let idx = paramOffset + 1

  for (const cond of conditions) {
    if (cond.type === 'labels' && cond.op === 'includes' && cond.values.length > 0) {
      const jsonPath = labelJsonPath(cond.scope)
      // GIN ?| operator: array contains any of the given values
      clauses.push(`(summary_json->'${jsonPath}') ?| $${idx}::text[]`)
      params.push(cond.values.map((v) => v.toLowerCase()))
      idx++
    } else if (cond.type === 'hashtag' && cond.op === 'includes' && cond.tags.length > 0) {
      // facetTags stored as JSON array of strings
      clauses.push(`(summary_json->'facetTags') ?| $${idx}::text[]`)
      params.push(cond.tags.map((t) => t.toLowerCase().replace(/^#/, '')))
      idx++
    }
  }

  if (clauses.length === 0) return null
  return { where: clauses.join(' AND '), params }
}

function labelJsonPath(scope: string): string {
  switch (scope) {
    case 'self':
      return 'selfLabels'
    case 'labeler':
      // labelerLabels is array of {val, src} objects — need different approach
      // Fall through to allLabelVals which covers both
      return 'allLabelVals'
    default:
      return 'allLabelVals'
  }
}

type IncludeCondition =
  | { type: 'labels'; op: 'includes'; values: string[]; scope: string }
  | { type: 'hashtag'; op: 'includes'; tags: string[] }

/**
 * Walk the match tree and collect "includes" conditions that ALL posts must satisfy.
 * Conservative: only extracts from groups with "all" logic (AND),
 * or single conditions that are the only path.
 */
function collectIncludeConditions(group: L2RuleGroup): IncludeCondition[] {
  const results: IncludeCondition[] = []

  // For root "any" group with a single child, drill in
  if (group.logic === 'any' && group.children?.length === 1) {
    const child = group.children[0]!
    if (child.type === 'group') return collectIncludeConditions(child)
    return extractFromNode(child)
  }

  // For "all" logic, every child must pass — we can extract from each
  if (group.logic === 'all' && group.children) {
    for (const child of group.children) {
      if (child.type === 'group') {
        results.push(...collectIncludeConditions(child))
      } else {
        results.push(...extractFromNode(child))
      }
    }
    return results
  }

  // For "any" with multiple children — we can only extract conditions
  // that appear in ALL children (intersection). For now, skip this complex case
  // unless all children are the same type with same values (unlikely).

  // Single node in the group
  if (group.children?.length === 1) {
    const child = group.children[0]!
    if (child.type !== 'group') return extractFromNode(child)
  }

  return results
}

function extractFromNode(node: L2RuleNode): IncludeCondition[] {
  if (node.type === 'labels' && node.op === 'includes' && node.values.length > 0) {
    return [{ type: 'labels', op: 'includes', values: node.values, scope: node.scope }]
  }
  if (node.type === 'hashtag' && node.op === 'includes' && node.tags.length > 0) {
    return [{ type: 'hashtag', op: 'includes', tags: node.tags }]
  }
  return []
}
