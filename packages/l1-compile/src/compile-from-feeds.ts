import type {
  CompiledIngestGate,
  FeedConfig,
  IngestGateBranch,
  ProjectL1Config,
} from '@cfb/core-types'

import { walkRuleNodes } from '@cfb/l2-eval'

import { nodeRunsAtIngest } from '@cfb/core-types'

import { resolveFeedMatch } from '@cfb/l2-graph'

import { collectIngestPathsFromFeed, buildIngestGateFromPaths } from './ingest-path-dnf.js'
import { optimizeIngestGate, semanticRuleKey } from './ingest-gate-optimize.js'

function dedupeBranchesByKey(branches: CompiledIngestGate['excludeBranches']): CompiledIngestGate['excludeBranches'] {
  const seen = new Set<string>()
  const out: typeof branches = []
  for (const branch of branches) {
    const key = semanticRuleKey(branch)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(branch)
  }
  return out
}



export {

  compileIngestRule,

  collectIngestRulesFromFeed,

  classifyIngestBranch,

  collectExcludeBranches,

  collectRestrictBranches,

  classifyIngestBranchRole,

} from './ingest-rule-compile.js'

export {
  compileIngestRuleFull,
  collectIngestPathsFromFeed,
  dnfPathsFromRule,
  extractMandatoryConjuncts,
  buildIngestGateFromPaths,
} from './ingest-path-dnf.js'

export {
  walkIngestBranches,
  collectAuthorIncludeBranches,
  collectFollowRingBranches,
  isIngestGateComposite,
  ingestCompositeChildren,
} from './ingest-gate-rules.js'



export interface CompileProjectL1Result {

  ingestGate: CompiledIngestGate

  compiledL1Meta: { compiledAt: string; liveFeedIds?: string[]; source?: 'prefilter' | 'feeds' }

  authorsOnly?: boolean

  clearLegacyDiscoveryFields: true

}



export function liveFeedsForProject(projectId: string, feeds: FeedConfig[]): FeedConfig[] {

  return feeds.filter((f) => f.projectId === projectId && f.enabled)

}



function detectAuthorsOnly(feeds: FeedConfig[]): boolean {

  for (const feed of feeds) {

    for (const node of walkRuleNodes(resolveFeedMatch(feed))) {

      if (

        node.type === 'author' &&

        nodeRunsAtIngest(node) &&

        node.authorsOnly &&

        node.op === 'in_list'

      ) {

        return true

      }

    }

  }

  return false

}



export function compileProjectIngestGate(

  projectId: string,

  feeds: FeedConfig[],

): CompileProjectL1Result {

  const raw = compileProjectIngestGateRaw(projectId, feeds)

  return {

    ...raw,

    ingestGate: optimizeIngestGate(raw.ingestGate),

  }

}



/** Unoptimized merge — for tests; production uses {@link compileProjectIngestGate}. */

export function compileProjectIngestGateRaw(

  projectId: string,

  feeds: FeedConfig[],

): CompileProjectL1Result {

  const live = liveFeedsForProject(projectId, feeds)

  const allPaths: IngestGateBranch[][] = []
  for (const feed of live) {
    allPaths.push(...collectIngestPathsFromFeed(feed))
  }

  const built = buildIngestGateFromPaths(allPaths)

  return {

    ingestGate: {

      includeBranches: built.includeBranches,

      excludeBranches: dedupeBranchesByKey(built.excludeBranches),

      restrictBranches: dedupeBranchesByKey(built.restrictBranches),

    },

    compiledL1Meta: {
      compiledAt: new Date().toISOString(),
      source: 'feeds',
      liveFeedIds: live.map((f) => f.feedId),
    },

    authorsOnly: detectAuthorsOnly(live) || undefined,

    clearLegacyDiscoveryFields: true,

  }

}



export function applyCompiledIngestGate(

  project: ProjectL1Config,

  compiled: CompileProjectL1Result,

): ProjectL1Config {

  return {

    ...project,

    ingestGate: compiled.ingestGate,

    compiledL1Meta: compiled.compiledL1Meta,

    authorsOnly: compiled.authorsOnly,

    authorLists: undefined,

    keywordInclude: undefined,

    keywordExclude: undefined,

    hashtagInclude: undefined,

    hashtagExclude: undefined,

    followRing: undefined,

    postKinds: undefined,

    language: undefined,

    hasVideo: undefined,

    hasImage: undefined,

    hasLinkCard: undefined,

    hasQuote: undefined,

    hasRecord: undefined,

    hasTextOnly: undefined,

    labels: undefined,

  }

}



export function preserveCompiledIngestOnProjectSave(

  incoming: ProjectL1Config,

  existing: ProjectL1Config,

): ProjectL1Config {

  if (!existing.compiledL1Meta) return incoming

  return applyCompiledIngestGate(incoming, {

    ingestGate: existing.ingestGate ?? { includeBranches: [], excludeBranches: [], restrictBranches: [] },

    compiledL1Meta: existing.compiledL1Meta,

    authorsOnly: existing.authorsOnly,

    clearLegacyDiscoveryFields: true,

  })

}



export function projectHasLiveFeeds(project: ProjectL1Config, feeds: FeedConfig[]): boolean {

  return liveFeedsForProject(project.projectId, feeds).length > 0

}


