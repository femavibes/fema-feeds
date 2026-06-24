import type { EmbedFlags, PostKind } from './index.js'

/**
 * Near You–compatible media type (see ATlas `detectMediaType`).
 * 0=text, 1=image, 2=video, 3=gif, 4=link card, 5=quote record
 */
export type NearYouMediaType = 0 | 1 | 2 | 3 | 4 | 5

/** Aggregated media / facet stats from embedDetail — sizes, counts, aspect ratios. */
export interface PostMediaStats {
  imageCount: number
  /** Largest single-image blob size in bytes (0 if unknown). */
  imageMaxSizeBytes: number
  imageMinSizeBytes: number
  imageTotalSizeBytes: number
  /** Aspect ratio components (not pixel dimensions) of the largest image. */
  imageMaxAspectWidth: number
  imageMaxAspectHeight: number
  videoSizeBytes: number
  videoAspectWidth: number
  videoAspectHeight: number
  linkThumbSizeBytes: number
  facetLinkCount: number
  facetMentionCount: number
}

/** Denormalized post fields for ranker plugins — computed at ingest. */
export interface PostRankSnapshot {
  createdAt: string
  textLength: number
  mediaType: NearYouMediaType
  /** null when no media or not applicable */
  hasAltText: boolean | null
  facetTagCount: number
  hiddenFacetTagCount: number
  outlineTagCount: number
  postKind: PostKind
  langs: string[]
  embed: EmbedFlags
  labelVals: string[]
  mediaStats: PostMediaStats
}

/**
 * Full post + author context passed to ranker plugins at skeleton serve time.
 * Geo and viewer-specific fields are intentionally omitted until CFB stores them.
 */
export interface RankerCandidate {
  uri: string
  cid: string
  authorDid: string
  indexedAt: string
  createdAt: string
  postKind: PostKind
  langs: string[]
  likeCount: number
  repostCount: number
  replyCount: number
  quoteCount: number
  bookmarkCount: number
  authorFollowerCount: number
  authorFollowsCount: number
  authorPostsCount: number
  authorHandle: string | null
  textLength: number
  mediaType: NearYouMediaType
  hasMedia: boolean
  hasAltText: boolean | null
  embed: EmbedFlags
  facetTagCount: number
  hiddenFacetTagCount: number
  outlineTagCount: number
  labelVals: string[]
  rankSnapshot: PostRankSnapshot
}
