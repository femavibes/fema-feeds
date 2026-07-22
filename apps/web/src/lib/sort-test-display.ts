import type { SortTestResult } from '../api/client'

export function atUriToBskyUrl(uri: string): string {
  const m = uri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/)
  if (!m) return uri
  return `https://bsky.app/profile/${m[1]}/post/${m[2]}`
}

export function sortFieldLabel(field: string): string {
  return field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Rank score display — enough precision to see decay effects on small scores. */
export function formatSortScore(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1000) return Math.round(value).toLocaleString()
  if (abs >= 100) return value.toFixed(1)
  if (abs >= 10) return value.toFixed(2)
  if (abs >= 1) return value.toFixed(3)
  return value.toFixed(4)
}

const BREAKDOWN_FIELD_ORDER = [
  'post_age_hours',
  'editor_score',
  'like_count',
  'repost_count',
  'reply_count',
  'quote_count',
  'bookmark_count',
  'author_follower_count',
] as const

export function sortBreakdownFields(fields: SortTestResult['fields']): SortTestResult['fields'] {
  const rank = new Map<string, number>()
  for (let i = 0; i < BREAKDOWN_FIELD_ORDER.length; i++) {
    rank.set(BREAKDOWN_FIELD_ORDER[i]!, i)
  }
  return [...fields].sort((a, b) => {
    const ai = rank.get(a.field)
    const bi = rank.get(b.field)
    if (ai != null && bi != null) return ai - bi
    if (ai != null) return -1
    if (bi != null) return 1
    return a.field.localeCompare(b.field)
  })
}

export function formatBreakdownValue(field: string, value: number): string {
  if (field === 'post_age_hours') return `${value.toFixed(2)}h`
  if (field === 'editor_score') return value.toLocaleString()
  return value.toLocaleString()
}
