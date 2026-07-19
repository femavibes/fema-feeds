import type { L2RuleNode } from './l2.js'
import { isViewerFollowRing } from './follow-ring.js'

export type IngestEligibleNodeType = Extract<
  L2RuleNode['type'],
  | 'keyword'
  | 'regex'
  | 'hashtag'
  | 'post_kind'
  | 'language'
  | 'bool'
  | 'media'
  | 'labels'
  | 'follow_ring'
  | 'author'
  | 'url'
  | 'mention'
>

const DEFAULT_RUN_AT_INGEST: Partial<Record<IngestEligibleNodeType, boolean>> = {
  keyword: true,
  hashtag: true,
  regex: false,
  post_kind: true,
  language: true,
  bool: true,
  media: true,
  labels: true,
  // Follow ring / author / mention: driven by role (discover vs filter), not this default alone.
  follow_ring: false,
  author: true,
  url: true,
  mention: true,
}

export function isIngestEligibleNodeType(type: string): type is IngestEligibleNodeType {
  return type in DEFAULT_RUN_AT_INGEST
}

export function defaultRunAtIngest(type: IngestEligibleNodeType): boolean {
  return DEFAULT_RUN_AT_INGEST[type] ?? false
}

/** Author / mention: discover by default. Follow ring: filter by default. */
export function nodeDiscoverRole(
  node: Extract<L2RuleNode, { type: 'author' | 'follow_ring' | 'mention' }>,
): 'filter' | 'discover' {
  if (node.type === 'follow_ring') return node.role ?? 'filter'
  return node.role ?? 'discover'
}

export function nodeRunsAtIngest(node: L2RuleNode): boolean {
  if (node.type === 'group' || node.type === 'graze_stub' || node.type === 'logic_block_ref') {
    return false
  }
  if (!isIngestEligibleNodeType(node.type)) return false
  if (node.type === 'follow_ring' && isViewerFollowRing(node.hubSource)) return false

  // Explicit Filter/Discover role wins over legacy runAtIngest.
  if (node.type === 'author' || node.type === 'follow_ring' || node.type === 'mention') {
    return nodeDiscoverRole(node) === 'discover'
  }

  if ('runAtIngest' in node && node.runAtIngest !== undefined) {
    return node.runAtIngest === true
  }
  return defaultRunAtIngest(node.type)
}
