import type { FeedConfig, L2RuleNode } from '@cfb/core-types'
import { scoutSourceEnabled } from '@cfb/core-types'
import type pg from 'pg'
import { getAuthorListCache } from '@cfb/storage-postgres'
import { getCachedDidList, setCachedDidList } from './did-list-mem-cache.js'

export function collectAuthorListIds(feeds: FeedConfig[]): string[] {
  const ids = new Set<string>()
  const visit = (node: L2RuleNode) => {
    if (node.type === 'author' && node.listId) {
      ids.add(node.listId)
    }
    if (node.type === 'group') {
      for (const child of node.children) visit(child)
    }
  }
  for (const feed of feeds) visit(feed.match)
  return [...ids]
}

/** Bluesky list ids referenced by scout sources on feeds. */
export function collectScoutListIds(feeds: FeedConfig[]): string[] {
  const ids = new Set<string>()
  for (const feed of feeds) {
    const listId = feed.sources?.scout?.listId
    if (scoutSourceEnabled(feed.sources) && listId) ids.add(listId)
  }
  return [...ids]
}

export async function loadAuthorListDids(pool: pg.Pool, listIds: string[]): Promise<string[]> {
  const out: string[] = []
  await Promise.all(
    listIds.map(async (listId) => {
      const mem = getCachedDidList(`author:${listId}`)
      if (mem) {
        out.push(...mem.dids)
        return
      }
      const row = await getAuthorListCache(pool, listId)
      if (row) out.push(...setCachedDidList(`author:${listId}`, row.dids).dids)
    }),
  )
  return out
}

export async function loadAuthorListsForFeeds(
  pool: pg.Pool,
  feeds: FeedConfig[],
): Promise<Record<string, string[]>> {
  const listIds = collectAuthorListIds(feeds)
  const out: Record<string, string[]> = {}
  await Promise.all(
    listIds.map(async (listId) => {
      const mem = getCachedDidList(`author:${listId}`)
      if (mem) {
        out[listId] = mem.dids
        return
      }
      const row = await getAuthorListCache(pool, listId)
      if (row) out[listId] = setCachedDidList(`author:${listId}`, row.dids).dids
    }),
  )
  return out
}

/** Same data as loadAuthorListsForFeeds, but as Sets for O(1) membership. */
export async function loadAuthorListSetsForFeeds(
  pool: pg.Pool,
  feeds: FeedConfig[],
): Promise<Record<string, ReadonlySet<string>>> {
  const listIds = collectAuthorListIds(feeds)
  const out: Record<string, ReadonlySet<string>> = {}
  await Promise.all(
    listIds.map(async (listId) => {
      const mem = getCachedDidList(`author:${listId}`)
      if (mem) {
        out[listId] = mem.set
        return
      }
      const row = await getAuthorListCache(pool, listId)
      if (row) out[listId] = setCachedDidList(`author:${listId}`, row.dids).set
    }),
  )
  return out
}
