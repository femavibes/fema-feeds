import type { FeedConfig, L2EvalInput } from '@cfb/core-types'
import { resolveFeedMatch } from '@cfb/l2-graph'
import {
  collectLogicBlockRefNodes,
  createLogicBlockResolver,
  resolveLogicBlockVersionPin,
  type LogicBlockRefInFeed,
} from '@cfb/l2-eval'
import { getLatestLogicBlockPackagesByIds, getLogicBlockPackagesByRefs, type Pool } from '@cfb/storage-postgres'

export async function buildLogicBlockEvalInput(
  pool: Pool | null,
  feed: FeedConfig,
  base: L2EvalInput = {},
): Promise<L2EvalInput> {
  if (!pool) return base

  const match = resolveFeedMatch(feed)
  const refNodes = collectLogicBlockRefNodes(match)
  if (refNodes.length === 0) return base

  const packageIds = [...new Set(refNodes.map((r: LogicBlockRefInFeed) => r.packageId))]
  const latestPackages = await getLatestLogicBlockPackagesByIds(pool, packageIds)
  const latestById = new Map(latestPackages.map((pkg) => [pkg.id, pkg.version]))

  const refs = refNodes.map((node: LogicBlockRefInFeed) => {
    const latest = latestById.get(node.packageId)
    const versionPin =
      latest != null
        ? resolveLogicBlockVersionPin(node.versionPin, latest, node.updatePolicy)
        : node.versionPin
    return { packageId: node.packageId, versionPin }
  })

  const packages = await getLogicBlockPackagesByRefs(pool, refs)
  return { ...base, resolveLogicBlock: createLogicBlockResolver(packages) }
}
