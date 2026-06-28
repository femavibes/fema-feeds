/**
 * Strict Ingest Mode — Feed Graph Extraction
 *
 * Walks a feed's resolved L2 graph and extracts ingest-eligible INCLUDE paths.
 * Excludes are skipped (stay L2-only). Non-eligible nodes are skipped within paths.
 * The result is a set of DNF paths (OR of ANDs) that represent what this feed "wants."
 */
import type {
  FeedConfig,
  IngestGateBranch,
  IngestGateRule,
  L2RuleGroup,
  L2RuleNode,
} from '@cfb/core-types'
import { isIngestEligibleNodeType, isViewerFollowRing } from '@cfb/core-types'
import { resolveFeedMatch } from '@cfb/l2-graph'
import { branchFromPrefilterNode } from './compile-prefilter.js'
import { dnfPathsFromRule } from './ingest-path-dnf.js'

/** Node types whose `op: 'excludes'` means we skip them (excludes stay L2-only). */
function isExcludeNode(node: L2RuleNode): boolean {
  if ('op' in node && node.op === 'excludes') return true
  return false
}

/** Check if a leaf node is ingest-eligible AND is an include (not exclude). */
function isStrictEligibleLeaf(node: L2RuleNode): boolean {
  if (node.type === 'group' || node.type === 'graze_stub' || node.type === 'logic_block_ref') {
    return false
  }
  if (!isIngestEligibleNodeType(node.type)) return false
  if (node.type === 'follow_ring' && isViewerFollowRing(node.hubSource)) return false
  if (isExcludeNode(node)) return false
  return true
}

/**
 * Recursively compile a node into an IngestGateRule for strict mode.
 * Skips exclude nodes and non-eligible nodes.
 * Returns null if the node contributes nothing to the include gate.
 */
function compileStrictNode(feedId: string, node: L2RuleNode): IngestGateRule | null {
  if (node.type === 'group') {
    const childRules: IngestGateRule[] = []
    for (const child of node.children) {
      const compiled = compileStrictNode(feedId, child)
      if (compiled) childRules.push(compiled)
    }
    if (childRules.length === 0) return null

    const meta = { sourceFeedId: feedId, sourceNodeId: node.id }
    switch (node.logic) {
      case 'any':
        return { type: 'any', rules: childRules, ...meta }
      case 'none':
        // "none" means exclude — skip entirely for strict mode
        return null
      case 'n_of':
        return {
          type: 'n_of',
          rules: childRules,
          minPass: Math.max(1, node.minPass ?? 2),
          ...meta,
        }
      case 'all':
      default:
        // If ALL had children but some were excluded/non-eligible, we still
        // AND the remaining eligible ones together
        return childRules.length === 1
          ? childRules[0]!
          : { type: 'all', rules: childRules, ...meta }
    }
  }

  // Leaf node
  if (!isStrictEligibleLeaf(node)) return null
  return branchFromPrefilterNode(feedId, node)
}

/**
 * Extract ingest-eligible include paths from a single feed.
 * Returns an array of DNF paths (each path is an AND-conjunction of branches).
 * Empty array = feed contributes nothing to strict mode.
 */
export function extractStrictIncludePaths(feed: FeedConfig): IngestGateBranch[][] {
  if (!feed.enabled) return []

  const match = resolveFeedMatch(feed)
  const orChildren: L2RuleNode[] = match.logic === 'any' ? match.children : [match]
  const paths: IngestGateBranch[][] = []

  for (const child of orChildren) {
    const compiled = compileStrictNode(feed.feedId, child)
    if (!compiled) continue
    paths.push(...dnfPathsFromRule(compiled))
  }

  return paths.filter((p) => p.length > 0)
}
