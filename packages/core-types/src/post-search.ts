import type { NormalizedPost } from './index.js'
import type { PostEmbedDetail, PostEmbedMedia, PostSearchField, PostUrlSource } from './post-record.js'

export const DEFAULT_URL_SOURCES: PostUrlSource[] = ['link_card', 'facet_link', 'bridgy_original']

function pushIf(parts: string[], value: string | undefined): void {
  const v = value?.trim()
  if (v) parts.push(v)
}

function imageAlts(images: { alt?: string }[] | undefined): string[] {
  return (images ?? []).map((i) => i.alt?.trim()).filter((a): a is string => Boolean(a))
}

function collectFromMedia(parts: string[], media: PostEmbedMedia | undefined, fields: PostSearchField[]): void {
  if (!media) return
  if (fields.includes('image_alt')) parts.push(...imageAlts(media.images))
  if (fields.includes('video_alt') && media.video?.alt) parts.push(media.video.alt)
  if (fields.includes('link_title')) pushIf(parts, media.external?.title)
  if (fields.includes('link_description')) pushIf(parts, media.external?.description)
  if (fields.includes('link_uri')) pushIf(parts, media.external?.uri)
}

function collectFromEmbed(parts: string[], embed: PostEmbedDetail | undefined, fields: PostSearchField[]): void {
  if (!embed) return
  if (fields.includes('image_alt')) parts.push(...imageAlts(embed.images))
  if (fields.includes('video_alt') && embed.video?.alt) parts.push(embed.video.alt)
  if (fields.includes('link_title')) pushIf(parts, embed.external?.title)
  if (fields.includes('link_description')) pushIf(parts, embed.external?.description)
  if (fields.includes('link_uri')) pushIf(parts, embed.external?.uri)
  collectFromMedia(parts, embed.media, fields)
}

function collectFacetUrls(parts: string[], post: NormalizedPost, fields: PostSearchField[]): void {
  if (fields.includes('facet_link')) parts.push(...post.facetLinks)
  if (fields.includes('facet_mention')) parts.push(...post.facetMentions)
}

export interface KeywordMatchOptions {
  /** When false (default), matching is case-insensitive. */
  caseSensitive?: boolean
  /** When true, terms must match as whole words (\\b boundaries). */
  wholeWord?: boolean
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** True if any term appears in haystack. Substring by default; optional whole-word / case rules. */
export function textContainsAny(
  text: string,
  terms: string[],
  options: KeywordMatchOptions = {},
): boolean {
  const caseSensitive = options.caseSensitive === true
  const wholeWord = options.wholeWord === true

  return terms.some((raw) => {
    const needle = raw.trim()
    if (!needle) return false

    if (wholeWord) {
      const pattern = `\\b${escapeRegExp(needle)}\\b`
      const flags = caseSensitive ? '' : 'i'
      try {
        return new RegExp(pattern, flags).test(text)
      } catch {
        return false
      }
    }

    if (caseSensitive) return text.includes(needle)
    const lower = text.toLowerCase()
    return lower.includes(needle.toLowerCase())
  })
}

/** Test haystack against a JS regex pattern. Invalid patterns never match. */
export function compileRegex(
  pattern: string,
  caseInsensitive = true,
): { regex: RegExp } | { error: string } {
  const trimmed = pattern.trim()
  if (!trimmed) return { error: 'Pattern is empty' }
  try {
    const flags = caseInsensitive ? 'i' : ''
    return { regex: new RegExp(trimmed, flags) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Invalid pattern' }
  }
}

/** Human-readable label for UI — matches `new RegExp()` in Node and browsers. */
export const REGEX_ENGINE_LABEL = 'JavaScript (ECMAScript)'

export function textMatchesRegex(
  text: string,
  pattern: string,
  caseInsensitive = true,
): boolean {
  const compiled = compileRegex(pattern, caseInsensitive)
  if ('error' in compiled) return false
  return compiled.regex.test(text)
}

function pushLinkCardUrls(parts: string[], embed: PostEmbedDetail | undefined): void {
  if (!embed) return
  pushIf(parts, embed.external?.uri)
  pushIf(parts, embed.media?.external?.uri)
}

/** Collect URLs from configured sources (L2 URL condition). */
export function collectPostUrls(post: NormalizedPost, sources: PostUrlSource[]): string[] {
  const urls: string[] = []
  if (sources.includes('link_card')) pushLinkCardUrls(urls, post.embedDetail)
  if (sources.includes('facet_link')) urls.push(...post.facetLinks)
  if (sources.includes('bridgy_original')) pushIf(urls, post.bridgyOriginalUrl)
  return urls.map((u) => u.trim()).filter(Boolean)
}

/** True if any pattern appears in any URL (substring match per URL). */
export function urlMatchesAny(
  urls: string[],
  patterns: string[],
  options: KeywordMatchOptions = {},
): boolean {
  if (patterns.length === 0 || urls.length === 0) return false
  return urls.some((url) => textContainsAny(url, patterns, options))
}

/** Join configured searchable fields from a normalized post (L1 keyword / L2 keyword). */
export function collectSearchableText(post: NormalizedPost, fields: PostSearchField[]): string {
  const parts: string[] = []
  if (fields.includes('text')) parts.push(post.text)
  if (fields.includes('bridgy_original_text')) pushIf(parts, post.bridgyOriginalText)
  if (fields.includes('bridgy_original_url')) pushIf(parts, post.bridgyOriginalUrl)
  collectFromEmbed(parts, post.embedDetail, fields)
  collectFacetUrls(parts, post, fields)
  return parts.join('\n')
}
