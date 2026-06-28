import type {
  IngestGateAllRule,
  IngestGateBranch,
  IngestGateRule,
  L2RuleGroup,
  L2RuleNode,
  ProjectL1Config,
  ProjectPrefilter,
} from '@cfb/core-types'
import { PROJECT_PREFILTER_SCOPE_ID, isIngestEligibleNodeType, isViewerFollowRing } from '@cfb/core-types'
import { resolveFeedMatch, normalizeCanvasFeedStorage, sanitizeCanvasEdges } from '@cfb/l2-graph'
import { walkRuleNodes } from '@cfb/l2-eval'
import { buildIngestGateFromPaths, dnfPathsFromRule } from './ingest-path-dnf.js'
import { optimizeIngestGate } from './ingest-gate-optimize.js'
import type { CompileProjectL1Result } from './compile-from-feeds.js'
import { applyCompiledIngestGate } from './compile-from-feeds.js'

function groupMeta(scopeId: string, node: L2RuleGroup): Pick<IngestGateAllRule, 'sourceFeedId' | 'sourceNodeId' | 'sourcePathId'> {
  return {
    sourceFeedId: scopeId,
    sourceNodeId: node.id,
    sourcePathId: node.id.startsWith('path-') ? node.id : undefined,
  }
}

/** Prefilter leaves always participate in ingest — no per-node pool toggle. */
export function nodeIncludedInPrefilter(node: L2RuleNode): boolean {
  if (node.type === 'group' || node.type === 'graze_stub' || node.type === 'logic_block_ref') {
    return false
  }
  if (!isIngestEligibleNodeType(node.type)) return false
  if (node.type === 'follow_ring' && isViewerFollowRing(node.hubSource)) return false
  return true
}

export function branchFromPrefilterNode(scopeId: string, node: L2RuleNode): IngestGateBranch | null {
  if (!nodeIncludedInPrefilter(node)) return null

  const meta = { sourceFeedId: scopeId, sourceNodeId: node.id }

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
      return { type: 'hashtag', op: node.op, tags: [...node.tags], ...meta }
    case 'post_kind':
      return { type: 'post_kind', kinds: [...node.kinds], ...meta }
    case 'language':
      return { type: 'language', allow: [...node.allow], unknown: node.unknown, ...meta }
    case 'bool':
      return { type: 'embed', field: node.field, required: node.value, ...meta }
    case 'labels':
      return {
        type: 'labels',
        op: node.op,
        values: [...node.values],
        scope: node.scope ?? 'any',
        ...meta,
      }
    case 'follow_ring':
      return {
        type: 'follow_ring',
        op: node.op,
        hubSource: node.hubSource ?? 'account',
        hub: node.hub,
        direction: node.direction,
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
    case 'url':
      return {
        type: 'url',
        op: node.op,
        patterns: [...node.patterns],
        sources: [...node.sources],
        caseSensitive: node.caseSensitive,
        ...meta,
      }
    default:
      return null
  }
}

function compilePrefilterRuleFull(scopeId: string, node: L2RuleNode): IngestGateRule | null {
  if (node.type === 'group') {
    const childRules: IngestGateRule[] = []
    for (const child of node.children) {
      const compiled = compilePrefilterRuleFull(scopeId, child)
      if (compiled) childRules.push(compiled)
    }
    if (childRules.length === 0) return null
    const meta = groupMeta(scopeId, node)
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
  return branchFromPrefilterNode(scopeId, node)
}

export function emptyPrefilter(): ProjectPrefilter {
  return {
    match: {
      type: 'group',
      id: 'prefilter-root',
      logic: 'any',
      children: [],
    },
  }
}

/** Normalize match tree and drop canvas wires that target nested (non-top-level) nodes. */
export function normalizePrefilter(prefilter: ProjectPrefilter): ProjectPrefilter {
  if (!prefilter.visualLayout?.edges?.length) return prefilter
  const match = normalizeCanvasFeedStorage(prefilter.match)
  const edges = sanitizeCanvasEdges(match, prefilter.visualLayout.edges)
  return {
    ...prefilter,
    match,
    visualLayout: { ...prefilter.visualLayout, edges },
  }
}

export function resolvePrefilterMatch(prefilter: ProjectPrefilter): L2RuleGroup {
  return resolveFeedMatch({
    match: prefilter.match,
    visualLayout: prefilter.visualLayout,
  } as Pick<import('@cfb/core-types').FeedConfig, 'match' | 'visualLayout'>)
}

export function collectIngestPathsFromPrefilter(
  scopeId: string,
  prefilter: ProjectPrefilter,
): IngestGateBranch[][] {
  const match = resolvePrefilterMatch(prefilter)
  const orChildren: L2RuleNode[] = match.logic === 'any' ? match.children : [match]
  const paths: IngestGateBranch[][] = []

  for (const child of orChildren) {
    const compiled = compilePrefilterRuleFull(scopeId, child)
    if (!compiled) continue
    paths.push(...dnfPathsFromRule(compiled))
  }

  return paths.filter((p) => p.length > 0)
}

function detectAuthorsOnlyFromPrefilter(prefilter: ProjectPrefilter): boolean {
  const match = resolvePrefilterMatch(prefilter)
  for (const node of walkRuleNodes(match)) {
    if (node.type === 'author' && node.authorsOnly && node.op === 'in_list') {
      return true
    }
  }
  return false
}

export function compileProjectPrefilterRaw(
  projectId: string,
  prefilter: ProjectPrefilter | undefined,
): CompileProjectL1Result {
  const graph = prefilter ?? emptyPrefilter()
  const scopeId = PROJECT_PREFILTER_SCOPE_ID
  const allPaths = collectIngestPathsFromPrefilter(scopeId, graph)
  const built = buildIngestGateFromPaths(allPaths)

  return {
    ingestGate: {
      includeBranches: built.includeBranches,
      excludeBranches: built.excludeBranches,
      restrictBranches: built.restrictBranches,
    },
    compiledL1Meta: {
      compiledAt: new Date().toISOString(),
      source: 'prefilter',
    },
    authorsOnly: detectAuthorsOnlyFromPrefilter(graph) || undefined,
    clearLegacyDiscoveryFields: true,
  }
}

export function compileProjectPrefilter(
  projectId: string,
  prefilter: ProjectPrefilter | undefined,
): CompileProjectL1Result {
  const raw = compileProjectPrefilterRaw(projectId, prefilter)
  return {
    ...raw,
    ingestGate: optimizeIngestGate(raw.ingestGate),
  }
}

/** Compile prefilter on save; preserve legacy feed-compiled gate until prefilter is introduced. */
export function finalizeProjectForSave(
  incoming: ProjectL1Config,
  existing?: ProjectL1Config,
): ProjectL1Config {
  const hasPrefilterField = incoming.prefilter !== undefined
  const legacyFeedCompile =
    !hasPrefilterField &&
    existing?.compiledL1Meta?.source !== 'prefilter' &&
    existing?.compiledL1Meta != null

  if (legacyFeedCompile) {
    return applyCompiledIngestGate(incoming, {
      ingestGate:
        existing.ingestGate ?? { includeBranches: [], excludeBranches: [], restrictBranches: [] },
      compiledL1Meta: existing.compiledL1Meta!,
      authorsOnly: existing.authorsOnly,
      clearLegacyDiscoveryFields: true,
    })
  }

  const prefilter = normalizePrefilter(incoming.prefilter ?? emptyPrefilter())
  const compiled = compileProjectPrefilter(incoming.projectId, prefilter)
  return applyCompiledIngestGate({ ...incoming, prefilter }, compiled)
}
