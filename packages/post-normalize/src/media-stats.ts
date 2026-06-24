import type {
  NormalizedPost,
  PostEmbedDetail,
  PostExternalEmbed,
  PostImageItem,
  PostMediaStats,
  PostVideoEmbed,
} from '@cfb/core-types'

export function allEmbedImages(detail?: PostEmbedDetail): PostImageItem[] {
  if (!detail) return []
  return [...(detail.images ?? []), ...(detail.media?.images ?? [])]
}

export function embedVideo(detail?: PostEmbedDetail): PostVideoEmbed | undefined {
  return detail?.video ?? detail?.media?.video
}

export function embedExternal(detail?: PostEmbedDetail): PostExternalEmbed | undefined {
  return detail?.external ?? detail?.media?.external
}

function maxAspectRatio(images: PostImageItem[]): { width: number; height: number } {
  let bestW = 0
  let bestH = 0
  for (const img of images) {
    const ar = img.aspectRatio
    if (!ar?.width || !ar?.height) continue
    const area = ar.width * ar.height
    const bestArea = bestW * bestH
    if (area > bestArea) {
      bestW = ar.width
      bestH = ar.height
    }
  }
  return { width: bestW, height: bestH }
}

/** Aggregated embed + facet stats from parsed record metadata (sizes, counts, aspect ratios). */
export function buildPostMediaStats(input: {
  embedDetail?: PostEmbedDetail
  facetLinks?: string[]
  facetMentions?: string[]
}): PostMediaStats {
  const images = allEmbedImages(input.embedDetail)
  const sizes = images
    .map((img) => img.size)
    .filter((size): size is number => typeof size === 'number' && size >= 0)
  const video = embedVideo(input.embedDetail)
  const external = embedExternal(input.embedDetail)
  const maxAspect = maxAspectRatio(images)

  return {
    imageCount: images.length,
    imageMaxSizeBytes: sizes.length ? Math.max(...sizes) : 0,
    imageMinSizeBytes: sizes.length ? Math.min(...sizes) : 0,
    imageTotalSizeBytes: sizes.reduce((sum, size) => sum + size, 0),
    imageMaxAspectWidth: maxAspect.width,
    imageMaxAspectHeight: maxAspect.height,
    videoSizeBytes: video?.size ?? 0,
    videoAspectWidth: video?.aspectRatio?.width ?? 0,
    videoAspectHeight: video?.aspectRatio?.height ?? 0,
    linkThumbSizeBytes: external?.thumbSize ?? 0,
    facetLinkCount: input.facetLinks?.length ?? 0,
    facetMentionCount: input.facetMentions?.length ?? 0,
  }
}

export function buildPostMediaStatsFromPost(post: NormalizedPost): PostMediaStats {
  return buildPostMediaStats({
    embedDetail: post.embedDetail,
    facetLinks: post.facetLinks,
    facetMentions: post.facetMentions,
  })
}

/** All mime types reported on embed blobs (images, video, link thumb). */
export function collectEmbedMimeTypes(post: NormalizedPost): string[] {
  const out: string[] = []
  for (const img of allEmbedImages(post.embedDetail)) {
    if (img.mimeType) out.push(img.mimeType.toLowerCase())
  }
  const video = embedVideo(post.embedDetail)
  if (video?.mimeType) out.push(video.mimeType.toLowerCase())
  const external = embedExternal(post.embedDetail)
  if (external?.thumbMimeType) out.push(external.thumbMimeType.toLowerCase())
  return out
}
