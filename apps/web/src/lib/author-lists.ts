import type {
  AuthorListConfig,
  FeedAuthorListConfig,
  ListSource,
} from '@cfb/core-types'
import type { ListCacheEntry } from '../api/client'
import { formatCsv, parseCsv } from './l1-form'

export type AuthorListScope = 'project' | 'feed' | 'deployment'

export interface RegisteredAuthorList {
  listId: string
  scope: AuthorListScope
  projectId?: string
  memberCount?: number
  remotePollKey: string | null
}

const AT_LIST_RE =
  /^at:\/\/(did:[^/]+)\/app\.bsky\.graph\.list\/([a-z0-9]+)$/i
const AT_STARTER_RE =
  /^at:\/\/(did:[^/]+)\/app\.bsky\.graph\.starterpack\/([a-z0-9]+)$/i
const HTTPS_LIST_RE =
  /^https:\/\/bsky\.app\/profile\/([^/]+)\/lists\/([a-z0-9]+)\/?$/i
const HTTPS_STARTER_RE =
  /^https:\/\/bsky\.app\/starter-pack\/([^/]+)\/([a-z0-9]+)\/?$/i

function remotePollKeyFromUri(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const atList = AT_LIST_RE.exec(trimmed)
  if (atList) {
    return `at://${atList[1]}/app.bsky.graph.list/${atList[2]}`
  }

  const atStarter = AT_STARTER_RE.exec(trimmed)
  if (atStarter) {
    return `at://${atStarter[1]}/app.bsky.graph.starterpack/${atStarter[2]}`
  }

  const httpsList = HTTPS_LIST_RE.exec(trimmed)
  if (httpsList) {
    const actor = decodeURIComponent(httpsList[1]!)
    const rkey = httpsList[2]!
    if (actor.startsWith('did:')) {
      return `at://${actor}/app.bsky.graph.list/${rkey}`
    }
    return `pending:list:${actor.trim().toLowerCase()}:${rkey}`
  }

  const httpsStarter = HTTPS_STARTER_RE.exec(trimmed)
  if (httpsStarter) {
    const actor = decodeURIComponent(httpsStarter[1]!)
    const rkey = httpsStarter[2]!
    if (actor.startsWith('did:')) {
      return `at://${actor}/app.bsky.graph.starterpack/${rkey}`
    }
    return `pending:starterpack:${actor.trim().toLowerCase()}:${rkey}`
  }

  return null
}

export function listSourceUri(list: {
  sources?: ListSource[]
}): string {
  const remote = list.sources?.find(
    (s) => s.type === 'bluesky_list' || s.type === 'bluesky_starter_pack',
  )
  return remote && 'uri' in remote ? remote.uri : ''
}

export function remotePollKeyForUri(uri: string): string | null {
  return remotePollKeyFromUri(uri)
}

export function remotePollKeyForList(list: {
  sources?: ListSource[]
}): string | null {
  for (const source of list.sources ?? []) {
    if (source.type === 'manual_dids') continue
    const key = remotePollKeyFromUri(source.uri)
    if (key) return key
  }
  return null
}

export function collectRegisteredLists(input: {
  projectLists: AuthorListConfig[]
  feedLists: FeedAuthorListConfig[]
  listCache: ListCacheEntry[]
  projectId: string
}): RegisteredAuthorList[] {
  const out: RegisteredAuthorList[] = []
  for (const list of input.projectLists) {
    out.push({
      listId: list.listId,
      scope: 'project',
      projectId: input.projectId,
      memberCount: input.listCache.find((c) => c.listId === list.listId)?.memberCount,
      remotePollKey: remotePollKeyForList(list),
    })
  }
  for (const list of input.feedLists) {
    out.push({
      listId: list.listId,
      scope: 'feed',
      projectId: input.projectId,
      memberCount: input.listCache.find((c) => c.listId === list.listId)?.memberCount,
      remotePollKey: remotePollKeyForList(list),
    })
  }
  for (const row of input.listCache) {
    if (out.some((e) => e.listId === row.listId)) continue
    out.push({
      listId: row.listId,
      scope: row.projectId === input.projectId ? (row.feedOnly ? 'feed' : 'project') : 'deployment',
      projectId: row.projectId,
      memberCount: row.memberCount,
      remotePollKey: row.remotePollKey ?? null,
    })
  }
  return out
}

export function findDuplicateAuthorList(
  uri: string,
  registered: RegisteredAuthorList[],
): RegisteredAuthorList | null {
  const key = remotePollKeyForUri(uri)
  if (!key) return null
  return registered.find((entry) => entry.remotePollKey === key) ?? null
}

export function inferAuthorListMode(
  listId: string | undefined,
  projectLists: AuthorListConfig[],
  feedLists: FeedAuthorListConfig[],
): 'project' | 'feed' | 'manual' {
  if (!listId) return 'manual'
  if (projectLists.some((l) => l.listId === listId)) return 'project'
  if (feedLists.some((l) => l.listId === listId)) return 'feed'
  return 'feed'
}

/** Manual DIDs stored on a list definition (not Bluesky poll results). */
export function listManualDids(list: {
  sources?: ListSource[]
  dids?: string[]
}): string[] {
  const fromSources = (list.sources ?? [])
    .filter((s): s is Extract<ListSource, { type: 'manual_dids' }> => s.type === 'manual_dids')
    .flatMap((s) => s.dids)
  return [...fromSources, ...(list.dids ?? [])]
}

export function isProjectAuthorList(
  listId: string | undefined,
  projectLists: AuthorListConfig[],
): boolean {
  return !!listId && projectLists.some((l) => l.listId === listId)
}

export function isFeedAuthorList(
  listId: string | undefined,
  feedLists: FeedAuthorListConfig[],
): boolean {
  return !!listId && feedLists.some((l) => l.listId === listId)
}

export function feedAuthorListHasContent(list: FeedAuthorListConfig): boolean {
  return !!listSourceUri(list).trim() || listManualDids(list).length > 0
}

/** Drop feed-only list definitions not referenced by any author condition in the feed. */
export function pruneFeedAuthorLists(
  lists: FeedAuthorListConfig[],
  referencedIds: Set<string>,
): FeedAuthorListConfig[] {
  return lists.filter(
    (l) => referencedIds.has(l.listId) && feedAuthorListHasContent(l),
  )
}

export function newFeedAuthorList(existing: FeedAuthorListConfig[] = []): FeedAuthorListConfig {
  const used = new Set(existing.map((l) => l.listId))
  let n = existing.length + 1
  let listId = `feed-list-${n}`
  while (used.has(listId)) {
    n++
    listId = `feed-list-${n}`
  }
  return {
    listId,
    sources: [{ type: 'bluesky_list', uri: '', pollIntervalMinutes: 60 }],
    pollIntervalMinutes: 60,
  }
}

export { formatCsv, parseCsv }
