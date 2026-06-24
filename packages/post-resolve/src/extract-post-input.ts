import { parsePostUri } from './parse-post-uri.js'

const AT_POST_IN_TEXT =
  /at:\/\/did:[a-z0-9]+:[^/\s]+\/app\.bsky\.feed\.post\/[a-z0-9]+/i

const HTTPS_POST_IN_TEXT =
  /https:\/\/bsky\.app\/profile\/[^\s)\]"']+\/post\/[a-z0-9]+/i

export type ExtractPostInputResult =
  | { ok: true; value: string; extracted: boolean }
  | { ok: false; error: string }

/** Trim input and pull out an embedded Bluesky post URL/URI when present. */
export function extractPostInput(raw: string): ExtractPostInputResult {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, error: 'Paste a Bluesky post URL or at:// URI' }
  }

  if (parsePostUri(trimmed)) {
    return { ok: true, value: trimmed, extracted: false }
  }

  const atMatch = trimmed.match(AT_POST_IN_TEXT)?.[0]
  if (atMatch && parsePostUri(atMatch)) {
    return { ok: true, value: atMatch, extracted: true }
  }

  const httpsMatch = trimmed.match(HTTPS_POST_IN_TEXT)?.[0]?.replace(/[.,;)\]"']+$/, '')
  if (httpsMatch && parsePostUri(httpsMatch)) {
    return { ok: true, value: httpsMatch, extracted: true }
  }

  if (/\/api\/(feeds|projects)\//i.test(trimmed) || /\/preview\b/i.test(trimmed)) {
    return {
      ok: false,
      error:
        'That looks like an app API path, not a Bluesky post. Open the post on bsky.app and copy the link from your browser.',
    }
  }

  const preview = trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed
  return {
    ok: false,
    error: `Not a Bluesky post link (${preview}). Use https://bsky.app/profile/…/post/… or at://…`,
  }
}
