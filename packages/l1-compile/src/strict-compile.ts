/**
 * Strict Ingest Mode — Compilation
 *
 * Combines extracted include paths from all feeds in a project into a single
 * compiled ingest gate. Also handles logic block resolution.
 */
import type {
  CompiledIngestGate,
  FeedConfig,
  IngestGateBranch,
  ProjectL1Config,
  StrictGateMeta,
} from '@cfb/core-types'
import { buildIngestGateFromPaths } from './ingest-path-dnf.js'
import { optimizeIngestGate } from './ingest-gate-optimize.js'
import { extractStrictIncludePaths, type LogicBlockResolver } from './strict-extract.js'

export interface StrictCompileResult {
  strictIncludeGate: CompiledIngestGate
  strictGateMeta: StrictGateMeta
}

/**
 * Compile a strict include gate for a project from its feeds.
 * Each enabled feed's ingest-eligible include paths are OR'd together.
 */
export function compileStrictGate(
  project: ProjectL1Config,
  feeds: FeedConfig[],
  resolver?: LogicBlockResolver,
): StrictCompileResult {
  const projectFeeds = feeds.filter((f) => f.projectId === project.projectId && f.enabled)
  const allPaths: IngestGateBranch[][] = []
  const contributingFeeds: string[] = []

  for (const feed of projectFeeds) {
    const paths = extractStrictIncludePaths(feed, resolver)
    if (paths.length > 0) {
      allPaths.push(...paths)
      contributingFeeds.push(feed.feedId)
    }
  }

  const built = buildIngestGateFromPaths(allPaths)
  const gate = optimizeIngestGate({
    includeBranches: built.includeBranches,
    excludeBranches: built.excludeBranches,
    restrictBranches: built.restrictBranches,
  })

  return {
    strictIncludeGate: gate,
    strictGateMeta: {
      compiledAt: new Date().toISOString(),
      feedCount: projectFeeds.length,
      pathCount: allPaths.length,
      contributingFeeds,
    },
  }
}

/**
 * Apply strict compilation result to a project config.
 * Only modifies strict-related fields, leaves manual prefilter untouched.
 */
export function applyStrictGate(
  project: ProjectL1Config,
  result: StrictCompileResult,
): ProjectL1Config {
  return {
    ...project,
    strictIncludeGate: result.strictIncludeGate,
    strictGateMeta: result.strictGateMeta,
  }
}
