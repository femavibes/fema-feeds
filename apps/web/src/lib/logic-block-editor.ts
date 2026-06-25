import type { FeedConfig, LogicBlockPackage } from '@cfb/core-types'
import { flattenTopLevelMatch, normalizeRuleGroup } from '@cfb/l2-graph'

import { defaultCanvasEdges } from '../components/l2/visual/graph-sync'

/** Map a logic block package to a feed-shaped draft for the visual editor. */
export function logicBlockToFeedDraft(pkg: LogicBlockPackage): FeedConfig {
  const match = flattenTopLevelMatch(normalizeRuleGroup(structuredClone(pkg.root)))
  const visualLayout = pkg.visualLayout?.edges?.length
    ? pkg.visualLayout
    : {
        positions: pkg.visualLayout?.positions ?? {},
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
