import type { FeedConfig, ProjectL1Config } from '@cfb/core-types'
import {
  collectAuthorIncludeBranches,
  collectFollowRingBranches,
} from '@cfb/l1-compile'
import { getAuthorListCache } from '@cfb/storage-postgres'
import type pg from 'pg'
import { followRingCacheListId, loadFollowRingsForFeed } from './follow-ring-cache.js'

/** Load follow-ring + author-list DIDs for compiled ingest_gate eval. */
export async function loadIngestGateExtrasForProject(
  pool: pg.Pool,
  project: ProjectL1Config,
  feeds: FeedConfig[],
): Promise<{
  followRingDids: Record<string, string[]>
  authorListDids: Record<string, string[]>
}> {
  const followRingDids: Record<string, string[]> = {}
  const authorListDids: Record<string, string[]> = {}

  const gate = project.ingestGate
  if (!gate) return { followRingDids, authorListDids }

  for (const branch of collectFollowRingBranches(gate.includeBranches)) {
    const nodeId = branch.sourceNodeId
    const feedId = branch.sourceFeedId
    if (!nodeId || !feedId) continue
    const feed = feeds.find((f) => f.feedId === feedId)
    if (!feed) continue
    const rings = await loadFollowRingsForFeed(pool, {
      ...feed,
      match: {
        type: 'group',
        id: 'ring',
        logic: 'all',
        children: [
          {
            type: 'follow_ring',
            id: nodeId,
            op: branch.op,
            hubSource: 'account',
            hub: branch.hub,
            direction: branch.direction,
            pollIntervalMinutes: branch.pollIntervalMinutes,
          },
        ],
      },
    })
    followRingDids[nodeId] = rings[nodeId] ?? []
  }

  for (const branch of collectAuthorIncludeBranches(gate.includeBranches)) {
    if (branch.listId) {
      const cached = await getAuthorListCache(pool, branch.listId)
      authorListDids[branch.listId] = cached?.dids ?? []
    } else if (branch.dids?.length) {
      const key = branch.sourceNodeId ?? 'manual'
      authorListDids[key] = branch.dids
    }
  }

  return { followRingDids, authorListDids }
}

export async function loadIngestGateExtrasForProjects(
  pool: pg.Pool,
  projects: ProjectL1Config[],
  feeds: FeedConfig[],
): Promise<
  Record<string, { followRingDids: Record<string, string[]>; authorListDids: Record<string, string[]> }>
> {
  const out: Record<
    string,
    { followRingDids: Record<string, string[]>; authorListDids: Record<string, string[]> }
  > = {}
  await Promise.all(
    projects.map(async (project) => {
      if (!project.ingestGate) return
      out[project.projectId] = await loadIngestGateExtrasForProject(pool, project, feeds)
    }),
  )
  return out
}

export { followRingCacheListId }
