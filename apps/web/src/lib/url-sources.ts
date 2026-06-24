import type { PostUrlSource } from '@cfb/core-types'

export interface UrlSourceOption {
  source: PostUrlSource
  label: string
  hint: string
}

export const URL_SOURCE_OPTIONS: UrlSourceOption[] = [
  {
    source: 'link_card',
    label: 'Link card URL',
    hint: 'Preview card destination (embed external URI)',
  },
  {
    source: 'facet_link',
    label: 'Facet URLs',
    hint: 'Auto-linked URLs in the post body',
  },
  {
    source: 'bridgy_original',
    label: 'Bridgy original URL',
    hint: 'Source URL on bridged posts',
  },
]

export const DEFAULT_URL_SOURCES: PostUrlSource[] = URL_SOURCE_OPTIONS.map((o) => o.source)

export function urlSourceLabel(source: PostUrlSource): string {
  return URL_SOURCE_OPTIONS.find((o) => o.source === source)?.label ?? source.replace(/_/g, ' ')
}
