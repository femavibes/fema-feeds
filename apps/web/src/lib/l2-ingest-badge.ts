import type { L2RuleNode } from '@cfb/core-types'
import {
  isIngestEligibleNodeType,
  isViewerFollowRing,
  nodeRunsAtIngest,
  nodeDiscoverRole,
} from '@cfb/core-types'

/**
 * Role chip on the properties panel + matching icon on the canvas node.
 * - discover — can pull posts into the L1 pool
 * - filter — L2-only / exclude / account-hub gate
 * - personalize — viewer-relative serve-time constraint (stacks with filter)
 */
export type NodeRoleBadge = 'discover' | 'filter' | 'personalize'

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

/** True for nodes that gate per viewing user at skeleton serve. */
export function isPersonalizeNode(node: L2RuleNode): boolean {
  if (node.type === 'follow_ring' && isViewerFollowRing(node.hubSource)) return true
  return false
}

/** Discover vs Filter only — never Personalization. */
function ingestDiscoverOrFilter(node: L2RuleNode): 'discover' | 'filter' | null {
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
    // Viewer hub cannot Discover — always Filter (+ Personalization stacked separately).
    if (node.type === 'follow_ring' && isViewerFollowRing(node.hubSource)) return 'filter'
    return nodeDiscoverRole(node) === 'discover' ? 'discover' : 'filter'
  }

  return nodeRunsAtIngest(node) ? 'discover' : 'filter'
}

/**
 * Role badges for properties + canvas icons.
 * Viewer follow rings return both Filter and Personalization.
 */
export function ingestRoleBadgeFor(node: L2RuleNode): NodeRoleBadge[] {
  const roles: NodeRoleBadge[] = []
  const ingest = ingestDiscoverOrFilter(node)
  if (ingest) roles.push(ingest)
  if (isPersonalizeNode(node)) roles.push('personalize')
  return roles
}

export function nodeRoleBadgeLabel(role: NodeRoleBadge): string {
  switch (role) {
    case 'discover':
      return 'Discover'
    case 'filter':
      return 'Filter'
    case 'personalize':
      return 'Personalization'
  }
}

export function nodeRoleBadgeTitle(role: NodeRoleBadge): string {
  switch (role) {
    case 'discover':
      return 'Discover — this node can pull matching posts into the project pool from the firehose'
    case 'filter':
      return 'Filter — does not pull new posts into the pool; only gates posts already in play (or excludes)'
    case 'personalize':
      return 'Personalization — resolved per viewing user when the feed is served (not at ingest)'
  }
}
