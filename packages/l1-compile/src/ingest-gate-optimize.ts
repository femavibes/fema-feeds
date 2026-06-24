import type { CompiledIngestGate, IngestGateBranch, IngestGateRule } from '@cfb/core-types'
import { ingestCompositeChildren, isIngestGateComposite } from './ingest-gate-rules.js'

/** Relative eval cost (lower = run earlier for fail-fast). */
function evalCost(rule: IngestGateRule): number {
  if (isIngestGateComposite(rule)) {
    if (rule.type === 'all' || rule.type === 'any') {
      const kids = ingestCompositeChildren(rule)
      return kids.length ? Math.min(...kids.map(evalCost)) : 0
    }
    return 40
  }
  switch (rule.type) {
    case 'embed':
    case 'post_kind':
      return 1
    case 'language':
      return 2
    case 'hashtag':
      return 3
    case 'labels':
      return 4
    case 'author':
    case 'follow_ring':
      return 5
    case 'regex':
      return 8
    case 'keyword':
      return 9
    default:
      return 10
  }
}

function sortByEvalCost(rules: IngestGateRule[]): IngestGateRule[] {
  return [...rules].sort((a, b) => evalCost(a) - evalCost(b))
}

/** Semantic identity for hoisting/deduping (ignores feed/node provenance). */
export function semanticRuleKey(rule: IngestGateRule): string {
  if (isIngestGateComposite(rule)) {
    const kids = ingestCompositeChildren(rule)
      .map(semanticRuleKey)
      .sort()
      .join('\0')
    if (rule.type === 'n_of') return `n_of:${rule.minPass ?? 2}\0${kids}`
    return `${rule.type}\0${kids}`
  }
  const b = rule as IngestGateBranch
  switch (b.type) {
    case 'keyword':
      return `keyword\0${b.op}\0${b.terms.join(',')}\0${b.fields.join(',')}\0${b.caseSensitive ?? ''}\0${b.wholeWord ?? ''}`
    case 'regex':
      return `regex\0${b.op}\0${b.pattern}\0${b.fields.join(',')}\0${b.caseInsensitive ?? ''}`
    case 'hashtag':
      return `hashtag\0${b.op}\0${b.tags.join(',')}`
    case 'post_kind':
      return `post_kind\0${b.kinds.join(',')}`
    case 'language':
      return `language\0${b.allow.join(',')}\0${b.unknown}`
    case 'embed':
      return `embed\0${b.field}\0${b.required}`
    case 'labels':
      return `labels\0${b.op}\0${b.values.join(',')}\0${b.scope}`
    case 'follow_ring':
      return `follow_ring\0${b.op}\0${b.hubSource}\0${b.hub ?? ''}\0${b.direction}`
    case 'author':
      return `author\0${b.op}\0${b.listId ?? ''}\0${(b.dids ?? []).join(',')}`
    default:
      return 'unknown'
  }
}

export function rulesSemanticallyEqual(a: IngestGateRule, b: IngestGateRule): boolean {
  return semanticRuleKey(a) === semanticRuleKey(b)
}

function topLevelConjuncts(rule: IngestGateRule): IngestGateRule[] | null {
  if (isIngestGateComposite(rule)) {
    if (rule.type === 'all') return ingestCompositeChildren(rule)
    return null
  }
  return [rule]
}

function conjunctsToRule(rem: IngestGateRule[]): IngestGateRule {
  if (rem.length === 0) return { type: 'all', rules: [] }
  if (rem.length === 1) return rem[0]!
  return { type: 'all', rules: rem }
}

function intersectCommonConjuncts(lists: IngestGateRule[][]): IngestGateRule[] {
  if (lists.length === 0) return []
  const first = lists[0]!
  const common: IngestGateRule[] = []
  for (const candidate of first) {
    const key = semanticRuleKey(candidate)
    if (lists.every((list) => list.some((c) => semanticRuleKey(c) === key))) {
      common.push(candidate)
    }
  }
  return common
}

