import type {
  L2BoolCondition,
  L2MediaCondition,
  L2MediaKind,
  L2MediaTypeCondition,
  L2MediaTypeValue,
  L2RuleNode,
} from '@cfb/core-types'

const MEDIA_TYPE_TO_KIND: Record<L2MediaTypeValue, L2MediaKind> = {
  0: 'text_only',
  1: 'image',
  2: 'video',
  3: 'gif',
  4: 'link_card',
  5: 'quote',
}

function boolFieldToKind(field: L2BoolCondition['field']): L2MediaKind | null {
  switch (field) {
    case 'has_video':
      return 'video'
    case 'has_gif':
      return 'gif'
    case 'has_image':
      return 'image'
    case 'has_link_card':
      return 'link_card'
    case 'has_quote':
      return 'quote'
    case 'has_record':
    case 'has_quote_with_media':
      return 'quote_with_media'
    case 'has_text_only':
      return 'text_only'
    default:
      return null
  }
}

/** Convert legacy Embed (`bool`) node → Media multi-toggle. */
export function migrateBoolToMedia(node: L2BoolCondition): L2MediaCondition {
  const kind = boolFieldToKind(node.field) ?? 'video'
  return {
    type: 'media',
    id: node.id,
    op: node.value ? 'is' : 'is_not',
    kinds: [kind],
    ...(node.runAtIngest !== undefined ? { runAtIngest: node.runAtIngest } : {}),
  }
}

/** Convert legacy exclusive-bucket Media type → flag-based Media (best-effort). */
export function migrateMediaTypeToMedia(node: L2MediaTypeCondition): L2MediaCondition {
  const kinds = (node.mediaTypes ?? [])
    .map((t) => MEDIA_TYPE_TO_KIND[t])
    .filter((k): k is L2MediaKind => Boolean(k))
  return {
    type: 'media',
    id: node.id,
    op: node.op,
    kinds: kinds.length > 0 ? kinds : ['image'],
  }
}

/** Migrate deprecated bool / media_type leaves to `media` (recursive). */
export function migrateMediaNodes(node: L2RuleNode): L2RuleNode {
  if (node.type === 'group') {
    return {
      ...node,
      children: (node.children ?? []).map(migrateMediaNodes),
    }
  }
  if (node.type === 'bool') return migrateBoolToMedia(node)
  if (node.type === 'media_type') return migrateMediaTypeToMedia(node)
  return node
}
