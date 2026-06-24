import type { AuthorListConfig, FeedAuthorListConfig, FeedConfig, ProjectL1Config } from '@cfb/core-types'
import { getPollIntervalMinutes, resolveAuthorListForCache, type ListResolveOptions } from '@cfb/list-sources'
import type pg from 'pg'
import {
  getAllAuthorListCache,
  getAuthorListCacheByRemotePollKey,
  listAuthorListsDueForPoll,
  syncAuthorListCacheByRemotePollKey,
  upsertAuthorListCache,
} from '@cfb/storage-postgres'
import {
  authorListFromSourceJson,
  buildAuthorListSourceJson,
  buildFeedAuthorListSourceJson,
  listHasRemoteSources,
  remotePollKeyFromSourceJson,
  type AuthorListSourceJson,
} from './source-json.js'
import { hydrateProjectsWithCache, cacheMapFromRows } from './hydrate.js'

function feedListHasContent(list: FeedAuthorListConfig): boolean {
  const remote = list.sources?.find(
    (s) => s.type === 'bluesky_list' || s.type === 'bluesky_starter_pack',
  )
  const uri = remote && 'uri' in remote ? remote.uri.trim() : ''
  const manualFromSources = (list.sources ?? [])
    .filter((s) => s.type === 'manual_dids')
    .flatMap((s) => s.dids)
  const manual = [...manualFromSources, ...(list.dids ?? [])]
  return !!uri || manual.length > 0
}

export {
  buildAuthorListSourceJson,
  buildFeedAuthorListSourceJson,
  authorListFromSourceJson,
  feedAuthorListFromSourceJson,
  listHasRemoteSources,
  remotePollKeyFromSourceJson,
  type AuthorListSourceJson,
} from './source-json.js'
export { hydrateProjectsWithCache, cacheMapFromRows, type CachedAuthorList } from './hydrate.js'

function scheduleNextPoll(intervalMinutes: number, from = new Date()): Date {
  return new Date(from.getTime() + intervalMinutes * 60_000)
}

async function reuseRemotePollCache(
  pool: pg.Pool,
  remotePollKey: string,
): Promise<{ dids: string[]; graphName: string | null; refreshedAt: Date; nextPollAt: Date | null } | null> {
  const existing = await getAuthorListCacheByRemotePollKey(pool, remotePollKey)
  if (!existing) return null
  return {
    dids: existing.dids,
    graphName: existing.graphName,
    refreshedAt: existing.refreshedAt ?? new Date(),
    nextPollAt: existing.nextPollAt,
  }
}

async function upsertListEntry(
  pool: pg.Pool,
  input: {
    listId: string
    projectId: string
    sourceJson: AuthorListSourceJson
    list: AuthorListConfig
  },
  options?: ListResolveOptions,
): Promise<void> {
  const remotePollKey = remotePollKeyFromSourceJson(input.sourceJson)
  const needsPoll = listHasRemoteSources(input.list)

  let dids: string[] = []
  let graphName: string | null = null
  let refreshedAt = new Date()
  let nextPollAt: Date | null = needsPoll ? new Date() : null

  if (remotePollKey) {
    const reused = await reuseRemotePollCache(pool, remotePollKey)
    if (reused) {
      dids = reused.dids
      graphName = reused.graphName
      refreshedAt = reused.refreshedAt
      nextPollAt = reused.nextPollAt
    }
  }

  if (!remotePollKey || dids.length === 0) {
    const resolved = await resolveAuthorListForCache(input.list, options)
    dids = resolved.dids
    graphName = resolved.graphName
    refreshedAt = new Date()
    if (needsPoll) {
      const interval = getPollIntervalMinutes(input.list)
      nextPollAt = nextPollAt ?? scheduleNextPoll(interval, refreshedAt)
    } else {
      nextPollAt = null
    }
  }

  await upsertAuthorListCache(pool, {
    listId: input.listId,
    projectId: input.projectId,
    sourceJson: input.sourceJson,
    dids,
    memberCount: dids.length,
    graphName,
    refreshedAt,
    nextPollAt,
    remotePollKey,
  })

  if (remotePollKey) {
    await syncAuthorListCacheByRemotePollKey(pool, remotePollKey, {
      dids,
      memberCount: dids.length,
      graphName,
      refreshedAt,
      nextPollAt,
    })
  }
}

