import type { L2NodeProvenance, L2RuleNode } from '@cfb/core-types'
import {
  newAndGroup,
  newAltTextCondition,
  newAuthorCondition,
  newCompareCondition,
  newEmbedCondition,
  newHashtagCondition,
  newKeywordCondition,
  newLabelsCondition,
  newLanguageCondition,
  newMediaStatsCondition,
  newMediaTypeCondition,
  newMimeTypeCondition,
  newMentionCondition,
  newNOfGroup,
  newOrGroup,
  newPostAgeCondition,
  newPostKindCondition,
  newRegexCondition,
  newScoreNode,
  newFollowRingCondition,
  newUrlCondition,
} from '../../../lib/l2-form'

export type PaletteCategory = 'structure' | 'text' | 'media' | 'social' | 'math' | 'scoring'

export interface PaletteItem {
  id: string
  label: string
  description: string
  category: PaletteCategory
  action: 'group' | 'condition'
  factory?: () => L2RuleNode
}

export const PALETTE_CATEGORIES: { id: PaletteCategory; title: string }[] = [
  { id: 'structure', title: 'Groups' },
  { id: 'scoring', title: 'Scoring' },
  { id: 'text', title: 'Text & tags' },
  { id: 'media', title: 'Media & post' },
  { id: 'social', title: 'Authors' },
  { id: 'math', title: 'Engagement' },
]

export const PALETTE_DRAG_MIME = 'application/x-cfb-palette-id'
export const PALETTE_LOGIC_BLOCK_MIME = 'application/x-cfb-logic-block'
export const PALETTE_SOURCE_MIME = 'application/x-cfb-source'

export type PaletteSourceId = 'native' | 'collection' | 'subscriptions'

export type CollectionSectionId = 'saved_blocks' | 'custom_code'

export type SubscriptionSectionId = 'all' | 'logic_blocks' | 'custom_code'

export interface PaletteLogicBlockEntry {
  kind: 'logic_block'
  packageId: string
  versionPin: string
  name: string
  description?: string
  provenance: L2NodeProvenance
  visibility?: string
}

export interface PaletteSourceEntry {
  kind: 'source'
  sourceId: string
  sourceType: 'project_pool' | 'static_uri_list' | 'feed' | 'subscribed'
  label: string
  description?: string
}

export type PalettePick =
  | { kind: 'native'; item: PaletteItem }
  | { kind: 'logic_block'; entry: PaletteLogicBlockEntry }
  | { kind: 'source'; entry: PaletteSourceEntry }

export function paletteDragPayload(entry: PalettePick): { mime: string; data: string } {
  if (entry.kind === 'native') {
    return { mime: PALETTE_DRAG_MIME, data: entry.item.id }
  }
  if (entry.kind === 'source') {
    return {
      mime: PALETTE_SOURCE_MIME,
      data: JSON.stringify(entry.entry),
    }
  }
  return {
    mime: PALETTE_LOGIC_BLOCK_MIME,
    data: JSON.stringify({
      packageId: entry.entry.packageId,
      versionPin: entry.entry.versionPin,
      name: entry.entry.name,
      provenance: entry.entry.provenance,
    }),
  }
}

export function parseLogicBlockDragData(raw: string): PaletteLogicBlockEntry | null {
  try {
    const o = JSON.parse(raw) as {
      packageId?: string
      versionPin?: string
      name?: string
      provenance?: L2NodeProvenance
    }
    if (!o.packageId || !o.versionPin || !o.name) return null
    return {
      kind: 'logic_block',
      packageId: o.packageId,
      versionPin: o.versionPin,
      name: o.name,
      provenance: o.provenance ?? 'subscription',
    }
  } catch {
    return null
  }
}

export function parseSourceDragData(raw: string): PaletteSourceEntry | null {
  try {
    const o = JSON.parse(raw) as PaletteSourceEntry
    if (!o.sourceId || !o.sourceType || !o.label) return null
    return o
  } catch {
    return null
  }
}

