import type { FeedConfig, LogicBlockPackage } from '@cfb/core-types'
import { wrapLogicBlockForCanvas } from '@cfb/l2-graph'

import { defaultCanvasEdges } from '../components/l2/visual/graph-sync'

/**
 * Map a logic block package to a feed-shaped draft for edit/preview.
 *
 * Canvas layout treats top-level children as parallel OR paths and does not draw
 * the root group box — so we wrap the packaged root as a single nested frame.
 * That preserves AND/OR nesting (e.g. AND of conditions + nested OR).
 *
 * The wrap id is editor-only; never persist it (see logicBlockRootFromCanvasMatch).
 */
export function logicBlockToFeedDraft(pkg: LogicBlockPackage): FeedConfig {
  const match = wrapLogicBlockForCanvas(structuredClone(pkg.root))
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
