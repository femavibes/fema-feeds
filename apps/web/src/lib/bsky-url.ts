/** Profile segment for bsky.app paths — DIDs keep literal colons; handles are encoded. */
export function profileActorForBskyPath(actor: string): string {
  if (actor.startsWith('did:')) return actor
  return encodeURIComponent(actor)
}

/** at://…/app.bsky.feed.generator/… → https://bsky.app/profile/…/feed/… */
export function feedUriToBskyUrl(atUri: string): string | null {
  const m = atUri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.generator\/([^/]+)$/i)
  if (!m?.[1] || !m[2]) return null
  return `https://bsky.app/profile/${profileActorForBskyPath(m[1])}/feed/${m[2]}`
}

/** at://…/app.bsky.feed.post/… → https://bsky.app/profile/…/post/… */
export function postAtUriToBskyUrl(atUri: string): string | null {
  const m = atUri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/i)
  if (!m?.[1] || !m[2]) return null
  return `https://bsky.app/profile/${profileActorForBskyPath(m[1])}/post/${m[2]}`
}
