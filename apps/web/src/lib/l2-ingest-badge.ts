import type { L2RuleNode } from '@cfb/core-types'
import { isIngestEligibleNodeType, nodeRunsAtIngest, nodeDiscoverRole } from '@cfb/core-types'

/** L2-only gates — never Discover (nothing to pull into the pool at ingest). */
const L2_FILTER_ONLY = new Set<L2RuleNode['type']>([
  'alt_text',
  'post_age',
  'media_stats',
  'mime_type',
  'compare',
  'media_type',
  'text',
])

/**
 * Discover / Filter badge for properties + canvas icon.
 * Discover = can pull posts into the L1 pool; Filter = L2-only / exclude.
 */
export function ingestRoleBadgeFor(node: L2RuleNode): 'discover' | 'filter' | null {
  if (node.type === 'group' || node.type === 'graze_stub' || node.type === 'logic_block_ref') {
    return null
  }

  if (L2_FILTER_ONLY.has(node.type)) return 'filter'

  // Mention: Discover compiles into the L1 ingest gate (facetMentions); Filter stays L2-only.
  if (node.type === 'mention') {
    if (node.op === 'excludes') return 'filter'
    return (node.role ?? 'discover') === 'discover' ? 'discover' : 'filter'
  }

  if (!isIngestEligibleNodeType(node.type)) return null

  // Explicit excludes never pull into the pool.
  if ('op' in node && (node.op === 'excludes' || node.op === 'not_in_list')) {
    return 'filter'
  }

  if (node.type === 'author' || node.type === 'follow_ring') {
    return nodeDiscoverRole(node) === 'discover' ? 'discover' : 'filter'
  }

  return nodeRunsAtIngest(node) ? 'discover' : 'filter'
}
