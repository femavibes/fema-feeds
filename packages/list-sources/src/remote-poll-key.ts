import type { ListSource } from '@cfb/core-types'
import { parseGraphUri } from './parse-list-uri.js'

/** Stable key for deduplicating Bluesky list polling across projects and feeds. */
export function remotePollKeyFromListSource(source: ListSource): string | null {
  if (source.type === 'manual_dids') return null
  const parsed = parseGraphUri(source.uri)
  if (!parsed) return null
  if (parsed.atUri) return parsed.atUri
  if (parsed.resolveActor) {
    const { actor, rkey, kind } = parsed.resolveActor
    return `pending:${kind}:${actor.trim().toLowerCase()}:${rkey}`
  }
  return null
}

export function remotePollKeyFromSources(sources: ListSource[] | undefined): string | null {
  for (const source of sources ?? []) {
    const key = remotePollKeyFromListSource(source)
    if (key) return key
  }
  return null
}

export function remotePollKeyFromList(list: {
  sources?: ListSource[]
}): string | null {
  return remotePollKeyFromSources(list.sources)
}
