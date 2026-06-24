import type { FeedConfig, L2MentionCondition } from '@cfb/core-types'
import { walkRuleNodes } from '@cfb/l2-eval'
import {
  fetchAuthorProfilesBatch,
  isActorDid,
  normalizeActorRef,
} from '@cfb/profile-enrich'
import { getAuthorListCacheByRemotePollKey } from '@cfb/storage-postgres'
import type pg from 'pg'

function listPollKey(uri: string): string | null {
  const trimmed = uri.trim()
  const at = /^at:\/\/([^/]+)\/app\.bsky\.graph\.list\/([^/]+)/i.exec(trimmed)
  if (at) return `at://${at[1]}/app.bsky.graph.list/${at[2]}`
  const https = /^https:\/\/bsky\.app\/profile\/([^/]+)\/lists\/([^/]+)/i.exec(trimmed)
  if (https) {
    const actor = decodeURIComponent(https[1]!)
    const rkey = https[2]!
    if (actor.startsWith('did:')) return `at://${actor}/app.bsky.graph.list/${rkey}`
    return `pending:list:${actor.trim().toLowerCase()}:${rkey}`
  }
  return null
}

function mentionAccounts(node: L2MentionCondition): string[] {
  const legacy = node as L2MentionCondition & { dids?: string[] }
  return node.accounts?.length ? node.accounts : (legacy.dids ?? [])
}

export async function resolveMentionNodeDids(
  pool: pg.Pool,
  node: L2MentionCondition,
): Promise<string[]> {
  const dids = new Set<string>()
  const refs = mentionAccounts(node).map(normalizeActorRef).filter(Boolean)
  const literalDids = refs.filter(isActorDid)
  const handles = refs.filter((r) => !isActorDid(r))
  for (const d of literalDids) dids.add(d)

  if (handles.length > 0) {
    const profiles = await fetchAuthorProfilesBatch(handles)
    for (const p of profiles) dids.add(p.did)
  }

  const listUri = node.listUri?.trim()
  if (listUri) {
    const key = listPollKey(listUri)
    if (key) {
      const row = await getAuthorListCacheByRemotePollKey(pool, key)
      for (const d of row?.dids ?? []) dids.add(d)
    }
  }

  return [...dids]
}

export async function loadMentionDidsForFeed(
  pool: pg.Pool,
  feed: FeedConfig,
): Promise<Record<string, string[]>> {
  const nodes = walkRuleNodes(feed.match).filter(
    (n): n is L2MentionCondition => n.type === 'mention',
  )
  const out: Record<string, string[]> = {}
  await Promise.all(
    nodes.map(async (node) => {
      out[node.id] = await resolveMentionNodeDids(pool, node)
    }),
  )
  return out
}

export async function loadMentionDidsForFeeds(
  pool: pg.Pool,
  feeds: FeedConfig[],
): Promise<Record<string, Record<string, string[]>>> {
  const out: Record<string, Record<string, string[]>> = {}
  await Promise.all(
    feeds.map(async (feed) => {
      out[feed.feedId] = await loadMentionDidsForFeed(pool, feed)
    }),
  )
  return out
}
