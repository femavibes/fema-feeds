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
  | 'labels'
  | 'follow_ring'
  | 'author'
>

const DEFAULT_RUN_AT_INGEST: Partial<Record<IngestEligibleNodeType, boolean>> = {
  keyword: true,
  hashtag: true,
  regex: false,
  post_kind: true,
  language: true,
  bool: true,
  labels: true,
  follow_ring: true,
  author: true,
}

export function isIngestEligibleNodeType(type: string): type is IngestEligibleNodeType {
  return type in DEFAULT_RUN_AT_INGEST
}

export function defaultRunAtIngest(type: IngestEligibleNodeType): boolean {
  return DEFAULT_RUN_AT_INGEST[type] ?? false
}

export function nodeRunsAtIngest(node: L2RuleNode): boolean {
  if (node.type === 'group' || node.type === 'graze_stub' || node.type === 'logic_block_ref') {
    return false
  }
  if (!isIngestEligibleNodeType(node.type)) return false
  if (node.type === 'follow_ring' && isViewerFollowRing(node.hubSource)) return false
  if ('runAtIngest' in node && node.runAtIngest !== undefined) {
    return node.runAtIngest === true
  }
  return defaultRunAtIngest(node.type)
}
