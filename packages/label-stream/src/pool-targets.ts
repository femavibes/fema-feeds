import type pg from 'pg'
import { isPostInPool, listPoolPostUrisByAuthor } from '@cfb/storage-postgres'

const POST_COLLECTION = 'app.bsky.feed.post'
const PROFILE_SELF = 'app.bsky.actor.profile/self'

/** Map a label subject URI to pool post URIs we should update (empty if none). */
export async function resolvePoolTargetsForLabelUri(
  pool: pg.Pool,
  uri: string,
): Promise<string[]> {
  const trimmed = uri?.trim()
  if (!trimmed) return []

  if (trimmed.includes(POST_COLLECTION)) {
    if (await isPostInPool(pool, trimmed)) return [trimmed]
    return []
  }

  const profileMatch = trimmed.match(/^at:\/\/(did:[^/]+)\/app\.bsky\.actor\.profile\/self$/i)
  if (profileMatch) {
    return listPoolPostUrisByAuthor(pool, profileMatch[1]!)
  }

  if (trimmed.startsWith('did:')) {
    return listPoolPostUrisByAuthor(pool, trimmed)
  }

  const atMatch = trimmed.match(/^at:\/\/(did:[^/]+)\//i)
  if (atMatch) {
    return listPoolPostUrisByAuthor(pool, atMatch[1]!)
  }

  return []
}

export { PROFILE_SELF }