export const PALETTE_ITEMS: PaletteItem[] = [
  {
    id: 'group-and',
    label: 'AND group',
    description: 'Top-level block or nest inside selection — all children must pass',
    category: 'structure',
    action: 'group',
    factory: newAndGroup,
  },
  {
    id: 'group-or',
    label: 'OR group',
    description: 'Top-level block or nest inside selection — any child can pass',
    category: 'structure',
    action: 'group',
    factory: newOrGroup,
  },
  {
    id: 'group-n-of',
    label: 'N-of group',
    description: 'Top-level or nested — at least N children must pass',
    category: 'structure',
    action: 'group',
    factory: () => newNOfGroup(2),
  },
  {
    id: 'keyword',
    label: 'Keyword',
    description: 'Substring search — multiple terms, any field (partial matches)',
    category: 'text',
    action: 'condition',
    factory: newKeywordCondition,
  },
  {
    id: 'regex',
    label: 'Regex',
    description: 'JavaScript (ECMAScript) regex across body, alt text, links, and facets',
    category: 'text',
    action: 'condition',
    factory: newRegexCondition,
  },
  {
    id: 'hashtag',
    label: 'Hashtag',
    description: 'Facet tag includes or excludes',
    category: 'text',
    action: 'condition',
    factory: newHashtagCondition,
  },
  {
    id: 'url',
    label: 'URL',
    description: 'Match link card, facet, or bridged URLs — not plain post text',
    category: 'text',
    action: 'condition',
    factory: newUrlCondition,
  },
  {
    id: 'mention',
    label: 'Mention',
    description: 'Post @mentions an account (facet mentions — handles or DIDs)',
    category: 'social',
    action: 'condition',
    factory: newMentionCondition,
  },
  {
    id: 'language',
    label: 'Language',
    description: 'Post language tag allowlist (e.g. en, es)',
    category: 'text',
    action: 'condition',
    factory: newLanguageCondition,
  },
  {
    id: 'labels',
    label: 'Labels',
    description: 'Self-labels and moderation labels (porn, graphic-media, …)',
    category: 'text',
    action: 'condition',
    factory: newLabelsCondition,
  },
  {
    id: 'embed',
    label: 'Embed',
    description: 'Require or exclude video, image, link card, quote, etc.',
    category: 'media',
    action: 'condition',
    factory: newEmbedCondition,
  },
  {
    id: 'post-kind',
    label: 'Post type',
    description: 'Root post, reply, quote, or repost',
    category: 'media',
    action: 'condition',
    factory: newPostKindCondition,
  },
  {
    id: 'media-type',
    label: 'Media type',
    description: 'Near You bucket — text, image, video, GIF, link, quote',
    category: 'media',
    action: 'condition',
    factory: newMediaTypeCondition,
  },
  {
    id: 'alt-text',
    label: 'Alt text',
    description: 'Require or exclude alt text on image/video/GIF posts',
    category: 'media',
    action: 'condition',
    factory: newAltTextCondition,
  },
  {
    id: 'post-age',
    label: 'Post age',
    description: 'Indexed or created within / older than N hours',
    category: 'media',
    action: 'condition',
    factory: newPostAgeCondition,
  },
  {
    id: 'media-stats',
    label: 'Media stats',
    description: 'Image count, file sizes (bytes), aspect ratios, link/mention facets',
    category: 'media',
    action: 'condition',
    factory: newMediaStatsCondition,
  },
  {
    id: 'mime-type',
    label: 'MIME type',
    description: 'Match embed blob types — image/jpeg, video/mp4, …',
    category: 'media',
    action: 'condition',
    factory: newMimeTypeCondition,
  },
  {
    id: 'follow-ring',
    label: 'Follow ring',
    description: 'Post author is in a hub account\'s follows or followers (community opt-in)',
    category: 'social',
    action: 'condition',
    factory: newFollowRingCondition,
  },
  {
    id: 'author',
    label: 'Author list',
    description: 'DID in cached list or manual DIDs',
    category: 'social',
    action: 'condition',
    factory: newAuthorCondition,
  },
  {
    id: 'math',
    label: 'Engagement math',
    description: 'Compare likes, quotes, bookmarks, followers, tag counts, age, …',
    category: 'math',
    action: 'condition',
    factory: newCompareCondition,
  },
  {
    id: 'score',
    label: 'Score',
    description: 'Add editorial score points to posts that pass through this node',
    category: 'scoring',
    action: 'condition',
    factory: newScoreNode,
  },
]

export const PALETTE_ITEM_BY_ID = Object.fromEntries(
  PALETTE_ITEMS.map((item) => [item.id, item]),
) as Record<string, PaletteItem>
