import type { L2RuleNode } from '@cfb/core-types'
import {
  isIngestEligibleNodeType,
  isViewerFollowRing,
  nodeRunsAtIngest,
} from '@cfb/core-types'

export { nodeRunsAtIngest, defaultRunAtIngest, isIngestEligibleNodeType } from '@cfb/core-types'

/** User-facing label for runAtIngest on feed rule nodes. */
export const JETSTREAM_FILTER_LABEL = 'Jetstream filter'
export const JETSTREAM_FILTER_HINT =
  'Apply this rule on the jetstream when the feed is live and save matches to the project pool'
export const JETSTREAM_FILTER_ARIA = 'Jetstream filter on this rule'

export function showIngestPoolToggle(node: L2RuleNode): boolean {
  if (!isIngestEligibleNodeType(node.type)) return false
  if (node.type === 'follow_ring' && isViewerFollowRing(node.hubSource)) return false
  return true
}

export function ingestPoolActive(node: L2RuleNode): boolean {
  return nodeRunsAtIngest(node)
}
