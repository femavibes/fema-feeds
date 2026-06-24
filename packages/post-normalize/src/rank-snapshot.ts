import type {
  EmbedFlags,
  NearYouMediaType,
  NormalizedPost,
  PostEmbedDetail,
  PostRankSnapshot,
} from '@cfb/core-types'
import { allLabelValues } from '@cfb/core-types'
import { buildPostMediaStats } from './media-stats.js'

const EMPTY_EMBED: EmbedFlags = {
  hasVideo: false,
  hasImage: false,
  hasLinkCard: false,
  hasQuote: false,
  hasRecord: false,
  hasTextOnly: true,
}

/** Near You media_type — ported from ATlas subscription.detectMediaType */
export function detectNearYouMediaType(embedDetail: PostEmbedDetail | undefined, embed: EmbedFlags): NearYouMediaType {
  if (!embedDetail && embed.hasTextOnly) return 0
  if (embed.hasQuote || embedDetail?.record || embedDetail?.quotedRecord) return 5
  if (embed.hasImage) return 1
  if (embed.hasVideo) {
    const presentation = embedDetail?.video?.presentation ?? embedDetail?.media?.video?.presentation
    return presentation === 'gif' ? 3 : 2
  }
  if (embed.hasLinkCard) return 4
  if (embedDetail?.$type === 'app.bsky.embed.record') return 5
  return embed.hasTextOnly ? 0 : 1
}

function mediaHasAltText(embedDetail: PostEmbedDetail | undefined, mediaType: NearYouMediaType): boolean | null {
  if (mediaType === 0 || mediaType === 4 || mediaType === 5) return null
  if (!embedDetail) return null

  const images = embedDetail.images ?? embedDetail.media?.images
  if (mediaType === 1 && images?.length) {
    return images.every((img) => typeof img.alt === 'string' && img.alt.trim().length > 0)
  }

  const video = embedDetail.video ?? embedDetail.media?.video
  if ((mediaType === 2 || mediaType === 3) && video) {
    return typeof video.alt === 'string' && video.alt.trim().length > 0
  }

  return null
}

export function buildPostRankSnapshot(post: NormalizedPost): PostRankSnapshot {
  const embed = post.embed ?? EMPTY_EMBED
  const mediaType = detectNearYouMediaType(post.embedDetail, embed)
  return {
    createdAt: post.createdAt,
    textLength: post.text?.length ?? 0,
    mediaType,
    hasAltText: mediaHasAltText(post.embedDetail, mediaType),
    facetTagCount: post.facetTags?.length ?? 0,
    hiddenFacetTagCount: post.hiddenFacetTags?.length ?? 0,
    outlineTagCount: post.outlineTags?.length ?? 0,
    postKind: post.postKind,
    langs: post.langs ?? [],
    embed,
    labelVals: post.allLabelVals ?? allLabelValues(post),
    mediaStats: buildPostMediaStats({
      embedDetail: post.embedDetail,
      facetLinks: post.facetLinks,
      facetMentions: post.facetMentions,
    }),
  }
}

/** Build snapshot from persisted summary_json when column is empty (legacy rows). */
export function rankSnapshotFromSummary(summary: Record<string, unknown>): PostRankSnapshot {
  const embed = (summary.embed as EmbedFlags | undefined) ?? EMPTY_EMBED
  const embedDetail = summary.embedDetail as PostEmbedDetail | undefined
  const mediaType = detectNearYouMediaType(embedDetail, embed)
  const facetTags = summary.facetTags
  const hiddenFacetTags = summary.hiddenFacetTags
  const outlineTags = summary.outlineTags
  const facetLinks = summary.facetLinks
  const facetMentions = summary.facetMentions
  const labelVals = summary.allLabelVals
  return {
    createdAt: String(summary.createdAt ?? summary.indexedAt ?? new Date().toISOString()),
    textLength: typeof summary.text === 'string' ? summary.text.length : 0,
    mediaType,
    hasAltText: mediaHasAltText(embedDetail, mediaType),
    facetTagCount: Array.isArray(facetTags) ? facetTags.length : 0,
    hiddenFacetTagCount: Array.isArray(hiddenFacetTags) ? hiddenFacetTags.length : 0,
    outlineTagCount: Array.isArray(outlineTags) ? outlineTags.length : 0,
    postKind: (summary.postKind as PostRankSnapshot['postKind']) ?? 'root',
    langs: Array.isArray(summary.langs) ? summary.langs.map(String) : [],
    embed,
    labelVals: Array.isArray(labelVals) ? labelVals.map(String) : [],
    mediaStats: buildPostMediaStats({
      embedDetail,
      facetLinks: Array.isArray(facetLinks) ? facetLinks.map(String) : [],
      facetMentions: Array.isArray(facetMentions) ? facetMentions.map(String) : [],
    }),
  }
}
