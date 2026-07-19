import type { CompiledIngestGate, FeedConfig, L2MentionCondition, ProjectL1Config } from '@cfb/core-types'
import {
  collectAuthorIncludeBranches,
  collectFollowRingBranches,
  collectMentionBranches,
  compileStrictGate,
} from '@cfb/l1-compile'
import { getAuthorListCache } from '@cfb/storage-postgres'
import type pg from 'pg'
import { followRingCacheListId, loadFollowRingsForFeed } from './follow-ring-cache.js'
import { getCachedDidList, setCachedDidList } from './did-list-mem-cache.js'
import { resolveMentionNodeDids } from './mention-accounts.js'

function gateForExtras(project: ProjectL1Config, feeds: FeedConfig[]): CompiledIngestGate | null {
  // Strict projects: always compile from *enabled* feeds so extras match
  // buildStrictGates / postPassesStrictGate (not a stale/empty ingestGate).
  if (project.prefilterMode === 'strict') {
    return compileStrictGate(project, feeds).strictIncludeGate
  }
  if (project.ingestGate) return project.ingestGate
  return null
}

export type IngestGateExtras = {
  followRingDids: Record<string, string[] | ReadonlySet<string>>
  authorListDids: Record<string, Set<string>>
  mentionDids: Record<string, Set<string>>
}

/** Load follow-ring + author-list + mention DIDs for compiled ingest_gate / strict gate eval. */
export async function loadIngestGateExtrasForProject(
  pool: pg.Pool,
  project: ProjectL1Config,
  feeds: FeedConfig[],
): Promise<IngestGateExtras> {
  const followRingDids: Record<string, string[] | ReadonlySet<string>> = {}
  const authorListDids: Record<string, Set<string>> = {}
  const mentionDids: Record<string, Set<string>> = {}

  const gate = gateForExtras(project, feeds)
  if (!gate) return { followRingDids, authorListDids, mentionDids }

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
    const dids = rings[nodeId] ?? []
    followRingDids[nodeId] = getCachedDidList(`ring:${nodeId}`)?.set ?? new Set(dids)
  }

  for (const branch of collectAuthorIncludeBranches(gate.includeBranches)) {
    if (branch.listId) {
      const mem = getCachedDidList(`author:${branch.listId}`)
      const dids = mem?.dids ?? (await getAuthorListCache(pool, branch.listId))?.dids ?? []
      const set = mem ? new Set(mem.set) : setCachedDidList(`author:${branch.listId}`, dids).set
      const mutable = new Set(set)
      for (const d of branch.dids ?? []) mutable.add(d)
      authorListDids[branch.listId] = mutable
    } else if (branch.dids?.length) {
      const key = branch.sourceNodeId ?? 'manual'
      authorListDids[key] = new Set(branch.dids)
    }
  }

  const mentionBranches = [
    ...collectMentionBranches(gate.includeBranches),
    ...collectMentionBranches(gate.excludeBranches),
    ...collectMentionBranches(gate.restrictBranches ?? []),
  ]
  await Promise.all(
    mentionBranches.map(async (branch) => {
      const nodeId = branch.sourceNodeId
      if (!nodeId || mentionDids[nodeId]) return
      const stub: L2MentionCondition = {
        type: 'mention',
        id: nodeId,
        op: branch.op,
        accounts: branch.accounts ?? branch.dids ?? [],
        listUri: branch.listUri,
      }
      const dids = await resolveMentionNodeDids(pool, stub)
      for (const d of branch.dids ?? []) dids.push(d)
      mentionDids[nodeId] = new Set(dids)
    }),
  )

  return { followRingDids, authorListDids, mentionDids }
}

export async function loadIngestGateExtrasForProjects(
  pool: pg.Pool,
  projects: ProjectL1Config[],
  feeds: FeedConfig[],
): Promise<Record<string, IngestGateExtras>> {
  const out: Record<string, IngestGateExtras> = {}
  await Promise.all(
    projects.map(async (project) => {
      if (!project.ingestGate && project.prefilterMode !== 'strict' && !project.strictIncludeGate) {
        return
      }
      out[project.projectId] = await loadIngestGateExtrasForProject(pool, project, feeds)
    }),
  )
  return out
}

export { followRingCacheListId }
