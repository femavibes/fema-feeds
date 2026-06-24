import type { CompiledIngestGate, IngestGateBranch, IngestGateRule } from '@cfb/core-types'
import { classifyIngestBranchRole } from './ingest-rule-compile.js'
import { ingestCompositeChildren, isIngestGateComposite } from './ingest-gate-rules.js'
import { semanticRuleKey } from './ingest-gate-optimize.js'

/** Relative eval cost (lower = cheaper). Mirrors optimize ordering. */
export function ingestRuleEvalCost(rule: IngestGateRule): number {
  if (isIngestGateComposite(rule)) {
    if (rule.type === 'all' || rule.type === 'any') {
      const kids = ingestCompositeChildren(rule)
      return kids.length ? Math.min(...kids.map(ingestRuleEvalCost)) : 0
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

export function formatIngestLeafLabel(branch: IngestGateBranch): string {
  switch (branch.type) {
    case 'keyword':
      return `Keyword ${branch.op}: ${branch.terms.join(', ') || '…'}`
    case 'regex':
      return `Regex ${branch.op}: /${branch.pattern}/`
    case 'hashtag':
      return `Hashtag ${branch.op}: ${branch.tags.map((t) => `#${t}`).join(', ') || '…'}`
    case 'post_kind':
      return `Post kind: ${branch.kinds.join(', ')}`
    case 'language': {
      const langs = branch.allow.join(', ')
      const noTagPolicy =
        branch.unknown === 'exclude' ? 'no language tag → fail' : 'no language tag → pass'
      return `Language: ${langs} · ${noTagPolicy}`
    }
    case 'embed':
      return `${branch.field.replace(/_/g, ' ')}: ${branch.required ? 'required' : 'excluded'}`
    case 'labels':
      return `Labels ${branch.op}: ${branch.values.join(', ')}`
    case 'follow_ring':
      return `Follow ring ${branch.op} · ${branch.hub ?? 'hub'} · ${branch.direction}`
    case 'author':
      return branch.listId
        ? `Author ${branch.op}: list “${branch.listId}”`
        : `Author ${branch.op}: ${branch.dids?.length ?? 0} DIDs`
    default:
      return 'Rule'
  }
}

export function formatBranchWithSource(
  branch: IngestGateBranch,
  feedNames: Record<string, string>,
): string {
  const label = formatIngestLeafLabel(branch)
  if (!branch.sourceFeedId) return label
  const feedName = feedNames[branch.sourceFeedId] ?? branch.sourceFeedId
  return `${label} · from ${feedName}`
}

export function formatIngestRuleLabel(rule: IngestGateRule): string {
  if (!isIngestGateComposite(rule)) return formatIngestLeafLabel(rule)

  const joiner =
    rule.type === 'all'
      ? ' ∧ '
      : rule.type === 'any'
        ? ' ∨ '
        : rule.type === 'none'
          ? ' ⊕¬ '
          : ` ·${rule.minPass}-of· `
  const parts = ingestCompositeChildren(rule)
    .map(formatIngestRuleLabel)
    .filter((p) => p.trim().length > 0)
  if (parts.length === 0) return ''
  const joined = parts.join(joiner)
  const wrapped = rule.type === 'any' || rule.type === 'none' ? `(${joined})` : joined
  const prefix = rule.type === 'n_of' ? `${rule.minPass} of: ` : rule.type === 'none' ? 'NOT ' : ''
  return `${prefix}${wrapped}`
}

function firstSourceFeedId(rule: IngestGateRule): string | undefined {
  if (!isIngestGateComposite(rule)) return rule.sourceFeedId
  if (rule.sourceFeedId) return rule.sourceFeedId
  for (const child of ingestCompositeChildren(rule)) {
    const id = firstSourceFeedId(child)
    if (id) return id
  }
  return undefined
}

function conjunctsToAll(rules: IngestGateRule[]): IngestGateRule {
  if (rules.length === 0) return { type: 'all', rules: [] }
  if (rules.length === 1) return rules[0]!
  return { type: 'all', rules }
}

/**
 * Expand compiled include rules into flat OR paths for display.
 * Handles optimized ALL(shared, ANY(path₁, path₂, …)) as separate labeled paths.
 */
export function expandDiscoveryPaths(rule: IngestGateRule): IngestGateRule[] {
  if (!isIngestGateComposite(rule)) return [rule]

  if (rule.type === 'any') {
    return ingestCompositeChildren(rule).flatMap(expandDiscoveryPaths)
  }

  if (rule.type === 'all') {
    const children = ingestCompositeChildren(rule)
    const anyChild = children.find(
      (c): c is Extract<IngestGateRule, { type: 'any' }> =>
        isIngestGateComposite(c) && c.type === 'any',
    )
    if (anyChild) {
      const shared = children.filter((c) => c !== anyChild)
      return anyChild.rules.map((branch) => conjunctsToAll([...shared, branch]))
    }
    return [rule]
  }

  return [rule]
}

export function countDiscoveryPaths(gate: CompiledIngestGate): number {
  return gate.includeBranches.reduce((n, rule) => n + expandDiscoveryPaths(rule).length, 0)
}

export type PathConjunctRole = 'requirement' | 'block' | 'discovery'

export interface PathConjunctDisplay {
  role: PathConjunctRole
  label: string
}

export interface DiscoveryPathDisplay {
  conjuncts: PathConjunctDisplay[]
}

function pathConjunctRole(branch: IngestGateBranch): PathConjunctRole {
  const role = classifyIngestBranchRole(branch)
  if (role === 'exclude') return 'block'
  if (role === 'restrict') return 'requirement'
  return 'discovery'
}

/** Flatten a path rule into labeled conjuncts for UI (no trailing ∧). */
export function conjunctsForPath(rule: IngestGateRule): PathConjunctDisplay[] {
  if (!isIngestGateComposite(rule)) {
    return [{ role: pathConjunctRole(rule), label: formatIngestLeafLabel(rule) }]
  }
  if (rule.type === 'all') {
    return ingestCompositeChildren(rule).flatMap(conjunctsForPath)
  }
  const label = formatIngestRuleLabel(rule)
  if (!label.trim()) return []
  return [{ role: 'discovery', label }]
}

function pathDisplayKey(conjuncts: PathConjunctDisplay[]): string {
  return conjuncts.map((c) => `${c.role}:${c.label}`).join('\0')
}

export interface FeedIngestPathsGroup {
  feedId: string
  feedName: string
  /** @deprecated Use structuredPaths */
  paths: string[]
  structuredPaths: DiscoveryPathDisplay[]
}

export interface CombinedDiscoveryPath {
  order: number
  feedId: string
  feedName: string
  conjuncts: PathConjunctDisplay[]
}

/**
 * Flat OR list across all feeds — this is how jetstream actually tries paths (one combined gate).
 */
export function flattenCombinedDiscoveryPaths(
  gate: CompiledIngestGate,
  feedNames: Record<string, string>,
): CombinedDiscoveryPath[] {
  const out: CombinedDiscoveryPath[] = []
  for (const rule of gate.includeBranches) {
    const feedId = firstSourceFeedId(rule) ?? 'unknown'
    const feedName = feedNames[feedId] ?? feedId
    for (const pathRule of expandDiscoveryPaths(rule)) {
      const conjuncts = conjunctsForPath(pathRule)
      if (conjuncts.length === 0) continue
      out.push({ order: out.length + 1, feedId, feedName, conjuncts })
    }
  }
  return out
}

/** Per-feed discovery OR paths (expanded for display). */
export function groupDiscoveryPathsByFeed(
  gate: CompiledIngestGate,
  feedNames: Record<string, string>,
): FeedIngestPathsGroup[] {
  const byFeed = new Map<string, DiscoveryPathDisplay[]>()
  for (const rule of gate.includeBranches) {
    const feedId = firstSourceFeedId(rule) ?? 'unknown'
    const expanded = expandDiscoveryPaths(rule)
    const structured = expanded
      .map((pathRule) => ({ conjuncts: conjunctsForPath(pathRule) }))
      .filter((p) => p.conjuncts.length > 0)

    const seen = new Set((byFeed.get(feedId) ?? []).map((p) => pathDisplayKey(p.conjuncts)))
    const unique: DiscoveryPathDisplay[] = [...(byFeed.get(feedId) ?? [])]
    for (const path of structured) {
      const key = pathDisplayKey(path.conjuncts)
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(path)
    }
    byFeed.set(feedId, unique)
  }
  return [...byFeed.entries()].map(([feedId, structuredPaths]) => ({
    feedId,
    feedName: feedNames[feedId] ?? feedId,
    structuredPaths,
    paths: structuredPaths.map((p) =>
      p.conjuncts.map((c) => c.label).join(' + '),
    ),
  }))
}

/** @deprecated Use {@link groupDiscoveryPathsByFeed} */
export const groupIncludeBranchesByFeed = groupDiscoveryPathsByFeed

export type JetstreamEvalStepKind = 'authors-only' | 'exclude' | 'restrict' | 'or-path'

export interface JetstreamEvalStep {
  kind: JetstreamEvalStepKind
  order: number
  label: string
  hint?: string
}

/** Compact execution pipeline — does not duplicate per-path discovery detail. */
export function jetstreamEvalSteps(
  gate: CompiledIngestGate,
  authorsOnly?: boolean,
  feedNames: Record<string, string> = {},
): JetstreamEvalStep[] {
  const steps: JetstreamEvalStep[] = []
  let order = 1
  const hasDiscovery = gate.includeBranches.length > 0

  if (authorsOnly && hasDiscovery) {
    steps.push({
      kind: 'authors-only',
      order: order++,
      label: 'Authors only',
      hint: 'Strangers fail first — union of all author in-list branches across feeds',
    })
  }

  for (const branch of gate.restrictBranches ?? []) {
    steps.push({
      kind: 'restrict',
      order: order++,
      label: formatBranchWithSource(branch, feedNames),
      hint: 'Whole project — must pass before blocks and discovery',
    })
  }

  for (const branch of gate.excludeBranches) {
    steps.push({
      kind: 'exclude',
      order: order++,
      label: formatBranchWithSource(branch, feedNames),
      hint: 'Whole project — reject if matched',
    })
  }

  const pathCount = countDiscoveryPaths(gate)

  if (pathCount > 0) {
    steps.push({
      kind: 'or-path',
      order: order++,
      label:
        pathCount === 1
          ? 'Match the one discovery path'
          : `Match any of ${pathCount} discovery paths`,
      hint: 'OR across feeds — details in Discovery paths below',
    })
  } else if (
    gate.includeBranches.length === 0 &&
    (gate.excludeBranches.length > 0 || (gate.restrictBranches?.length ?? 0) > 0)
  ) {
    steps.push({
      kind: 'or-path',
      order: order++,
      label: 'No discovery paths — post enters if blocks and requirements pass',
      hint: 'No keyword/hashtag/author discovery rules with jetstream filter on',
    })
  } else if (gate.includeBranches.length === 0) {
    steps.push({
      kind: 'or-path',
      order: order++,
      label: 'No jetstream filters — all posts can enter',
      hint: 'Permissive pool',
    })
  }

  return steps
}
