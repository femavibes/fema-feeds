/**
 * Parse Bluesky post at:// URI or https://bsky.app/profile/.../post/... URL.
 */

export interface ParsedPostUri {
  atUri: string
  /** When https URL uses a handle, resolve to DID before building atUri */
  resolveActor?: { actor: string; rkey: string }
}

const AT_POST_RE =
  /^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([a-z0-9]+)$/i

const HTTPS_POST_RE =
  /^https:\/\/bsky\.app\/profile\/([^/]+)\/post\/([a-z0-9]+)\/?$/i

export function parsePostUri(input: string): ParsedPostUri | null {
  const trimmed = input.trim()

  const at = AT_POST_RE.exec(trimmed)
  if (at) {
    return { atUri: `at://${at[1]}/app.bsky.feed.post/${at[2]}` }
  }

  const https = HTTPS_POST_RE.exec(trimmed)
  if (https) {
    const actor = decodeURIComponent(https[1]!)
    const rkey = https[2]!
    if (actor.startsWith('did:')) {
      return { atUri: `at://${actor}/app.bsky.feed.post/${rkey}` }
    }
    return { atUri: '', resolveActor: { actor, rkey } }
  }

  return null
}

export function isPostUri(input: string): boolean {
  return parsePostUri(input) !== null
}
