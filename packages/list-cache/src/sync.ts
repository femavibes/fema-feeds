import type { AuthorListConfig, FeedAuthorListConfig, FeedConfig, ProjectL1Config } from '@cfb/core-types'
import {
  resolveBlueskyMembersForCache,
  scheduleNextAuditAt,
  type ListResolveOptions,
} from '@cfb/list-sources'
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

async function reuseRemotePollCache(
  pool: pg.Pool,
  remotePollKey: string,
): Promise<{
  dids: string[]
  graphName: string | null
  refreshedAt: Date
  nextPollAt: Date | null
  listKind: string | null
  listPurpose: string | null
  graphUri: string | null
  ownerDid: string | null
} | null> {
  const existing = await getAuthorListCacheByRemotePollKey(pool, remotePollKey)
  if (!existing || existing.dids.length === 0) return null
  return {
    dids: existing.dids,
    graphName: existing.graphName,
    refreshedAt: existing.refreshedAt ?? new Date(),
    nextPollAt: existing.nextPollAt,
    listKind: existing.listKind,
    listPurpose: existing.listPurpose,
    graphUri: existing.graphUri,
    ownerDid: existing.ownerDid,
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
): Promise<string> {
  const needsPoll = listHasRemoteSources(input.list)
  let dids: string[] = []
  let graphName: string | null = null
  let refreshedAt = new Date()
  let nextPollAt: Date | null = needsPoll ? new Date() : null
  let listKind: string | null = null
  let listPurpose: string | null = null
  let graphUri: string | null = null
  let ownerDid: string | null = null

  const provisionalKey = remotePollKeyFromSourceJson(input.sourceJson)

  if (provisionalKey) {
    const reused = await reuseRemotePollCache(pool, provisionalKey)
    if (reused) {
      dids = reused.dids
      graphName = reused.graphName
      refreshedAt = reused.refreshedAt
      nextPollAt = reused.nextPollAt
      listKind = reused.listKind
      listPurpose = reused.listPurpose
      graphUri = reused.graphUri
      ownerDid = reused.ownerDid
    }
  }

  if (!provisionalKey || dids.length === 0) {
    const remote = await resolveBlueskyMembersForCache(input.list, options)
    if (remote) {
      dids = remote.dids
      graphName = remote.graphName
      listKind = remote.kind
      listPurpose = remote.purpose
      graphUri = remote.graphUri
      ownerDid = remote.ownerDid
      refreshedAt = new Date()
      nextPollAt = needsPoll ? scheduleNextAuditAt(dids.length, refreshedAt) : null
    } else {
      dids = []
      nextPollAt = null
    }
  }

  // Canonical row key = backing list at:// URI when we have one.
  const canonicalId = graphUri ?? input.listId
  const remotePollKey = graphUri ?? provisionalKey

  await upsertAuthorListCache(pool, {
    listId: canonicalId,
    projectId: input.projectId,
    sourceJson: input.sourceJson,
    dids,
    memberCount: dids.length,
    graphName,
    refreshedAt,
    nextPollAt,
    remotePollKey,
    listKind,
    listPurpose,
    graphUri,
    ownerDid,
  })

  if (remotePollKey) {
    await syncAuthorListCacheByRemotePollKey(pool, remotePollKey, {
      dids,
      memberCount: dids.length,
      graphName,
      refreshedAt,
      nextPollAt,
      listKind,
      listPurpose,
      graphUri,
      ownerDid,
    })
  }

  return canonicalId
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
  options?: ListResolveOptions & { manual?: boolean },
): Promise<AuthorListConfig> {
  const list = authorListFromSourceJson(listId, sourceJson)
  const remote = await resolveBlueskyMembersForCache(list, options)
  const now = new Date()
  const dids = remote?.dids ?? []
  const graphUri = remote?.graphUri ?? null
  const remotePollKey = graphUri ?? remotePollKeyFromSourceJson(sourceJson)
  const canonicalId = graphUri ?? listId
  const nextPollAt = listHasRemoteSources(list) ? scheduleNextAuditAt(dids.length, now) : null

  await upsertAuthorListCache(pool, {
    listId: canonicalId,
    projectId,
    sourceJson,
    dids,
    memberCount: dids.length,
    graphName: remote?.graphName ?? null,
    refreshedAt: now,
    nextPollAt,
    remotePollKey,
    listKind: remote?.kind ?? null,
    listPurpose: remote?.purpose ?? null,
    graphUri,
    ownerDid: remote?.ownerDid ?? null,
    touchManualRefresh: options?.manual === true,
  })

  if (remotePollKey) {
    await syncAuthorListCacheByRemotePollKey(pool, remotePollKey, {
      dids,
      memberCount: dids.length,
      graphName: remote?.graphName ?? null,
      refreshedAt: now,
      nextPollAt,
      listKind: remote?.kind ?? null,
      listPurpose: remote?.purpose ?? null,
      graphUri,
      ownerDid: remote?.ownerDid ?? null,
      touchManualRefresh: options?.manual === true,
    })
  }

  return { ...list, listId: canonicalId, dids }
}

/**
 * Resolve + upsert a Bluesky list/starter-pack URL into the canonical cache row.
 * Returns the canonical listId (= backing list at:// URI).
 */
export async function ensureBlueskyListInCache(
  pool: pg.Pool,
  input: { uri: string; projectId: string },
  options?: ListResolveOptions,
): Promise<{
  listId: string
  graphName: string | null
  memberCount: number
  listKind: string | null
  listPurpose: string | null
  graphUri: string
  reused: boolean
}> {
  const { resolveBlueskyGraphWithMeta } = await import('@cfb/list-sources')
  const meta = await resolveBlueskyGraphWithMeta(input.uri, options)
  const existing = await getAuthorListCacheByRemotePollKey(pool, meta.graphUri)
  const reused = Boolean(existing && existing.dids.length > 0)

  const sourceJson: AuthorListSourceJson =
    meta.kind === 'starterpack' && meta.starterPackUri
      ? {
          feedOnly: true,
          fastPath: { enabled: false, bypassSteps: [] },
          sources: [
            {
              type: 'bluesky_starter_pack',
              uri: meta.starterPackUri,
              pollIntervalMinutes: 60,
            },
          ],
        }
      : {
          feedOnly: true,
          fastPath: { enabled: false, bypassSteps: [] },
          sources: [
            {
              type: 'bluesky_list',
              uri: meta.graphUri,
              pollIntervalMinutes: 60,
            },
          ],
        }

  if (reused && existing) {
    return {
      listId: existing.graphUri ?? existing.listId,
      graphName: existing.graphName,
      memberCount: existing.memberCount,
      listKind: existing.listKind ?? meta.kind,
      listPurpose: existing.listPurpose ?? meta.purpose,
      graphUri: meta.graphUri,
      reused: true,
    }
  }

  const now = new Date()
  await upsertAuthorListCache(pool, {
    listId: meta.graphUri,
    projectId: input.projectId,
    sourceJson,
    dids: meta.dids,
    memberCount: meta.dids.length,
    graphName: meta.graphName,
    refreshedAt: now,
    nextPollAt: scheduleNextAuditAt(meta.dids.length, now),
    remotePollKey: meta.graphUri,
    listKind: meta.kind,
    listPurpose: meta.purpose,
    graphUri: meta.graphUri,
    ownerDid: meta.ownerDid,
  })

  return {
    listId: meta.graphUri,
    graphName: meta.graphName,
    memberCount: meta.dids.length,
    listKind: meta.kind,
    listPurpose: meta.purpose,
    graphUri: meta.graphUri,
    reused: false,
  }
}

/** Refresh all lists that are due for audit. Returns count refreshed. */
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
      console.warn(`[list-cache] audit refresh failed for list "${row.listId}":`, err)
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
