import type {
  IngestGateBranch,
  IngestGateRule,
  L2MediaCondition,
  L2MediaKind,
} from '@cfb/core-types'

export function mediaKindToEmbedField(
  kind: L2MediaKind,
): Extract<IngestGateBranch, { type: 'embed' }>['field'] {
  switch (kind) {
    case 'text_only':
      return 'has_text_only'
    case 'image':
      return 'has_image'
    case 'video':
      return 'has_video'
    case 'gif':
      return 'has_gif'
    case 'link_card':
      return 'has_link_card'
    case 'quote':
      return 'has_quote'
    case 'quote_with_media':
      return 'has_quote_with_media'
  }
}

/** Compile Media multi-toggle to ingest rule(s). `is` = any-of; `is_not` = none-of (AND excludes). */
export function compileMediaIngestRule(
  node: L2MediaCondition,
  meta: { sourceFeedId: string; sourceNodeId: string },
): IngestGateRule | null {
  if (node.kinds.length === 0) return null

  const embeds: IngestGateBranch[] = node.kinds.map((kind) => ({
    type: 'embed',
    field: mediaKindToEmbedField(kind),
    required: node.op === 'is',
    ...meta,
  }))

  if (embeds.length === 1) return embeds[0]!

  if (node.op === 'is') {
    return { type: 'any', rules: embeds, ...meta }
  }
  // is_not: none of the selected — AND of required:false embeds
  return { type: 'all', rules: embeds, ...meta }
}
