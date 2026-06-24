import type { L1StepId, ProjectL1Config } from '@cfb/core-types'

/** Compiled L1 — v1 wraps config; later adds indexes (keyword trie, author sets). */
export interface CompiledL1 {
  projectId: string
  config: ProjectL1Config
  /** Steps that any project in deployment uses — for global skip optimization. */
  activeSteps: L1StepId[]
}

export function compileProjectL1(config: ProjectL1Config): CompiledL1 {
  const activeSteps: L1StepId[] = []
  if (config.labels?.block?.length) activeSteps.push('labels')
  if (config.postKinds?.length) activeSteps.push('post_kind')
  if (config.authorLists?.length) activeSteps.push('author_allowlist')
  if (config.authorBlocklist?.length) activeSteps.push('author_blocklist')
  if (config.followRing) activeSteps.push('follow_ring')
  if (config.ingestGate) activeSteps.push('ingest_gate')
  if (config.language?.allow.length) activeSteps.push('language', 'language_unknown')
  if (config.hasVideo && config.hasVideo !== 'ignore') activeSteps.push('has_video')
  if (config.hasImage && config.hasImage !== 'ignore') activeSteps.push('has_image')
  if (config.hasLinkCard && config.hasLinkCard !== 'ignore') activeSteps.push('has_link_card')
  if (config.hashtagInclude?.length) activeSteps.push('hashtag_include')
  if (config.keywordInclude?.terms.length) activeSteps.push('keyword_include')
  return { projectId: config.projectId, config, activeSteps }
}

export function compileAllProjects(configs: ProjectL1Config[]): CompiledL1[] {
  return configs.filter((c) => c.enabled).map(compileProjectL1)
}
