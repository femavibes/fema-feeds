import type { FeedConfig, LogicBlockPackage, LogicBlockRef, L2RuleGroup, ProjectL1Config } from '@cfb/core-types'
import { resolveFeedMatch } from '@cfb/l2-graph'
import {
  applyStrictGate,
  compileStrictGate,
  type LogicBlockResolver,
  type StrictCompileResult,
} from '@cfb/l1-compile'
import {
  collectLogicBlockRefNodes,
  createFeedLogicBlockResolver,
  resolveLogicBlockVersionPin,
  type LogicBlockRefInFeed,
} from '@cfb/l2-eval'
import { getLatestLogicBlockPackagesByIds, getLogicBlockPackagesByRefs, type Pool } from '@cfb/storage-postgres'

function collectRefNodesFromFeeds(feeds: FeedConfig[]): LogicBlockRefInFeed[] {
  const seen = new Set<string>()
  const nodes: LogicBlockRefInFeed[] = []
  for (const feed of feeds) {
    if (!feed.enabled) continue
    for (const node of collectLogicBlockRefNodes(resolveFeedMatch(feed))) {
      const key = `${node.packageId}@${node.versionPin}`
      if (seen.has(key)) continue
      seen.add(key)
      nodes.push(node)
    }
  }
  return nodes
}

/** Load logic block packages referenced by feed match graphs (any visibility). */
export async function loadLogicBlockPackagesForFeeds(
  pool: Pool,
  feeds: FeedConfig[],
): Promise<LogicBlockPackage[]> {
  const refNodes = collectRefNodesFromFeeds(feeds)
  if (refNodes.length === 0) return []

  const packageIds = [...new Set(refNodes.map((r) => r.packageId))]
  const latestPackages = await getLatestLogicBlockPackagesByIds(pool, packageIds)
  const latestById = new Map(latestPackages.map((pkg) => [pkg.id, pkg.version]))

  const resolvedRefs = refNodes.map((node) => {
    const latest = latestById.get(node.packageId)
    const resolvedPin =
      latest != null
        ? resolveLogicBlockVersionPin(node.versionPin, latest, node.updatePolicy)
        : node.versionPin
    return {
      packageId: node.packageId,
      feedPin: node.versionPin,
      resolvedPin,
    }
  })

  return getLogicBlockPackagesByRefs(
    pool,
    resolvedRefs.map((r) => ({ packageId: r.packageId, versionPin: r.resolvedPin })),
  )
}

export function buildStrictGateLogicBlockResolver(
  packages: LogicBlockPackage[],
  feeds: FeedConfig[],
): LogicBlockResolver {
  const refNodes = collectRefNodesFromFeeds(feeds)
  const latestById = new Map(packages.map((pkg) => [pkg.id, pkg.version]))
  const feedRefs = refNodes.map((node) => {
    const latest = latestById.get(node.packageId) ?? node.versionPin
    const resolvedPin = resolveLogicBlockVersionPin(node.versionPin, latest, node.updatePolicy)
    return {
      packageId: node.packageId,
      feedPin: node.versionPin,
      resolvedPin,
    }
  })
  const base = createFeedLogicBlockResolver(packages, feedRefs)
  return (ref: LogicBlockRef): L2RuleGroup | null => base(ref)
}

/** Compile strict ingest gate with logic block refs resolved from the DB. */
export async function compileStrictGateForProject(
  pool: Pool,
  project: ProjectL1Config,
  feeds: FeedConfig[],
): Promise<StrictCompileResult> {
  const projectFeeds = feeds.filter((f) => f.projectId === project.projectId && f.enabled)
  const packages = await loadLogicBlockPackagesForFeeds(pool, projectFeeds)
  const resolver = packages.length > 0
    ? buildStrictGateLogicBlockResolver(packages, projectFeeds)
    : undefined
  return compileStrictGate(project, feeds, resolver)
}

export async function applyStrictGateForProject(
  pool: Pool,
  project: ProjectL1Config,
  feeds: FeedConfig[],
): Promise<ProjectL1Config> {
  const result = await compileStrictGateForProject(pool, project, feeds)
  return applyStrictGate(project, result)
}