/** Upsert cache rows from project JSON (sources only; DIDs filled on refresh). */
export async function seedAuthorListsFromProjects(
  pool: pg.Pool,
  projects: ProjectL1Config[],
  options?: ListResolveOptions,
): Promise<void> {
  for (const project of projects) {
    if (!project.enabled) continue
    for (const list of project.authorLists ?? []) {
      const sourceJson = buildAuthorListSourceJson(list)
      await upsertListEntry(
        pool,
        { listId: list.listId, projectId: project.projectId, sourceJson, list },
        options,
      )
    }
  }
}

/** Upsert feed-only author lists referenced by feed rules. */
export async function seedAuthorListsFromFeeds(
  pool: pg.Pool,
  feeds: FeedConfig[],
  options?: ListResolveOptions,
): Promise<void> {
  for (const feed of feeds) {
    for (const list of feed.authorLists ?? []) {
      if (!feedListHasContent(list)) continue
      const sourceJson = buildFeedAuthorListSourceJson(list)
      const asAuthorList = authorListFromSourceJson(list.listId, sourceJson)
      await upsertListEntry(
        pool,
        {
          listId: list.listId,
          projectId: feed.projectId,
          sourceJson,
          list: asAuthorList,
        },
        options,
      )
    }
  }
}

export async function refreshAuthorListToCache(
  pool: pg.Pool,
  listId: string,
  projectId: string,
  sourceJson: AuthorListSourceJson,
  options?: ListResolveOptions,
): Promise<AuthorListConfig> {
  const list = authorListFromSourceJson(listId, sourceJson)
  const resolved = await resolveAuthorListForCache(list, options)
  const interval = getPollIntervalMinutes(list)
  const now = new Date()
  const remotePollKey = remotePollKeyFromSourceJson(sourceJson)
  const nextPollAt = listHasRemoteSources(list) ? scheduleNextPoll(interval, now) : null
  const dids = resolved.dids

  await upsertAuthorListCache(pool, {
    listId,
    projectId,
    sourceJson,
    dids,
    memberCount: dids.length,
    graphName: resolved.graphName,
    refreshedAt: now,
    nextPollAt,
    remotePollKey,
  })

  if (remotePollKey) {
    await syncAuthorListCacheByRemotePollKey(pool, remotePollKey, {
      dids,
      memberCount: dids.length,
      graphName: resolved.graphName,
      refreshedAt: now,
      nextPollAt,
    })
  }

  return { ...list, dids }
}

/** Refresh all lists that are due (or never polled). Returns count refreshed. */
export async function pollDueAuthorLists(
  pool: pg.Pool,
  options?: ListResolveOptions & { limit?: number },
): Promise<number> {
  const due = await listAuthorListsDueForPoll(pool, options?.limit ?? 50)
  let count = 0
  for (const row of due) {
    const kind = (row.sourceJson as { kind?: string } | null)?.kind
    if (kind === 'follow_ring') continue
    try {
      await refreshAuthorListToCache(
        pool,
        row.listId,
        row.projectId,
        row.sourceJson as AuthorListSourceJson,
        options,
      )
      count++
    } catch (err) {
      console.warn(`[list-cache] refresh failed for list "${row.listId}":`, err)
    }
  }
  return count
}

export async function loadHydratedProjects(
  pool: pg.Pool,
  projects: ProjectL1Config[],
): Promise<ProjectL1Config[]> {
  const rows = await getAllAuthorListCache(pool)
  return hydrateProjectsWithCache(
    projects,
    cacheMapFromRows(rows.map((r) => ({ listId: r.listId, dids: r.dids }))),
  )
}

export async function prepareProjectsForIngest(
  pool: pg.Pool,
  projects: ProjectL1Config[],
  feeds: FeedConfig[] = [],
  options?: ListResolveOptions,
): Promise<ProjectL1Config[]> {
  await seedAuthorListsFromProjects(pool, projects, options)
  await seedAuthorListsFromFeeds(pool, feeds, options)
  await pollDueAuthorLists(pool, options)
  return loadHydratedProjects(pool, projects)
}
