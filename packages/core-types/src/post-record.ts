/** Structured Bluesky record fields extracted once at ingest. */

export interface AspectRatio {
  width: number
  height: number
}

export interface PostImageItem {
  alt?: string
  mimeType?: string
  size?: number
  aspectRatio?: AspectRatio
}

export interface PostVideoEmbed {
  alt?: string
  mimeType?: string
  size?: number
  aspectRatio?: AspectRatio
  presentation?: string
}

export interface PostExternalEmbed {
  uri: string
  title?: string
  description?: string
  thumbMimeType?: string
  thumbSize?: number
}

export interface PostQuoteRef {
  uri: string
  cid?: string
}

/** Media block inside recordWithMedia (images / video / external). */
export interface PostEmbedMedia {
  $type?: string
  images?: PostImageItem[]
  video?: PostVideoEmbed
  external?: PostExternalEmbed
}

/** Parsed embed subtree — booleans in EmbedFlags are derived from this. */
export interface PostEmbedDetail {
  $type?: string
  images?: PostImageItem[]
  video?: PostVideoEmbed
  external?: PostExternalEmbed
  /** app.bsky.embed.record */
  record?: PostQuoteRef
  /** app.bsky.embed.recordWithMedia — attached media */
  media?: PostEmbedMedia
  /** app.bsky.embed.recordWithMedia — quoted post ref (nested record.record) */
  quotedRecord?: PostQuoteRef
}

export interface PostReplyRefs {
  rootUri?: string
  parentUri?: string
}

export type PostSearchField =
  | 'text'
  | 'bridgy_original_text'
  | 'bridgy_original_url'
  | 'image_alt'
  | 'video_alt'
  | 'link_title'
  | 'link_description'
  | 'link_uri'
  | 'facet_link'
  | 'facet_mention'

/** URL sources for the dedicated L2 URL condition (not post body text). */
export type PostUrlSource = 'link_card' | 'facet_link' | 'bridgy_original'
