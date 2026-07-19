import type { L2NodeTrace, NormalizedPost, PostKind } from '@cfb/core-types'
import { fetchAuthorProfilesBatch } from '@cfb/profile-enrich'
import type pg from 'pg'
import {
  getAuthorProfilesByDids,
  upsertAuthorProfile,
  type AuthorProfileRow,
} from '@cfb/storage-postgres'
import type { PoolMatchMediaPreview, PoolMatchQuotePreview } from './pool-match-enrich.js'

export type { PoolMatchMediaPreview, PoolMatchQuotePreview } from './pool-match-enrich.js'

export interface PoolMatchAuthor {
  did: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
}

export interface PoolMatchSample {
  uri: string
  author: PoolMatchAuthor
  text: string
  indexedAt: string
  postKind: PostKind
  facetTags: string[]
  media: PoolMatchMediaPreview[]
  quote?: PoolMatchQuotePreview
  /**
   * When postKind=repost: the reshared post as a nested card (original author + text),
   * same shape as quote previews.
   */
  repostSubject?: PoolMatchQuotePreview
  trace: L2NodeTrace[]
  labelVals?: string[]
  /** When postKind=repost, the reshared post URI (for open-in-Bluesky + display). */
  repostSubjectUri?: string
  /** Original author of the reshared post, when known. */
  repostSubjectAuthorDid?: string
}

export interface PoolMatchItem extends PoolMatchSample {
  sortKey: number | null
  editorScore: number
}

export function buildPoolMatchSample(
  post: NormalizedPost,
  trace: L2NodeTrace[],
): PoolMatchSample {
  const subjectUri = post.repost?.subjectUri
  const subjectAuthorDid = post.repost?.subjectAuthorDid
  const repostSubject: PoolMatchQuotePreview | undefined =
    post.postKind === 'repost' && subjectUri
      ? {
          uri: subjectUri,
          text: post.text.slice(0, 280),
          author: {
            did: subjectAuthorDid ?? '',
            handle: null,
            displayName: null,
            avatarUrl: null,
          },
        }
      : undefined

  return {
    uri: post.uri,
    author: {
      did: post.authorDid,
      handle: null,
      displayName: null,
      avatarUrl: null,
    },
    text: post.text.slice(0, 500),
    indexedAt: post.indexedAt,
    postKind: post.postKind,
    facetTags: [...post.facetTags, ...post.hiddenFacetTags].slice(0, 8),
    media: [],
    quote: undefined,
    repostSubject,
    trace,
    labelVals: post.allLabelVals && post.allLabelVals.length > 0 ? post.allLabelVals : undefined,
    repostSubjectUri: subjectUri,
    repostSubjectAuthorDid: subjectAuthorDid,
  }
}

const PROFILE_TTL_HOURS = 168

function profileIsComplete(row: AuthorProfileRow | undefined): boolean {
  if (!row) return false
  return Boolean(row.handle?.trim() && row.avatarUrl?.trim())
}

function authorFromRow(row: AuthorProfileRow | undefined, did: string): PoolMatchAuthor {
  return {
    did,
    handle: row?.handle?.trim() || null,
    displayName: row?.displayName?.trim() || null,
    avatarUrl: row?.avatarUrl?.trim() || null,
  }
}

/** Fill handle / avatar on pool match samples from cache + Bluesky. */
export async function enrichPoolMatchAuthors(
  pool: pg.Pool,
  samples: PoolMatchSample[],
): Promise<void> {
  if (samples.length === 0) return

  const dids = [
    ...new Set([
      ...samples.map((s) => s.author.did),
      ...samples.flatMap((s) => (s.quote?.author?.did ? [s.quote.author.did] : [])),
      ...samples.flatMap((s) =>
        s.repostSubject?.author?.did
          ? [s.repostSubject.author.did]
          : s.repostSubjectAuthorDid
            ? [s.repostSubjectAuthorDid]
            : [],
      ),
    ]),
  ]
  const cached = await getAuthorProfilesByDids(pool, dids)
  const byDid = new Map(cached.map((p) => [p.did, p]))

  const toFetch = dids.filter((did) => did && !profileIsComplete(byDid.get(did)))
  if (toFetch.length > 0) {
    try {
      const fetched = await fetchAuthorProfilesBatch(toFetch)
      await Promise.all(
        fetched.map(async (profile) => {
          await upsertAuthorProfile(pool, profile, PROFILE_TTL_HOURS)
          byDid.set(profile.did, {
            ...profile,
            fetchedAt: new Date(),
            expiresAt: null,
          })
        }),
      )
    } catch {
      /* best-effort — show DIDs without profiles */
    }
  }

  for (const sample of samples) {
    sample.author = authorFromRow(byDid.get(sample.author.did), sample.author.did)
    if (sample.quote?.author?.did) {
      sample.quote.author = authorFromRow(byDid.get(sample.quote.author.did), sample.quote.author.did)
    }
    if (sample.repostSubject) {
      const did = sample.repostSubject.author.did || sample.repostSubjectAuthorDid || ''
      if (did) sample.repostSubject.author = authorFromRow(byDid.get(did), did)
    } else if (sample.repostSubjectAuthorDid) {
      sample.repostSubject = {
        uri: sample.repostSubjectUri ?? '',
        text: sample.text.slice(0, 280),
        author: authorFromRow(
          byDid.get(sample.repostSubjectAuthorDid),
          sample.repostSubjectAuthorDid,
        ),
      }
    }
  }
}