function optimizeRuleTree(rule: IngestGateRule): IngestGateRule {
  if (!isIngestGateComposite(rule)) return rule

  const children = sortByEvalCost(ingestCompositeChildren(rule).map(optimizeRuleTree))

  switch (rule.type) {
    case 'all':
      return { ...rule, rules: children, branches: undefined }
    case 'any':
      return { ...rule, rules: children }
    case 'none':
      return { ...rule, rules: children }
    case 'n_of':
      return { ...rule, rules: children }
    default:
      return rule
  }
}

function dedupeOrBranches(branches: IngestGateRule[]): IngestGateRule[] {
  const seen = new Set<string>()
  const out: IngestGateRule[] = []
  for (const branch of branches) {
    const key = semanticRuleKey(branch)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(branch)
  }
  return out
}

function hoistCommonConjuncts(branches: IngestGateRule[]): IngestGateRule[] {
  const deduped = dedupeOrBranches(branches)
  if (deduped.length <= 1) return deduped.map(optimizeRuleTree)

  const conjunctLists = deduped.map(topLevelConjuncts)
  if (conjunctLists.some((list) => list === null)) {
    return deduped.map(optimizeRuleTree)
  }

  const common = intersectCommonConjuncts(conjunctLists as IngestGateRule[][])
  if (common.length === 0) return deduped.map(optimizeRuleTree)

  const remainders = (conjunctLists as IngestGateRule[][]).map((list) => {
    const rem = list.filter(
      (c) => !common.some((cm) => rulesSemanticallyEqual(c, cm)),
    )
    return conjunctsToRule(rem)
  })

  const hoistedCommon = sortByEvalCost(common.map(optimizeRuleTree))
  const anyRemainders = remainders.map(optimizeRuleTree)

  if (anyRemainders.length === 1) {
    return [
      optimizeRuleTree({
        type: 'all',
        rules: [...hoistedCommon, anyRemainders[0]!],
      }),
    ]
  }

  return [
    optimizeRuleTree({
      type: 'all',
      rules: [
        ...hoistedCommon,
        { type: 'any', rules: anyRemainders },
      ],
    }),
  ]
}

function branchFeedId(rule: IngestGateRule): string {
  if (!isIngestGateComposite(rule)) return rule.sourceFeedId ?? 'unknown'
  if (rule.sourceFeedId) return rule.sourceFeedId
  for (const child of ingestCompositeChildren(rule)) {
    const id = branchFeedId(child)
    if (id !== 'unknown') return id
  }
  return 'unknown'
}

function groupBranchesByFeed(branches: IngestGateRule[]): Map<string, IngestGateRule[]> {
  const byFeed = new Map<string, IngestGateRule[]>()
  for (const branch of branches) {
    const feedId = branchFeedId(branch)
    byFeed.set(feedId, [...(byFeed.get(feedId) ?? []), branch])
  }
  return byFeed
}

/**
 * Optimize a compiled ingest gate without changing match semantics.
 * - Hoists shared conjuncts within each feed's paths (not across feeds)
 * - Dedupes identical OR paths
 * - Orders restrict/exclude branches and AND children cheap-first for fail-fast eval
 */
export function optimizeIngestGate(gate: CompiledIngestGate): CompiledIngestGate {
  const byFeed = groupBranchesByFeed(gate.includeBranches)
  const optimized: IngestGateRule[] = []

  for (const branches of byFeed.values()) {
    if (branches.length === 1) {
      optimized.push(optimizeRuleTree(branches[0]!))
    } else {
      optimized.push(...hoistCommonConjuncts(branches))
    }
  }

  const restrictBranches = sortByEvalCost([...(gate.restrictBranches ?? [])]) as IngestGateBranch[]
  const excludeBranches = sortByEvalCost([...gate.excludeBranches]) as IngestGateBranch[]

  return {
    includeBranches: dedupeOrBranches(optimized),
    excludeBranches,
    restrictBranches,
  }
}
