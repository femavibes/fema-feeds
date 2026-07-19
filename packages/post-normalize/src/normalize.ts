import type {
  AspectRatio,
  EmbedFlags,
  NormalizedPost,
  PostEmbedDetail,
  PostEmbedMedia,
  PostExternalEmbed,
  PostImageItem,
  PostKind,
  PostQuoteRef,
  PostReplyRefs,
  PostVideoEmbed,
} from '@cfb/core-types'

/** Loose Jetstream commit shape — tightened as we wire real client. */
export interface JetstreamPostEvent {
  uri: string
  cid: string
  author: string
  record: {
    $type?: string
    text?: string
    createdAt?: string
    langs?: string[] | string | Record<string, unknown>
    reply?: { root?: { uri?: string }; parent?: { uri?: string } }
    embed?: Record<string, unknown>
    facets?: Array<{
      index?: { byteStart?: number; byteEnd?: number }
      features?: Array<{
        $type?: string
        tag?: string
        uri?: string
        did?: string
      }>
    }>
    tags?: string[]
    labels?: { $type?: string; values?: Array<{ val?: string }> }
    bridgyOriginalText?: string
    bridgyOriginalUrl?: string
  }
  time?: string
}

const textByteLength = (text: string): number => new TextEncoder().encode(text).length

export function normalizeLangs(raw: JetstreamPostEvent['record']['langs']): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string') return [raw]
  return []
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function parseAspectRatio(raw: unknown): AspectRatio | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as { width?: unknown; height?: unknown }
  const width = num(o.width)
  const height = num(o.height)
  if (width === undefined || height === undefined) return undefined
  return { width, height }
}

function parseBlobFields(blob: unknown): { mimeType?: string; size?: number } {
  if (!blob || typeof blob !== 'object') return {}
  const o = blob as { mimeType?: unknown; size?: unknown }
  return { mimeType: str(o.mimeType), size: num(o.size) }
}

function parseImageItem(raw: unknown): PostImageItem | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as {
    alt?: unknown
    image?: unknown
    aspectRatio?: unknown
    mimeType?: unknown
    size?: unknown
  }
  const blob = parseBlobFields(o.image ?? raw)
  return {
    alt: str(o.alt),
    mimeType: blob.mimeType ?? str(o.mimeType),
    size: blob.size ?? num(o.size),
    aspectRatio: parseAspectRatio(o.aspectRatio),
  }
}

/** app.bsky.embed.gallery items — currently #image; leave room for future video items. */
function parseGalleryItems(raw: unknown): PostImageItem[] {
  if (!Array.isArray(raw)) return []
  const out: PostImageItem[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as { $type?: unknown }
    const t = str(o.$type) ?? ''
    // Record shape: gallery#image. View shape (rare at ingest): gallery#viewImage.
    if (
      t === 'app.bsky.embed.gallery#image' ||
      t === 'app.bsky.embed.gallery#viewImage' ||
      // Untyped / older drafts: treat blob-bearing items as images.
      (!t && 'image' in (item as object))
    ) {
      const parsed = parseImageItem(item)
      if (parsed) out.push(parsed)
    }
  }
  return out
}

function isGalleryEmbedType($type: string | undefined): boolean {
  return $type === 'app.bsky.embed.gallery'
}

function parseVideoEmbed(
  embed: Record<string, unknown>,
  media?: Record<string, unknown>,
): PostVideoEmbed | undefined {
  const videoRaw = embed.video ?? media?.video
  const blob = parseBlobFields(videoRaw)
  const alt = str(embed.alt) ?? str(media?.alt)
  const aspectRatio = parseAspectRatio(embed.aspectRatio ?? media?.aspectRatio)
  const presentation = str(embed.presentation) ?? str(media?.presentation)
  if (!blob.mimeType && !blob.size && !alt && !aspectRatio && !presentation) return undefined
  return {
    alt,
    mimeType: blob.mimeType,
    size: blob.size,
    aspectRatio,
    presentation,
  }
}

function parseExternalEmbed(raw: unknown): PostExternalEmbed | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as {
    uri?: unknown
    title?: unknown
    description?: unknown
    thumb?: unknown
  }
  const uri = str(o.uri)
  if (!uri) return undefined
  const thumb = parseBlobFields(o.thumb)
  return {
    uri,
    title: str(o.title),
    description: str(o.description),
    thumbMimeType: thumb.mimeType,
    thumbSize: thumb.size,
  }
}

function parseQuoteRef(raw: unknown): PostQuoteRef | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as { uri?: unknown; cid?: unknown; record?: unknown }
  const nested =
    o.record && typeof o.record === 'object'
      ? (o.record as { uri?: unknown; cid?: unknown })
      : null
  const uri = str(nested?.uri) ?? str(o.uri)
  if (!uri) return undefined
  return { uri, cid: str(nested?.cid) ?? str(o.cid) }
}

