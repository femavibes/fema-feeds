import type { AspectRatio } from '@cfb/core-types'
import type { PoolMatchAuthor, PoolMatchSample } from './pool-match-sample.js'

export interface PoolMatchMediaPreview {
  kind: 'image' | 'video' | 'link'
  thumbUrl?: string
  fullUrl?: string
  alt?: string
  title?: string
  href?: string
  aspectRatio?: AspectRatio
}

export interface PoolMatchQuotePreview {
  uri: string
  text: string
  author: PoolMatchAuthor
  thumbUrl?: string
  unavailable?: 'not-found' | 'blocked' | 'detached'
}

interface FeedPostView {
  uri?: string
  embed?: unknown
}

const PUBLIC_API = process.env.BSKY_PUBLIC_API ?? 'https://public.api.bsky.app'
const FETCH_TIMEOUT_MS = 12_000

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function parseAspectRatio(raw: unknown): AspectRatio | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as { width?: unknown; height?: unknown }
  const width = typeof o.width === 'number' ? o.width : undefined
  const height = typeof o.height === 'number' ? o.height : undefined
  if (width === undefined || height === undefined) return undefined
  return { width, height }
}

function authorFromProfileView(raw: unknown): PoolMatchAuthor {
  if (!raw || typeof raw !== 'object') {
    return { did: '', handle: null, displayName: null, avatarUrl: null }
  }
  const o = raw as {
    did?: unknown
    handle?: unknown
    displayName?: unknown
    avatar?: unknown
  }
  return {
    did: str(o.did) ?? '',
    handle: str(o.handle) ?? null,
    displayName: str(o.displayName) ?? null,
    avatarUrl: str(o.avatar) ?? null,
  }
}

function extractQuoteFromRecordEmbed(embed: unknown): PoolMatchQuotePreview | undefined {
  if (!embed || typeof embed !== 'object') return undefined
  const record = (embed as { record?: unknown }).record
  if (!record || typeof record !== 'object') return undefined

  const r = record as {
    $type?: string
    uri?: string
    notFound?: boolean
    blocked?: boolean
    detached?: boolean
    value?: { text?: unknown }
    author?: unknown
    embeds?: unknown[]
  }

  const uri = str(r.uri) ?? ''
  if (r.$type === 'app.bsky.embed.record#viewNotFound' || r.notFound) {
    return {
      uri,
      text: '(quoted post not found)',
      author: { did: '', handle: null, displayName: null, avatarUrl: null },
      unavailable: 'not-found',
    }
  }
  if (r.$type === 'app.bsky.embed.record#viewBlocked' || r.blocked) {
    return {
      uri,
      text: '(quoted post blocked)',
      author: authorFromProfileView(r.author),
      unavailable: 'blocked',
    }
  }
  if (r.$type === 'app.bsky.embed.record#viewDetached' || r.detached) {
    return {
      uri,
      text: '(quoted post unavailable)',
      author: { did: '', handle: null, displayName: null, avatarUrl: null },
      unavailable: 'detached',
    }
  }

  const text =
    r.value && typeof r.value === 'object' && typeof r.value.text === 'string'
      ? r.value.text
      : ''

  let thumbUrl: string | undefined
  if (Array.isArray(r.embeds)) {
    for (const nested of r.embeds) {
      const { media } = extractMediaFromEmbed(nested)
      const first = media.find((m) => m.thumbUrl)
      if (first?.thumbUrl) {
        thumbUrl = first.thumbUrl
        break
      }
    }
  }

  if (!uri && !text) return undefined

  return {
    uri,
    text: text.slice(0, 280),
    author: authorFromProfileView(r.author),
    thumbUrl,
  }
}

export function extractMediaFromEmbed(embed: unknown): {
  media: PoolMatchMediaPreview[]
  quote?: PoolMatchQuotePreview
} {
  if (!embed || typeof embed !== 'object') return { media: [] }

  const e = embed as { $type?: string; media?: unknown; record?: unknown; external?: unknown }
  const type = e.$type ?? ''
  const media: PoolMatchMediaPreview[] = []
  let quote: PoolMatchQuotePreview | undefined

  if (type.startsWith('app.bsky.embed.images')) {
    const images = (e as { images?: unknown[] }).images ?? []
    for (const raw of images) {
      if (!raw || typeof raw !== 'object') continue
      const img = raw as {
        thumb?: unknown
        fullsize?: unknown
        alt?: unknown
        aspectRatio?: unknown
      }
      media.push({
        kind: 'image',
        thumbUrl: str(img.thumb),
        fullUrl: str(img.fullsize),
        alt: str(img.alt),
        aspectRatio: parseAspectRatio(img.aspectRatio),
      })
    }
  }

  if (type.startsWith('app.bsky.embed.video')) {
    const v = e as {
      thumbnail?: unknown
      playlist?: unknown
      alt?: unknown
      aspectRatio?: unknown
    }
    media.push({
      kind: 'video',
      thumbUrl: str(v.thumbnail),
      href: str(v.playlist),
      alt: str(v.alt),
      aspectRatio: parseAspectRatio(v.aspectRatio),
    })
  }

  if (type.startsWith('app.bsky.embed.external')) {
    const ext =
      e.external && typeof e.external === 'object'
        ? (e.external as {
            uri?: unknown
            title?: unknown
            description?: unknown
            thumb?: unknown
          })
        : null
    if (ext) {
      media.push({
        kind: 'link',
        thumbUrl: str(ext.thumb),
        title: str(ext.title),
        alt: str(ext.description),
        href: str(ext.uri),
      })
    }
  }

  if (type.startsWith('app.bsky.embed.recordWithMedia')) {
    const inner = extractMediaFromEmbed(e.media)
    media.push(...inner.media)
    quote = extractQuoteFromRecordEmbed(e) ?? inner.quote
  } else if (type.startsWith('app.bsky.embed.record')) {
    quote = extractQuoteFromRecordEmbed(e)
  }

  return { media, quote }
}

export function extractPreviewsFromPostView(view: FeedPostView): {
  media: PoolMatchMediaPreview[]
  quote?: PoolMatchQuotePreview
} {
  return extractMediaFromEmbed(view.embed)
}

async function fetchPostViews(uris: string[]): Promise<Map<string, FeedPostView>> {
  const map = new Map<string, FeedPostView>()
  if (uris.length === 0) return map

  for (let i = 0; i < uris.length; i += 25) {
    const batch = uris.slice(i, i + 25)
    const params = new URLSearchParams()
    for (const uri of batch) params.append('uris', uri)
    try {
      const res = await fetchWithTimeout(`${PUBLIC_API}/xrpc/app.bsky.feed.getPosts?${params}`)
      if (!res.ok) continue
      const data = (await res.json()) as { posts?: FeedPostView[] }
      for (const post of data.posts ?? []) {
        if (post.uri) map.set(post.uri, post)
      }
    } catch {
      /* best-effort */
    }
  }

  return map
}

/** Fetch Bluesky post views and attach media thumbnails + quoted post previews. */
export async function enrichPoolMatchPreviews(samples: PoolMatchSample[]): Promise<void> {
  if (samples.length === 0) return

  const uris = [...new Set(samples.map((s) => s.uri))]
  const views = await fetchPostViews(uris)

  for (const sample of samples) {
    const view = views.get(sample.uri)
    if (!view) {
      sample.media = []
      continue
    }
    const { media, quote } = extractPreviewsFromPostView(view)
    sample.media = media
    if (quote) sample.quote = quote
  }
}
