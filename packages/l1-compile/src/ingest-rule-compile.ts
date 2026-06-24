import type {

  FeedConfig,

  IngestGateAllRule,

  IngestGateBranch,

  IngestGateRule,

  L2RuleGroup,

  L2RuleNode,

} from '@cfb/core-types'

import { nodeRunsAtIngest } from '@cfb/core-types'

import { resolveFeedMatch } from '@cfb/l2-graph'

import { semanticRuleKey } from './ingest-gate-optimize.js'
import { buildIngestGateFromPaths, collectIngestPathsFromFeed } from './ingest-path-dnf.js'



export function branchFromNode(feedId: string, node: L2RuleNode): IngestGateBranch | null {

  if (!nodeRunsAtIngest(node)) return null



  const meta = { sourceFeedId: feedId, sourceNodeId: node.id }



  switch (node.type) {

    case 'keyword':

      return {

        type: 'keyword',

        op: node.op,

        terms: [...node.terms],

        fields: [...node.fields],

        caseSensitive: node.caseSensitive,

        wholeWord: node.wholeWord,

        ...meta,

      }

    case 'regex':

      return {

        type: 'regex',

        op: node.op === 'matches' ? 'includes' : 'excludes',

        pattern: node.pattern,

        fields: [...node.fields],

        caseInsensitive: node.caseInsensitive,

        ...meta,

      }

    case 'hashtag':

      return {

        type: 'hashtag',

        op: node.op,

        tags: [...node.tags],

        ...meta,

      }

    case 'post_kind':

      if (node.op === 'is_not') return null

      return { type: 'post_kind', kinds: [...node.kinds], ...meta }

    case 'language':

      return {

        type: 'language',

        allow: [...node.allow],

        unknown: node.unknown,

        ...meta,

      }

    case 'bool':

      return {

        type: 'embed',

        field: node.field,

        required: node.value,

        ...meta,

      }

    case 'labels':

      return {

        type: 'labels',

        op: node.op,

        values: [...node.values],

        scope: node.scope,

        ...meta,

      }

    case 'follow_ring':

      return {

        type: 'follow_ring',

        op: node.op,

        hubSource: 'account',

        hub: node.hub,

        direction: node.direction,

        pollIntervalMinutes: node.pollIntervalMinutes,

        ...meta,

      }

    case 'author':

      return {

        type: 'author',

        op: node.op,

        listId: node.listId,

        dids: node.dids ? [...node.dids] : undefined,

        ...meta,

      }

    default:

      return null

  }

}



export function classifyIngestBranch(branch: IngestGateBranch): 'include' | 'exclude' {

  if (

    branch.type === 'keyword' ||

    branch.type === 'regex' ||

    branch.type === 'hashtag' ||

    branch.type === 'labels'

  ) {

    return branch.op === 'includes' ? 'include' : 'exclude'

  }

  if (branch.type === 'author') {

    return branch.op === 'in_list' ? 'include' : 'exclude'

  }

  if (branch.type === 'follow_ring') {

    return branch.op === 'includes' ? 'include' : 'exclude'

  }

  return 'include'

}



/** Jetstream role when pool is on: global reject, global AND requirement, or discovery OR path. */

export function classifyIngestBranchRole(branch: IngestGateBranch): 'exclude' | 'restrict' | 'discovery' {

  if (classifyIngestBranch(branch) === 'exclude') return 'exclude'

  switch (branch.type) {

    case 'language':

    case 'post_kind':

    case 'embed':

      return 'restrict'

    default:

      return 'discovery'

  }

}



function groupMeta(feedId: string, node: L2RuleGroup): Pick<IngestGateAllRule, 'sourceFeedId' | 'sourceNodeId' | 'sourcePathId'> {

  return {

    sourceFeedId: feedId,

    sourceNodeId: node.id,

    sourcePathId: node.id.startsWith('path-') ? node.id : undefined,

  }

}



/**

 * Compile one L2 subtree to an ingest rule tree.

 * Non-pool nodes are omitted (not failures). Group logic mirrors L2 eval.

 */

export function compileIngestRule(feedId: string, node: L2RuleNode): IngestGateRule | null {

  if (node.type === 'group') {

    const childRules: IngestGateRule[] = []

    for (const child of node.children) {

      const compiled = compileIngestRule(feedId, child)

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



  const branch = branchFromNode(feedId, node)

  if (!branch) return null

  const role = classifyIngestBranchRole(branch)

  if (role === 'exclude' || role === 'restrict') return null

  return branch

}



export function collectRestrictBranches(feedId: string, node: L2RuleNode): IngestGateBranch[] {

  if (node.type === 'group') {

    return node.children.flatMap((child) => collectRestrictBranches(feedId, child))

  }

  const branch = branchFromNode(feedId, node)

  if (branch && classifyIngestBranchRole(branch) === 'restrict') return [branch]

  return []

}



export function collectExcludeBranches(feedId: string, node: L2RuleNode): IngestGateBranch[] {

  if (node.type === 'group') {

    return node.children.flatMap((child) => collectExcludeBranches(feedId, child))

  }

  const branch = branchFromNode(feedId, node)

  if (branch && classifyIngestBranch(branch) === 'exclude') return [branch]

  return []

}



function dedupeBranchesBySemanticKey(branches: IngestGateBranch[]): IngestGateBranch[] {

  const seen = new Set<string>()

  const out: IngestGateBranch[] = []

  for (const branch of branches) {

    const key = semanticRuleKey(branch)

    if (seen.has(key)) continue

    seen.add(key)

    out.push(branch)

  }

  return out

}



/** Compile ingest rules from resolved feed match — path-first DNF merge. */
export function collectIngestRulesFromFeed(feed: FeedConfig): {
  includes: IngestGateRule[]
  excludes: IngestGateBranch[]
  restricts: IngestGateBranch[]
} {
  const paths = collectIngestPathsFromFeed(feed)
  const gate = buildIngestGateFromPaths(paths)
  return {
    includes: gate.includeBranches,
    excludes: gate.excludeBranches,
    restricts: gate.restrictBranches,
  }
}


