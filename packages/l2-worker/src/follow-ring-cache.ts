import type { FeedConfig, FollowRingDirection, L2FollowRingCondition, ProjectL1Config } from '@cfb/core-types'
import { formatFollowRingDirection, isViewerFollowRing, l1FollowRingNodeId } from '@cfb/core-types'
import { walkRuleNodes } from '@cfb/l2-eval'
import { isActorDid, normalizeActorRef, resolveActorsToDids } from '@cfb/profile-enrich'
import {
  fetchActorFollowersDids,
  fetchActorFollowsDids,
} from '@cfb/viewer-graph'
import {
  getAuthorListCache,
  getAuthorListCacheByRemotePollKey,
  listAuthorListsDueForPoll,
  syncAuthorListCacheByRemotePollKey,
  upsertAuthorListCache,
} from '@cfb/storage-postgres'
import type pg from 'pg'

export interface FollowRingSourceJson {
  kind: 'follow_ring'
  hub: string
  hubDid?: string
  direction: FollowRingDirection
  pollIntervalMinutes?: number
  nodeId: string
}

const DEFAULT_POLL_MINUTES = 60

export function followRingCacheListId(nodeId: string): string {
  return `follow_ring:${nodeId}`
}

export function followRingRemotePollKey(hubDid: string, direction: FollowRingDirection): string {
  return `follow_ring:${hubDid}:${direction}`
}

export function isFollowRingSourceJson(source: unknown): source is FollowRingSourceJson {
  return (
    !!source &&
    typeof source === 'object' &&
    (source as FollowRingSourceJson).kind === 'follow_ring'
  )
}

export function collectFollowRingNodes(feed: FeedConfig): L2FollowRingCondition[] {
  return walkRuleNodes(feed.match).filter(
    (n): n is L2FollowRingCondition =>
      n.type === 'follow_ring' && !isViewerFollowRing(n.hubSource),
  )
}

function isAccountFollowRingNode(node: L2FollowRingCondition): boolean {
  return !isViewerFollowRing(node.hubSource) && !!normalizeActorRef(node.hub ?? '')
}

export function projectFollowRingNode(project: ProjectL1Config): L2FollowRingCondition | null {
  const cfg = project.followRing
  if (!cfg || isViewerFollowRing(cfg.hubSource) || !cfg.hub?.trim()) return null
  return {
    type: 'follow_ring',
    id: l1FollowRingNodeId(project.projectId),
    op: cfg.op,
    hubSource: 'account',
    hub: cfg.hub,
    direction: cfg.direction,
    pollIntervalMinutes: cfg.pollIntervalMinutes,
  }
}

function stubFeedForProject(project: ProjectL1Config): FeedConfig {
  return {
    feedId: `l1:${project.projectId}`,
    projectId: project.projectId,
    name: project.name,
    enabled: project.enabled,
    poolScope: 'project_only',
    match: { type: 'group', id: 'stub', logic: 'all', children: [] },
  }
}

async function resolveHubDid(hub: string): Promise<string | null> {
  const ref = normalizeActorRef(hub)
  if (!ref) return null
  if (isActorDid(ref)) return ref
  const dids = await resolveActorsToDids([ref])
  return dids[0] ?? null
}

async function fetchRingDids(hubDid: string, direction: FollowRingDirection): Promise<string[]> {
  if (direction === 'both') {
    const [follows, followers] = await Promise.all([
      fetchActorFollowsDids(hubDid),
      fetchActorFollowersDids(hubDid),
    ])
    return [...new Set([...follows, ...followers])]
  }
  return direction === 'follows'
    ? fetchActorFollowsDids(hubDid)
    : fetchActorFollowersDids(hubDid)
}

function graphNameFor(node: L2FollowRingCondition, hubDid: string): string {
  const hub = normalizeActorRef(node.hub ?? '') || hubDid
  return `${hub} ${formatFollowRingDirection(node.direction)}`
}

function scheduleNextPoll(intervalMinutes: number, from = new Date()): Date {
  return new Date(from.getTime() + intervalMinutes * 60_000)
}

export async function refreshFollowRingCache(
  pool: pg.Pool,
  feed: FeedConfig,
  node: L2FollowRingCondition,
): Promise<string[]> {
  const hubDid = await resolveHubDid(node.hub ?? '')
  if (!hubDid) return []

  const interval = node.pollIntervalMinutes ?? DEFAULT_POLL_MINUTES
  const remotePollKey = followRingRemotePollKey(hubDid, node.direction)
  const listId = followRingCacheListId(node.id)
  const now = new Date()
  const nextPollAt = scheduleNextPoll(interval, now)

  const dids = await fetchRingDids(hubDid, node.direction)
  const sourceJson: FollowRingSourceJson = {
    kind: 'follow_ring',
    hub: node.hub ?? '',
    hubDid,
    direction: node.direction,
    pollIntervalMinutes: interval,
    nodeId: node.id,
  }
  const graphName = graphNameFor(node, hubDid)

  await upsertAuthorListCache(pool, {
    listId,
    projectId: feed.projectId,
    sourceJson,
    dids,
    memberCount: dids.length,
    graphName,
    refreshedAt: now,
    nextPollAt,
    remotePollKey,
  })

  await syncAuthorListCacheByRemotePollKey(pool, remotePollKey, {
    dids,
    memberCount: dids.length,
    graphName,
    refreshedAt: now,
    nextPollAt,
  })

  return dids
}

