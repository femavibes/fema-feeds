/**
 * Convert AT Proto / Bluesky URIs into https://bsky.app links browsers can open.
 * Never return an at:// href — that yields about:blank#blocked in Chromium.
 *
 * Important: bsky.app rejects percent-encoded DIDs in nested paths
 * (`did%3Aplc%3A…/lists/…` → "Invalid AT uri"). Leave `did:` actors raw.
 */

const AT_POST_RE =
  /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/?#]+)/i
const AT_REPOST_RE =
  /^at:\/\/([^/]+)\/app\.bsky\.feed\.repost\/([^/?#]+)/i
const AT_LIST_RE =
  /^at:\/\/([^/]+)\/app\.bsky\.graph\.list\/([^/?#]+)/i
const AT_STARTER_RE =
  /^at:\/\/([^/]+)\/app\.bsky\.graph\.starterpack\/([^/?#]+)/i

/** True when the string is already a normal web URL. */
export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

/** Path segment for profile/list/post — DIDs must stay unencoded for bsky.app. */
export function bskyProfileSegment(actor: string): string {
  const a = actor.trim()
  if (a.toLowerCase().startsWith('did:')) return a
  return encodeURIComponent(a)
}

/** rkey / tid path segment — usually safe alphanumeric; encode only if needed. */
function bskyRkeySegment(rkey: string): string {
  const r = rkey.trim()
  if (/^[a-z0-9._~-]+$/i.test(r)) return r
  return encodeURIComponent(r)
}

/**
 * Map a known at:// (or passthrough https) URI to a bsky.app URL.
 * Returns null when we cannot build a safe web link.
 */
export function atProtoUriToBskyWebUrl(uri: string): string | null {
  const trimmed = uri.trim()
  if (!trimmed) return null
  if (isHttpUrl(trimmed)) return trimmed

  const post = AT_POST_RE.exec(trimmed)
  if (post) {
    return `https://bsky.app/profile/${bskyProfileSegment(post[1]!)}/post/${bskyRkeySegment(post[2]!)}`
  }

  // No public “repost record” page — send people to the reposter’s profile.
  const repost = AT_REPOST_RE.exec(trimmed)
  if (repost) {
    return `https://bsky.app/profile/${bskyProfileSegment(repost[1]!)}`
  }

  const list = AT_LIST_RE.exec(trimmed)
  if (list) {
    return `https://bsky.app/profile/${bskyProfileSegment(list[1]!)}/lists/${bskyRkeySegment(list[2]!)}`
  }

  const starter = AT_STARTER_RE.exec(trimmed)
  if (starter) {
    return `https://bsky.app/starter-pack/${bskyProfileSegment(starter[1]!)}/${bskyRkeySegment(starter[2]!)}`
  }

  return null
}

/**
 * Safe href for <a target="_blank">. Falls back to Bluesky home rather than at://.
 */
export function bskyWebHref(uri: string, fallback = 'https://bsky.app'): string {
  return atProtoUriToBskyWebUrl(uri) ?? fallback
}
