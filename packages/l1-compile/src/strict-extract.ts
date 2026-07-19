/**
 * Strict Ingest Mode — Feed Graph Extraction
 *
 * Walks a feed's resolved L2 graph and extracts ingest-eligible INCLUDE paths.
 * Excludes are skipped (stay L2-only). Non-eligible nodes are skipped within paths.
 * Logic block refs are resolved and extracted recursively.
 * The result is a set of DNF paths (OR of ANDs) that represent what this feed "wants."
 */
import type {
  FeedConfig,
  IngestGateBranch,
  IngestGateRule,
  L2RuleGroup,
  L2RuleNode,
  LogicBlockRef,
} from '@cfb/core-types'
import { isIngestEligibleNodeType, isViewerFollowRing, nodeRunsAtIngest } from '@cfb/core-types'
import { applyParametersToMatch, resolveFeedMatch } from '@cfb/l2-graph'
import { branchFromPrefilterNode } from './compile-prefilter.js'
import { dnfPathsFromRule } from './ingest-path-dnf.js'

/** Resolves a logic block ref to its internal rule graph. */
export type LogicBlockResolver = (ref: LogicBlockRef) => L2RuleGroup | null

/** Node types whose `op: 'excludes'` means we skip them (excludes stay L2-only). */
function isExcludeNode(node: L2RuleNode): boolean {
  if ('op' in node && node.op === 'excludes') return true
  return false
}

/** Check if a leaf node is ingest-eligible AND is an include (not exclude). */
function isStrictEligibleLeaf(node: L2RuleNode): boolean {
  if (
    node.type === 'group' ||
    node.type === 'graze_stub' ||
    node.type === 'logic_block_ref' ||
    node.type === 'parameters'
  ) {
    return false
  }
  if (!isIngestEligibleNodeType(node.type)) return false
  if (node.type === 'follow_ring' && isViewerFollowRing(node.hubSource)) return false
  if (isExcludeNode(node)) return false
  // Author not_in_list is a Filter gate only — never Discover/L1.
  if (node.type === 'author' && node.op === 'not_in_list') return false
  // Discover role (author/follow_ring) or other nodes that run at ingest.
  if (!nodeRunsAtIngest(node)) return false
  return true
}

/**
 * Recursively compile a node into an IngestGateRule for strict mode.
 * Skips exclude nodes and non-eligible nodes.
 * Resolves logic_block_ref nodes via the provided resolver.
 * Returns null if the node contributes nothing to the include gate.
 */
function compileStrictNode(
  feedId: string,
  node: L2RuleNode,
  resolver?: LogicBlockResolver,
): IngestGateRule | null {
  if (node.type === 'logic_block_ref') {
    if (!resolver) return null
    const resolved = resolver({ packageId: node.packageId, versionPin: node.versionPin })
    if (!resolved) return null
    const concrete = applyParametersToMatch(resolved, { values: node.paramValues })
    return compileStrictNode(feedId, concrete, resolver)
  }

  if (node.type === 'parameters') return null

  if (node.type === 'group') {
    const childRules: IngestGateRule[] = []
    for (const child of node.children) {
      const compiled = compileStrictNode(feedId, child, resolver)
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
export function extractStrictIncludePaths(
  feed: FeedConfig,
  resolver?: LogicBlockResolver,
): IngestGateBranch[][] {
  if (!feed.enabled) return []

  const match = applyParametersToMatch(resolveFeedMatch(feed))
  const orChildren: L2RuleNode[] = match.logic === 'any' ? match.children : [match]
  const paths: IngestGateBranch[][] = []

  for (const child of orChildren) {
    const compiled = compileStrictNode(feed.feedId, child, resolver)
    if (!compiled) continue
    paths.push(...dnfPathsFromRule(compiled))
  }

  // Note: substitute nodes do NOT inject a blanket post_kind allowance.
  // Instead, if substitution needs replies/quotes, we widen any post_kind
  // restrictions in existing paths so that replies/quotes matching keywords
  // can still enter the pool (substitution fires at L2 on posts that pass L1).
  const subKinds = collectSubstitutionKinds(match)
  if (subKinds.size > 0) {
    for (const path of paths) {
      for (const branch of path) {
        if (branch.type === 'post_kind') {
          for (const k of subKinds) {
            if (!branch.kinds.includes(k)) branch.kinds.push(k)
          }
        }
      }
    }
  }

  return paths.filter((p) => p.length > 0)
}

/** Collect post kinds needed by substitute nodes in a rule tree (for reference only). */
function collectSubstitutionKinds(node: L2RuleNode): Set<'reply' | 'quote'> {
  const kinds = new Set<'reply' | 'quote'>()
  function walk(n: L2RuleNode): void {
    if (n.type === 'substitute') {
      if (n.direction === 'reply_to_root' || n.direction === 'reply_to_parent' || n.direction === 'replied_to_repliers') {
        kinds.add('reply')
      }
      if (n.direction === 'quote_to_quoted' || n.direction === 'quoted_to_quoters') {
        kinds.add('quote')
      }
    }
    if (n.type === 'group') {
      for (const child of n.children) walk(child)
    }
  }
  walk(node)
  return kinds
}

/** Collect substitution kinds across all feeds (for widening restrictBranches). */
export function collectSubstitutionKindsFromFeeds(feeds: FeedConfig[]): Set<'reply' | 'quote'> {
  const kinds = new Set<'reply' | 'quote'>()
  for (const feed of feeds) {
    if (!feed.enabled) continue
    const match = resolveFeedMatch(feed)
    for (const k of collectSubstitutionKinds(match)) kinds.add(k)
  }
  return kinds
}
