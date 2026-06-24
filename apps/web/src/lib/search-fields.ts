import type { PostSearchField } from '@cfb/core-types'

export interface SearchFieldOption {
  field: PostSearchField
  label: string
}

export const SEARCH_FIELD_OPTIONS: SearchFieldOption[] = [
  { field: 'text', label: 'Post text' },
  { field: 'image_alt', label: 'Image alt text' },
  { field: 'video_alt', label: 'Video alt text' },
  { field: 'link_title', label: 'Link title' },
  { field: 'link_description', label: 'Link description' },
  { field: 'link_uri', label: 'Link URL' },
  { field: 'facet_link', label: 'Facet URLs' },
  { field: 'facet_mention', label: 'Facet mentions' },
  { field: 'bridgy_original_text', label: 'Bridgy original text' },
  { field: 'bridgy_original_url', label: 'Bridgy original URL' },
]

export const DEFAULT_SEARCH_FIELDS: PostSearchField[] = ['text']

export function searchFieldLabel(field: PostSearchField): string {
  return SEARCH_FIELD_OPTIONS.find((o) => o.field === field)?.label ?? field.replace(/_/g, ' ')
}