function parseEmbedMedia(raw: unknown): PostEmbedMedia | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const $type = str(o.$type)
  const galleryImages = isGalleryEmbedType($type) ? parseGalleryItems(o.items) : []
  const images = Array.isArray(o.images)
    ? o.images.map(parseImageItem).filter((i): i is PostImageItem => i !== null)
    : galleryImages.length
      ? galleryImages
      : undefined
  const video = parseVideoEmbed(o)
  const external = parseExternalEmbed(o.external)
  if (!images?.length && !video && !external && !$type) return undefined
  return {
    $type,
    images: images?.length ? images : undefined,
    video,
    external,
  }
}

export function extractEmbedDetail(record: JetstreamPostEvent['record']): PostEmbedDetail | undefined {
  const embed = record.embed
  if (!embed || typeof embed !== 'object') return undefined
  const e = embed as Record<string, unknown>
  const $type = str(e.$type)

  if ($type === 'app.bsky.embed.recordWithMedia') {
    const media = parseEmbedMedia(e.media)
    const quotedRecord = parseQuoteRef(e.record)
    if (!media && !quotedRecord) return { $type }
    return { $type, media, quotedRecord }
  }

  if (isGalleryEmbedType($type)) {
    const images = parseGalleryItems(e.items)
    return {
      $type,
      images: images.length ? images : undefined,
    }
  }

  const images = Array.isArray(e.images)
    ? e.images.map(parseImageItem).filter((i): i is PostImageItem => i !== null)
    : undefined
  const video = parseVideoEmbed(e)
  const external = parseExternalEmbed(e.external)
  const recordRef = $type === 'app.bsky.embed.record' ? parseQuoteRef(e.record) : undefined

  if (!images?.length && !video && !external && !recordRef && !$type) return undefined
  return {
    $type,
    images: images?.length ? images : undefined,
    video,
    external,
    record: recordRef,
  }
}

export function extractEmbedFlags(
  record: JetstreamPostEvent['record'],
  detail?: PostEmbedDetail,
): EmbedFlags {
  const embed = record.embed as Record<string, unknown> | undefined
  const media = embed?.media as Record<string, unknown> | undefined
  const d = detail ?? extractEmbedDetail(record)
  const embedType = str(embed?.$type)

  const video = d?.video ?? d?.media?.video
  const rawHasVideoBlob = Boolean(video ?? embed?.video ?? media?.video)
  const presentation =
    (video && typeof (video as { presentation?: unknown }).presentation === 'string'
      ? (video as { presentation: string }).presentation
      : undefined) ??
    (typeof embed?.presentation === 'string' ? embed.presentation : undefined) ??
    (typeof media?.presentation === 'string' ? media.presentation : undefined)
  const hasGif = rawHasVideoBlob && presentation === 'gif'
  const hasVideo = rawHasVideoBlob && !hasGif

  const galleryImages =
    isGalleryEmbedType(embedType) || isGalleryEmbedType(str(media?.$type))
      ? [
          ...parseGalleryItems(embed?.items),
          ...parseGalleryItems(media?.items),
        ]
      : []

  const hasImage = Boolean(
    (d?.images && d.images.length > 0) ||
      (d?.media?.images && d.media.images.length > 0) ||
      (Array.isArray(embed?.images) && embed.images.length > 0) ||
      (Array.isArray(media?.images) && media.images.length > 0) ||
      galleryImages.length > 0 ||
      // Gallery with unparsed/empty items is still an image embed, not text-only.
      isGalleryEmbedType(embedType) ||
      isGalleryEmbedType(str(media?.$type)),
  )
  const hasLinkCard = Boolean(d?.external ?? d?.media?.external ?? embed?.external ?? media?.external)

  // Keep quote vs quote+media mutually exclusive.
  const hasQuote = embedType === 'app.bsky.embed.record'
  const hasQuoteWithMedia = embedType === 'app.bsky.embed.recordWithMedia'
  const hasRecord = hasQuoteWithMedia

  const knownMedia =
    hasVideo || hasGif || hasImage || hasLinkCard || hasQuote || hasQuoteWithMedia
  // Any typed embed we don't fully map yet must not look like plain text.
  const hasTextOnly = !knownMedia && !embedType

  return {
    hasVideo,
    hasGif,
    hasImage,
    hasLinkCard,
    hasQuote,
    hasQuoteWithMedia,
    hasRecord,
    hasTextOnly,
  }
}

export function inferPostKind(record: JetstreamPostEvent['record']): PostKind {
  const embedType = str((record.embed as Record<string, unknown> | undefined)?.$type)
  // Any quote embed counts as quote — Media node distinguishes plain vs quote+media.
  if (
    embedType === 'app.bsky.embed.record' ||
    embedType === 'app.bsky.embed.recordWithMedia'
  ) {
    return 'quote'
  }
  if (record.reply) return 'reply'
  return 'root'
}

/** Jetstream create for app.bsky.feed.repost (not a post record). */
export interface JetstreamRepostEvent {
  uri: string
  cid: string
  author: string
  record: {
    $type?: string
    createdAt?: string
    subject?: { uri?: string; cid?: string }
  }
  time?: string
}

