import type { PoolMatchAuthor, PoolMatchQuotePreview, PoolMatchSample } from '../api/client'

const EMPTY_AUTHOR: PoolMatchAuthor = {
  did: '',
  handle: null,
  displayName: null,
  avatarUrl: null,
}

function normalizeAuthor(raw: unknown, legacyDid?: string): PoolMatchAuthor {
  if (raw && typeof raw === 'object') {
    const a = raw as Partial<PoolMatchAuthor>
    return {
      did: a.did?.trim() || legacyDid || '',
      handle: a.handle?.trim() || null,
      displayName: a.displayName?.trim() || null,
      avatarUrl: a.avatarUrl?.trim() || null,
    }
  }
  return legacyDid ? { ...EMPTY_AUTHOR, did: legacyDid } : EMPTY_AUTHOR
}

function normalizeQuote(raw: unknown): PoolMatchQuotePreview | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const q = raw as Partial<PoolMatchQuotePreview> & { author?: unknown }
  if (!q.uri && !q.text) return undefined
  return {
    uri: q.uri ?? '',
    text: q.text ?? '',
    author: normalizeAuthor(q.author),
    thumbUrl: q.thumbUrl,
    unavailable: q.unavailable,
  }
}

/** Coerce API payloads (including older shapes) into a safe render model. */
export function normalizePoolMatchSample(raw: unknown): PoolMatchSample {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<PoolMatchSample> & {
    authorDid?: string
    embedChips?: unknown
  }

  return {
    uri: s.uri ?? '',
    author: normalizeAuthor(s.author, s.authorDid),
    text: typeof s.text === 'string' ? s.text : '',
    indexedAt: s.indexedAt ?? '',
    postKind: (s.postKind as PoolMatchSample['postKind']) ?? 'root',
    facetTags: Array.isArray(s.facetTags) ? s.facetTags.map(String) : [],
    media: Array.isArray(s.media) ? s.media : [],
    quote: normalizeQuote(s.quote),
    trace: Array.isArray(s.trace) ? s.trace : [],
  }
}

export function normalizePoolMatchResult<T extends { posts: unknown[]; rejects: unknown[] }>(
  result: T,
): T & { posts: PoolMatchSample[]; rejects: PoolMatchSample[] } {
  return {
    ...result,
    posts: result.posts.map(normalizePoolMatchSample),
    rejects: result.rejects.map(normalizePoolMatchSample),
  }
}
