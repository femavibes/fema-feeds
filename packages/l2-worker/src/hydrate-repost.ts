import type { NormalizedPost } from '@cfb/core-types'
import { applyRepostSubject } from '@cfb/post-normalize'
import { getIngestedPost, normalizedPostFromRow } from '@cfb/storage-postgres'
import type pg from 'pg'

type Entry = { at: number; subject: NormalizedPost }

const TTL_MS = Math.max(
  30_000,
  Number(process.env.CFB_REPOST_SUBJECT_CACHE_TTL_MS ?? 300_000) || 300_000,
)
const MAX_ENTRIES = Math.max(
  100,
  Number(process.env.CFB_REPOST_SUBJECT_CACHE_MAX ?? 2_000) || 2_000,
)

const cache = new Map<string, Entry>()

function cacheGet(uri: string): NormalizedPost | null {
  const hit = cache.get(uri)
  if (!hit) return null
  if (Date.now() - hit.at >= TTL_MS) {
    cache.delete(uri)
    return null
  }
  return hit.subject
}

function cacheSet(uri: string, subject: NormalizedPost): void {
  if (cache.size >= MAX_ENTRIES) {
    const first = cache.keys().next().value
    if (first) cache.delete(first)
  }
  cache.set(uri, { at: Date.now(), subject })
}

function isBareRepostShell(post: NormalizedPost): boolean {
  return (
    post.postKind === 'repost' &&
    !post.text.trim() &&
    !post.embedDetail &&
    post.facetTags.length === 0 &&
    post.facetLinks.length === 0
  )
}

export type HydrateRepostOptions = {
  /**
   * When false, only use in-memory cache + local pool DB (no Bluesky HTTP).
   * Required for Matches / large scans — remote fetch per repost freezes the UI.
   */
  allowRemoteFetch?: boolean
}

/**
 * Fill a bare Jetstream repost with subject post content (pool cache → optional API).
 * Keeps postKind=repost / reposter identity.
 */
export async function hydrateRepostSubject(
  pool: pg.Pool | null,
  repost: NormalizedPost,
  fetchSubject: (uri: string) => Promise<NormalizedPost | null>,
  options: HydrateRepostOptions = {},
): Promise<NormalizedPost> {
  if (repost.postKind !== 'repost') return repost
  const subjectUri = repost.repost?.subjectUri
  if (!subjectUri) return repost
  if (!isBareRepostShell(repost)) return repost

  const allowRemoteFetch = options.allowRemoteFetch !== false

  const cached = cacheGet(subjectUri)
  if (cached) return applyRepostSubject(repost, cached)

  if (pool) {
    try {
      const row = await getIngestedPost(pool, subjectUri)
      if (row) {
        const fromDb = normalizedPostFromRow(row)
        // Don't use another bare repost as subject content.
        if (!isBareRepostShell(fromDb)) {
          cacheSet(subjectUri, fromDb)
          return applyRepostSubject(repost, fromDb)
        }
      }
    } catch {
      /* fall through */
    }
  }

  if (!allowRemoteFetch) return repost

  const fromApi = await fetchSubject(subjectUri)
  if (!fromApi) return repost
  cacheSet(subjectUri, fromApi)
  return applyRepostSubject(repost, fromApi)
}
