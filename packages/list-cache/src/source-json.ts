import type { AuthorListConfig, FeedAuthorListConfig } from '@cfb/core-types'
import { remotePollKeyFromList } from '@cfb/list-sources'

/** Serializable list definition stored in author_list_cache.source_json (no resolved DIDs). */
export interface AuthorListSourceJson {
  sources?: AuthorListConfig['sources']
  pollIntervalMinutes?: number
  fastPath: AuthorListConfig['fastPath']
  /** Copied from config at seed time when using deprecated top-level dids. */
  manualDids?: string[]
  /** Feed-only lists skip L1 fast-path — stored for cache round-trip. */
  feedOnly?: boolean
}

export function buildAuthorListSourceJson(list: AuthorListConfig): AuthorListSourceJson {
  return {
    sources: list.sources,
    pollIntervalMinutes: list.pollIntervalMinutes,
    fastPath: list.fastPath,
    ...(list.dids?.length ? { manualDids: list.dids } : {}),
  }
}

export function buildFeedAuthorListSourceJson(list: FeedAuthorListConfig): AuthorListSourceJson {
  return {
    sources: list.sources,
    pollIntervalMinutes: list.pollIntervalMinutes,
    fastPath: { enabled: false, bypassSteps: [] },
    feedOnly: true,
    ...(list.dids?.length ? { manualDids: list.dids } : {}),
  }
}

export function authorListFromSourceJson(
  listId: string,
  source: AuthorListSourceJson,
): AuthorListConfig {
  return {
    listId,
    sources: source.sources,
    pollIntervalMinutes: source.pollIntervalMinutes,
    fastPath: source.fastPath,
    ...(source.manualDids?.length ? { dids: source.manualDids } : {}),
  }
}

export function feedAuthorListFromSourceJson(
  listId: string,
  source: AuthorListSourceJson,
): FeedAuthorListConfig {
  return {
    listId,
    sources: source.sources,
    pollIntervalMinutes: source.pollIntervalMinutes,
    ...(source.manualDids?.length ? { dids: source.manualDids } : {}),
  }
}

export function listHasRemoteSources(list: {
  sources?: AuthorListConfig['sources']
}): boolean {
  return (list.sources ?? []).some((s) => {
    if (s.type !== 'bluesky_list' && s.type !== 'bluesky_starter_pack') return false
    return !!s.uri?.trim()
  })
}

export function remotePollKeyFromSourceJson(source: AuthorListSourceJson): string | null {
  return remotePollKeyFromList({ sources: source.sources })
}
