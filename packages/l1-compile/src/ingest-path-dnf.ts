import type { FeedConfig, IngestGateAllRule, IngestGateBranch, IngestGateRule, L2RuleGroup, L2RuleNode } from '@cfb/core-types'
import { resolveFeedMatch } from '@cfb/l2-graph'
import { branchFromNode, classifyIngestBranchRole } from './ingest-rule-compile.js'
import { rulesSemanticallyEqual, semanticRuleKey } from './ingest-gate-optimize.js'
import { isIngestGateComposite, ingestCompositeChildren } from './ingest-gate-rules.js'

function groupMeta(feedId: string, node: L2RuleGroup): Pick<IngestGateAllRule, 'sourceFeedId' | 'sourceNodeId' | 'sourcePathId'> {
  return {
    sourceFeedId: feedId,
    sourceNodeId: node.id,
    sourcePathId: node.id.startsWith('path-') ? node.id : undefined,
  }
}

/** Compile L2 subtree to ingest rule tree — all pool-on leaves, no role stripping. */
export function compileIngestRuleFull(feedId: string, node: L2RuleNode): IngestGateRule | null {
  if (node.type === 'group') {
    const childRules: IngestGateRule[] = []
    for (const child of node.children) {
      const compiled = compileIngestRuleFull(feedId, child)
      if (compiled) childRules.push(compiled)
    }
    if (childRules.length === 0) return null
    const meta = groupMeta(feedId, node)
    switch (node.logic) {
      case 'any':
        return { type: 'any', rules: childRules, ...meta }
      case 'none':
        return { type: 'none', rules: childRules, ...meta }
      case 'n_of':
        return {
          type: 'n_of',
          rules: childRules,
          minPass: Math.max(1, node.minPass ?? 2),
          ...meta,
        }
      case 'all':
      default:
        return { type: 'all', rules: childRules, ...meta }
    }
  }
  return branchFromNode(feedId, node)
}

function cartesianAnd(lists: IngestGateBranch[][][]): IngestGateBranch[][] {
  if (lists.length === 0) return []
  let acc: IngestGateBranch[][] = [[]]
  for (const list of lists) {
    if (list.length === 0) return []
    const next: IngestGateBranch[][] = []
    for (const prefix of acc) {
      for (const path of list) {
        next.push([...prefix, ...path])
      }
    }
    acc = next
  }
  return acc
}

/** Expand a rule tree to DNF: OR of AND paths (leaf conjuncts). */
export function dnfPathsFromRule(rule: IngestGateRule): IngestGateBranch[][] {
  if (!isIngestGateComposite(rule)) {
    return [[rule]]
  }

  switch (rule.type) {
    case 'any': {
      const paths: IngestGateBranch[][] = []
      for (const child of ingestCompositeChildren(rule)) {
        paths.push(...dnfPathsFromRule(child))
      }
      return paths
    }
    case 'all': {
      const childPathLists = ingestCompositeChildren(rule).map((child) => dnfPathsFromRule(child))
      if (childPathLists.some((l) => l.length === 0)) return []
      return cartesianAnd(childPathLists)
    }
    default:
      return [[rule as unknown as IngestGateBranch]]
  }
}

export function collectIngestPathsFromFeed(feed: FeedConfig): IngestGateBranch[][] {
  const match = resolveFeedMatch(feed)
  const orChildren: L2RuleNode[] = match.logic === 'any' ? match.children : [match]
  const paths: IngestGateBranch[][] = []

  for (const child of orChildren) {
    const compiled = compileIngestRuleFull(feed.feedId, child)
    if (!compiled) continue
    paths.push(...dnfPathsFromRule(compiled))
  }

  return paths.filter((p) => p.length > 0)
}

export function extractMandatoryConjuncts(paths: IngestGateBranch[][]): IngestGateBranch[] {
  if (paths.length === 0) return []
  const first = paths[0]!
  const mandatory: IngestGateBranch[] = []

  for (const candidate of first) {
    const key = semanticRuleKey(candidate)
    if (paths.every((path) => path.some((c) => semanticRuleKey(c) === key))) {
      mandatory.push(candidate)
    }
  }

  const seen = new Set<string>()
  return mandatory.filter((b) => {
    const key = semanticRuleKey(b)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function stripMandatoryFromPaths(
  paths: IngestGateBranch[][],
  mandatory: IngestGateBranch[],
): IngestGateBranch[][] {
  return paths.map((path) =>
    path.filter((c) => !mandatory.some((m) => rulesSemanticallyEqual(m, c))),
  )
}

function pathToRule(conjuncts: IngestGateBranch[]): IngestGateRule | null {
  if (conjuncts.length === 0) return null
  if (conjuncts.length === 1) return conjuncts[0]!
  return { type: 'all', rules: conjuncts }
}

export function buildIngestGateFromPaths(allPaths: IngestGateBranch[][]): {
  restrictBranches: IngestGateBranch[]
  excludeBranches: IngestGateBranch[]
  includeBranches: IngestGateRule[]
} {
  const mandatory = extractMandatoryConjuncts(allPaths)
  const remaining = stripMandatoryFromPaths(allPaths, mandatory)

  const restrictBranches: IngestGateBranch[] = []
  const excludeBranches: IngestGateBranch[] = []
  const mandatoryDiscovery: IngestGateBranch[] = []

  for (const branch of mandatory) {
    const role = classifyIngestBranchRole(branch)
    if (role === 'exclude') excludeBranches.push(branch)
    else if (role === 'restrict') restrictBranches.push(branch)
    else mandatoryDiscovery.push(branch)
  }

  const orPaths = remaining.map(pathToRule).filter((r): r is IngestGateRule => r !== null)

  let includeBranches: IngestGateRule[]
  if (mandatoryDiscovery.length === 0) {
    includeBranches = orPaths
  } else if (orPaths.length === 0) {
    includeBranches = mandatoryDiscovery.length === 1
      ? [mandatoryDiscovery[0]!]
      : [{ type: 'all', rules: mandatoryDiscovery }]
  } else if (orPaths.length === 1) {
    includeBranches = [
      {
        type: 'all',
        rules: [...mandatoryDiscovery, orPaths[0]!],
      },
    ]
  } else {
    includeBranches = [
      {
        type: 'all',
        rules: [...mandatoryDiscovery, { type: 'any', rules: orPaths }],
      },
    ]
  }

  return { restrictBranches, excludeBranches, includeBranches }
}