/** Ensure cache rows exist; refresh when empty or never polled. */
export async function seedFollowRingsFromFeeds(
  pool: pg.Pool,
  feeds: FeedConfig[],
): Promise<void> {
  for (const feed of feeds) {
    for (const node of collectFollowRingNodes(feed)) {
      if (!isAccountFollowRingNode(node)) continue
      const listId = followRingCacheListId(node.id)
      const existing = await getAuthorListCache(pool, listId)
      if (!existing || existing.dids.length === 0) {
        await refreshFollowRingCache(pool, feed, node)
      } else if (!existing.nextPollAt) {
        const interval = node.pollIntervalMinutes ?? DEFAULT_POLL_MINUTES
        await upsertAuthorListCache(pool, {
          listId,
          projectId: feed.projectId,
          sourceJson: existing.sourceJson,
          dids: existing.dids,
          memberCount: existing.memberCount,
          graphName: existing.graphName,
          refreshedAt: existing.refreshedAt,
          nextPollAt: scheduleNextPoll(interval),
          remotePollKey: existing.remotePollKey,
        })
      }
    }
  }
}

export async function loadFollowRingsForFeed(
  pool: pg.Pool,
  feed: FeedConfig,
): Promise<Record<string, string[]>> {
  const nodes = collectFollowRingNodes(feed)
  const out: Record<string, string[]> = {}
  await Promise.all(
    nodes.map(async (node) => {
      if (!isAccountFollowRingNode(node)) {
        out[node.id] = []
        return
      }
      const hubDid = await resolveHubDid(node.hub ?? '')
      if (!hubDid) {
        out[node.id] = []
        return
      }
      const remotePollKey = followRingRemotePollKey(hubDid, node.direction)
      const cached =
        (await getAuthorListCache(pool, followRingCacheListId(node.id))) ??
        (await getAuthorListCacheByRemotePollKey(pool, remotePollKey))
      if (cached?.dids.length) {
        out[node.id] = cached.dids
        return
      }
      out[node.id] = await refreshFollowRingCache(pool, feed, node)
    }),
  )
  return out
}

export async function loadFollowRingsForFeeds(
  pool: pg.Pool,
  feeds: FeedConfig[],
): Promise<Record<string, Record<string, string[]>>> {
  const out: Record<string, Record<string, string[]>> = {}
  await Promise.all(
    feeds.map(async (feed) => {
      out[feed.feedId] = await loadFollowRingsForFeed(pool, feed)
    }),
  )
  return out
}

/** Refresh follow-ring caches that are due. Returns count refreshed. */
export async function pollDueFollowRings(
  pool: pg.Pool,
  options?: { limit?: number },
): Promise<number> {
  const due = await listAuthorListsDueForPoll(pool, options?.limit ?? 50)
  let count = 0
  for (const row of due) {
    if (!isFollowRingSourceJson(row.sourceJson)) continue
    const src = row.sourceJson
    const hubDid = src.hubDid ?? (await resolveHubDid(src.hub))
    if (!hubDid) continue
    const dids = await fetchRingDids(hubDid, src.direction)
    const interval = src.pollIntervalMinutes ?? DEFAULT_POLL_MINUTES
    const now = new Date()
    const nextPollAt = scheduleNextPoll(interval, now)
    const remotePollKey = followRingRemotePollKey(hubDid, src.direction)
    const graphName = `${normalizeActorRef(src.hub) || hubDid} ${formatFollowRingDirection(src.direction)}`

    await upsertAuthorListCache(pool, {
      listId: row.listId,
      projectId: row.projectId,
      sourceJson: { ...src, hubDid },
      dids,
      memberCount: dids.length,
      graphName,
      refreshedAt: now,
      nextPollAt,
      remotePollKey,
    })
    await syncAuthorListCacheByRemotePollKey(pool, remotePollKey, {
      dids,
      memberCount: dids.length,
      graphName,
      refreshedAt: now,
      nextPollAt,
    })
    count++
  }
  return count
}

/** Ensure L1 account-hub follow rings are cached. */
export async function seedFollowRingsFromProjects(
  pool: pg.Pool,
  projects: ProjectL1Config[],
): Promise<void> {
  for (const project of projects) {
    if (!project.enabled) continue
    const node = projectFollowRingNode(project)
    if (!node) continue
    const feed = stubFeedForProject(project)
    const listId = followRingCacheListId(node.id)
    const existing = await getAuthorListCache(pool, listId)
    if (!existing || existing.dids.length === 0) {
      await refreshFollowRingCache(pool, feed, node)
    } else if (!existing.nextPollAt) {
      const interval = node.pollIntervalMinutes ?? DEFAULT_POLL_MINUTES
      await upsertAuthorListCache(pool, {
        listId,
        projectId: project.projectId,
        sourceJson: existing.sourceJson,
        dids: existing.dids,
        memberCount: existing.memberCount,
        graphName: existing.graphName,
        refreshedAt: existing.refreshedAt,
        nextPollAt: scheduleNextPoll(interval),
        remotePollKey: existing.remotePollKey,
      })
    }
  }
}

export async function loadL1FollowRingsForProjects(
  pool: pg.Pool,
  projects: ProjectL1Config[],
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {}
  await Promise.all(
    projects.map(async (project) => {
      if (!project.enabled) return
      const node = projectFollowRingNode(project)
      if (!node) return
      const feed = stubFeedForProject(project)
      const rings = await loadFollowRingsForFeed(pool, {
        ...feed,
        match: {
          type: 'group',
          id: 'ring',
          logic: 'all',
          children: [node],
        },
      })
      out[project.projectId] = rings[node.id] ?? []
    }),
  )
  return out
}
