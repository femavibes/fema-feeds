/**
 * Parse Bluesky graph URIs: lists, starter packs, moderation lists.
 * Mod lists use the same list collection — only purpose differs in metadata.
 */

export type GraphKind = 'list' | 'starterpack'

export interface ParsedGraphUri {
  kind: GraphKind
  /** Canonical at:// URI for getList or getStarterPack */
  atUri: string
  /** When handle-based https URL needs actor resolution first */
  resolveActor?: { actor: string; rkey: string; kind: GraphKind }
}

const AT_LIST_RE =
  /^at:\/\/(did:[^/]+)\/app\.bsky\.graph\.list\/([a-z0-9]+)$/i

const AT_STARTER_RE =
  /^at:\/\/(did:[^/]+)\/app\.bsky\.graph\.starterpack\/([a-z0-9]+)$/i

const HTTPS_LIST_RE =
  /^https:\/\/bsky\.app\/profile\/([^/]+)\/lists\/([a-z0-9]+)\/?$/i

const HTTPS_STARTER_RE =
  /^https:\/\/bsky\.app\/starter-pack\/([^/]+)\/([a-z0-9]+)\/?$/i

/** Legacy alias */
export type ParsedListUri = { listAtUri: string }

export function parseGraphUri(input: string): ParsedGraphUri | null {
  const trimmed = input.trim()

  const atList = AT_LIST_RE.exec(trimmed)
  if (atList) {
    return {
      kind: 'list',
      atUri: `at://${atList[1]}/app.bsky.graph.list/${atList[2]}`,
    }
  }

  const atStarter = AT_STARTER_RE.exec(trimmed)
  if (atStarter) {
    return {
      kind: 'starterpack',
      atUri: `at://${atStarter[1]}/app.bsky.graph.starterpack/${atStarter[2]}`,
    }
  }

  const httpsList = HTTPS_LIST_RE.exec(trimmed)
  if (httpsList) {
    const actor = decodeURIComponent(httpsList[1]!)
    const rkey = httpsList[2]!
    if (actor.startsWith('did:')) {
      return { kind: 'list', atUri: `at://${actor}/app.bsky.graph.list/${rkey}` }
    }
    return { kind: 'list', atUri: '', resolveActor: { actor, rkey, kind: 'list' } }
  }

  const httpsStarter = HTTPS_STARTER_RE.exec(trimmed)
  if (httpsStarter) {
    const actor = decodeURIComponent(httpsStarter[1]!)
    const rkey = httpsStarter[2]!
    if (actor.startsWith('did:')) {
      return {
        kind: 'starterpack',
        atUri: `at://${actor}/app.bsky.graph.starterpack/${rkey}`,
      }
    }
    return { kind: 'starterpack', atUri: '', resolveActor: { actor, rkey, kind: 'starterpack' } }
  }

  return null
}

/** @deprecated Use parseGraphUri */
export function parseListUri(input: string): ParsedListUri | null {
  const p = parseGraphUri(input)
  if (!p || p.kind !== 'list') return null
  if (p.resolveActor) {
    return { listAtUri: `__resolve_actor__:${p.resolveActor.actor}:${p.resolveActor.rkey}` }
  }
  return { listAtUri: p.atUri }
}

export function isGraphUri(input: string): boolean {
  return parseGraphUri(input) !== null
}

export function isListUri(input: string): boolean {
  const p = parseGraphUri(input)
  return p?.kind === 'list'
}