const EMPTY_REPOST_EMBED: EmbedFlags = {
  hasVideo: false,
  hasGif: false,
  hasImage: false,
  hasLinkCard: false,
  hasQuote: false,
  hasQuoteWithMedia: false,
  hasRecord: false,
  // Not a text post — Media "Text" should not match reshare records.
  hasTextOnly: false,
}

export function normalizeJetstreamRepost(event: JetstreamRepostEvent): NormalizedPost {
  const record = event.record ?? {}
  const subjectUri = str(record.subject?.uri)
  const indexedAt = event.time ?? new Date().toISOString()
  const createdAt = str(record.createdAt) ?? indexedAt

  return {
    uri: event.uri,
    cid: event.cid,
    authorDid: event.author,
    recordType: str(record.$type) ?? 'app.bsky.feed.repost',
    text: '',
    createdAt,
    langs: [],
    selfLabels: [],
    labelerLabels: [],
    postKind: 'repost',
    embed: { ...EMPTY_REPOST_EMBED },
    ...(subjectUri
      ? { repost: { subjectUri, subjectCid: str(record.subject?.cid) } }
      : {}),
    facetTags: [],
    hiddenFacetTags: [],
    facetLinks: [],
    facetMentions: [],
    outlineTags: [],
    indexedAt,
  }
}

/**
 * Overlay subject-post content onto a repost shell for L1/L2 matching + Matches UI.
 * Keeps repost identity (uri, reposter, postKind, timestamps).
 */
export function applyRepostSubject(
  repost: NormalizedPost,
  subject: NormalizedPost,
): NormalizedPost {
  return {
    ...subject,
    uri: repost.uri,
    cid: repost.cid,
    authorDid: repost.authorDid,
    recordType: repost.recordType || 'app.bsky.feed.repost',
    postKind: 'repost',
    createdAt: repost.createdAt,
    indexedAt: repost.indexedAt,
    repost: {
      subjectUri: subject.uri,
      subjectCid: subject.cid,
      subjectAuthorDid: subject.authorDid,
    },
  }
}

export interface FacetExtract {
  facetTags: string[]
  hiddenFacetTags: string[]
  facetLinks: string[]
  facetMentions: string[]
}

export function extractFacets(record: JetstreamPostEvent['record']): FacetExtract {
  const text = record.text ?? ''
  const textLen = textByteLength(text)
  const facetTags: string[] = []
  const hiddenFacetTags: string[] = []
  const facetLinks: string[] = []
  const facetMentions: string[] = []

  for (const facet of record.facets ?? []) {
    const byteEnd = facet.index?.byteEnd
    const isHidden = typeof byteEnd === 'number' && byteEnd > textLen
    for (const f of facet.features ?? []) {
      if (f.$type === 'app.bsky.richtext.facet#tag' && f.tag) {
        if (isHidden) hiddenFacetTags.push(f.tag)
        else facetTags.push(f.tag)
      }
      if (f.$type === 'app.bsky.richtext.facet#link' && f.uri) facetLinks.push(f.uri)
      if (f.$type === 'app.bsky.richtext.facet#mention' && f.did) facetMentions.push(f.did)
    }
  }

  return { facetTags, hiddenFacetTags, facetLinks, facetMentions }
}

/** @deprecated Use extractFacets — kept for callers that only need visible tags. */
export function extractFacetTags(record: JetstreamPostEvent['record']): string[] {
  return extractFacets(record).facetTags
}

export function extractSelfLabels(record: JetstreamPostEvent['record']): string[] {
  const vals: string[] = []
  for (const v of record.labels?.values ?? []) {
    if (v.val) vals.push(v.val)
  }
  return vals
}

export function extractReplyRefs(record: JetstreamPostEvent['record']): PostReplyRefs | undefined {
  const reply = record.reply
  if (!reply) return undefined
  const rootUri = str(reply.root?.uri)
  const parentUri = str(reply.parent?.uri)
  if (!rootUri && !parentUri) return undefined
  return { rootUri, parentUri }
}

export function normalizeJetstreamPost(event: JetstreamPostEvent): NormalizedPost {
  const record = event.record ?? {}
  const embedDetail = extractEmbedDetail(record)
  const facets = extractFacets(record)
  const indexedAt = event.time ?? new Date().toISOString()
  const createdAt = str(record.createdAt) ?? indexedAt

  return {
    uri: event.uri,
    cid: event.cid,
    authorDid: event.author,
    recordType: str(record.$type) ?? 'app.bsky.feed.post',
    text: record.text ?? '',
    createdAt,
    langs: normalizeLangs(record.langs),
    selfLabels: extractSelfLabels(record),
    labelerLabels: [],
    postKind: inferPostKind(record),
    embed: extractEmbedFlags(record, embedDetail),
    embedDetail,
    reply: extractReplyRefs(record),
    facetTags: facets.facetTags,
    hiddenFacetTags: facets.hiddenFacetTags,
    facetLinks: facets.facetLinks,
    facetMentions: facets.facetMentions,
    outlineTags: Array.isArray(record.tags) ? record.tags.map(String) : [],
    bridgyOriginalText: str(record.bridgyOriginalText),
    bridgyOriginalUrl: str(record.bridgyOriginalUrl),
    indexedAt,
  }
}
