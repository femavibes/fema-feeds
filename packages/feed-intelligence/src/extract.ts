import type { NormalizedPost } from '@cfb/core-types'
import type { SignalEntry } from './types.js'
import { extractNgrams } from './ngrams.js'

/** Extract hostname from a URL, stripping www. prefix. */
function extractDomain(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    // Skip common link shorteners and bsky internal
    if (host === 'bsky.app' || host === 't.co' || host === 'bit.ly') return null
    return host
  } catch {
    return null
  }
}

/** Collect alt text from post embed images. */
function collectAltText(post: NormalizedPost): string {
  const parts: string[] = []
  const detail = post.embedDetail
  if (!detail) return ''
  if (detail.images) {
    for (const img of detail.images) {
      if (img.alt) parts.push(img.alt)
    }
  }
  if (detail.media?.images) {
    for (const img of detail.media.images) {
      if (img.alt) parts.push(img.alt)
    }
  }
  if (detail.video?.alt) parts.push(detail.video.alt)
  if (detail.media?.video?.alt) parts.push(detail.media.video.alt)
  return parts.join(' ')
}

/** Extract the author DID of a quoted/replied post (engaged account). */
function extractEngagedAccounts(post: NormalizedPost): string[] {
  const accounts: string[] = []
  // Reply parent author — we only have the URI, extract DID from it
  if (post.reply?.parentUri) {
    const did = didFromUri(post.reply.parentUri)
    if (did) accounts.push(did)
  }
  // Quoted post author
  if (post.embedDetail?.record?.uri) {
    const did = didFromUri(post.embedDetail.record.uri)
    if (did) accounts.push(did)
  }
  if (post.embedDetail?.quotedRecord?.uri) {
    const did = didFromUri(post.embedDetail.quotedRecord.uri)
    if (did) accounts.push(did)
  }
  return accounts
}

function didFromUri(uri: string): string | null {
  // at://did:plc:xxx/app.bsky.feed.post/yyy
  const match = uri.match(/^at:\/\/(did:[^/]+)/)
  return match?.[1] ?? null
}

/**
 * Extract all signals from a NormalizedPost.
 * Language param controls n-gram stop-word filtering.
 */
export function extractSignals(post: NormalizedPost, lang: string): SignalEntry[] {
  const signals: SignalEntry[] = []

  // 1. Hashtags
  for (const tag of post.facetTags) {
    signals.push({ type: 'hashtag', value: tag.toLowerCase() })
  }

  // 2. Mentions
  for (const did of post.facetMentions) {
    signals.push({ type: 'mention', value: did })
  }

  // 3. Domains
  for (const url of post.facetLinks) {
    const domain = extractDomain(url)
    if (domain) signals.push({ type: 'domain', value: domain })
  }
  // Also check link card
  if (post.embedDetail?.external?.uri) {
    const domain = extractDomain(post.embedDetail.external.uri)
    if (domain) signals.push({ type: 'domain', value: domain })
  }

  // 4. N-grams (text + alt text)
  const fullText = post.text + ' ' + collectAltText(post)
  const ngrams = extractNgrams(fullText, lang)
  for (const ng of ngrams) {
    signals.push({ type: 'ngram', value: ng })
  }

  // 5. Engaged accounts
  for (const did of extractEngagedAccounts(post)) {
    signals.push({ type: 'engaged_account', value: did })
  }

  return signals
}
