export type { CompiledL1 } from './compile.js'
export { compileProjectL1, compileAllProjects } from './compile.js'
export {
  compileProjectIngestGate,
  compileProjectIngestGateRaw,
  applyCompiledIngestGate,
  liveFeedsForProject,
  projectHasLiveFeeds,
  preserveCompiledIngestOnProjectSave,
  compileIngestRule,
  collectIngestRulesFromFeed,
  classifyIngestBranch,
  classifyIngestBranchRole,
  walkIngestBranches,
  collectAuthorIncludeBranches,
  collectFollowRingBranches,
  type CompileProjectL1Result,
} from './compile-from-feeds.js'
export {
  walkIngestBranches as walkCompiledIngestRules,
  ingestCompositeChildren,
  isIngestGateComposite,
} from './ingest-gate-rules.js'
export {
  optimizeIngestGate,
  semanticRuleKey,
  rulesSemanticallyEqual,
} from './ingest-gate-optimize.js'
export {
  compileIngestRuleFull,
  collectIngestPathsFromFeed,
  dnfPathsFromRule,
  extractMandatoryConjuncts,
  buildIngestGateFromPaths,
} from './ingest-path-dnf.js'
export {
  compileProjectPrefilter,
  compileProjectPrefilterRaw,
  finalizeProjectForSave,
  emptyPrefilter,
  normalizePrefilter,
  resolvePrefilterMatch,
  collectIngestPathsFromPrefilter,
  nodeIncludedInPrefilter,
  branchFromPrefilterNode,
} from './compile-prefilter.js'
export {
  formatIngestLeafLabel,
  formatBranchWithSource,
  formatIngestRuleLabel,
  groupDiscoveryPathsByFeed,
  groupIncludeBranchesByFeed,
  expandDiscoveryPaths,
  conjunctsForPath,
  flattenCombinedDiscoveryPaths,
  countDiscoveryPaths,
  jetstreamEvalSteps,
  ingestRuleEvalCost,
  type FeedIngestPathsGroup,
  type DiscoveryPathDisplay,
  type CombinedDiscoveryPath,
  type PathConjunctDisplay,
  type PathConjunctRole,
  type JetstreamEvalStep,
  type JetstreamEvalStepKind,
} from './ingest-gate-display.js'
