import type { FeedConfig, L2RuleGroup, LogicBlockPackage } from '@cfb/core-types'
import { normalizeRuleGroup } from '@cfb/l2-graph'

import { defaultCanvasEdges } from '../components/l2/visual/graph-sync'

/**
 * Map a logic block package to a feed-shaped draft for read-only preview.
 *
 * Canvas layout treats top-level children as parallel OR paths and does not draw
 * the root group box — so we wrap the packaged root as a single nested frame.
 * That preserves AND/OR nesting (e.g. AND of conditions + nested OR).
 */
export function logicBlockToFeedDraft(pkg: LogicBlockPackage): FeedConfig {
  const packagedRoot = normalizeRuleGroup(structuredClone(pkg.root))
  const match: L2RuleGroup = {
    type: 'group',
    id: 'logic-block-preview-root',
    logic: 'any',
    children: [packagedRoot],
  }
  // Ignore saved feed-style edges; auto-wire START → packaged root → FEED.
  const visualLayout = {
    positions: {} as NonNullable<FeedConfig['visualLayout']>['positions'],
    edges: defaultCanvasEdges(match),
    labels: pkg.visualLayout?.labels,
    nodeSources: pkg.visualLayout?.nodeSources,
  }

  return {
    feedId: `logic-block-${pkg.id}`,
    projectId: 'collection',
    name: pkg.name,
    enabled: false,
    poolScope: 'project_only',
    match,
    visualLayout,
  }
}
