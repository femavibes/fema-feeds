import type { FeedConfig, L2RuleNode } from '@cfb/core-types'
import type pg from 'pg'
import { getAuthorListCache } from '@cfb/storage-postgres'

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

export async function loadAuthorListsForFeeds(
  pool: pg.Pool,
  feeds: FeedConfig[],
): Promise<Record<string, string[]>> {
  const listIds = collectAuthorListIds(feeds)
  const out: Record<string, string[]> = {}
  await Promise.all(
    listIds.map(async (listId) => {
      const row = await getAuthorListCache(pool, listId)
      if (row) out[listId] = row.dids
    }),
  )
  return out
}
