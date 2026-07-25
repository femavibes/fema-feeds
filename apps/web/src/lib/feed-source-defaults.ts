import type {
  FeedConfig,
  L2RuleGroup,
  L2RuleNode,
  L2ScoutCondition,
  L2SubstituteCondition,
  ScoutFeedSource,
  SubstituteFeedSource,
  SubstitutePathwayConfig,
} from '@cfb/core-types'
import { scoutSourceEnabled, substituteSourceEnabled } from '@cfb/core-types'

export { scoutSourceEnabled, substituteSourceEnabled } from '@cfb/core-types'

export function defaultScoutFeedSource(): ScoutFeedSource {
  return {
    type: 'scout',
    enabled: true,
    scouts: [],
    threshold: {
      min: 3,
      max: 8,
      scaleWindowMinutes: 60,
      curve: 'linear',
    },
    maxPostAgeHours: 48,
  }
}

export function defaultSubstitutePathway(): SubstitutePathwayConfig {
  return {
    direction: 'reply_to_root',
    threshold: 1,
    timeWindowHours: 0,
  }
}

export function defaultSubstituteFeedSource(): SubstituteFeedSource {
  return {
    type: 'substitute',
    enabled: true,
    pathways: [defaultSubstitutePathway()],
  }
}

function walkRules(root: L2RuleGroup, visit: (node: L2RuleNode) => void): void {
  for (const child of root.children ?? []) {
    if (child.type !== 'group') visit(child)
    else walkRules(child, visit)
  }
}

function removeNodesFromMatch(root: L2RuleGroup, types: Set<L2RuleNode['type']>): L2RuleGroup {
  const children = (root.children ?? [])
    .filter((c) => !(c.type !== 'group' && types.has(c.type)))
    .map((c) => (c.type === 'group' ? removeNodesFromMatch(c, types) : c))
  return { ...root, children }
}

/** Lift legacy scout/substitute condition nodes into `sources` config. */
export function liftDiscoveryConditionsToSources(feed: FeedConfig): FeedConfig {
  const scouts: L2ScoutCondition[] = []
  const substitutes: L2SubstituteCondition[] = []
  walkRules(feed.match, (node) => {
    if (node.type === 'scout') scouts.push(node)
    if (node.type === 'substitute') substitutes.push(node)
  })
  if (scouts.length === 0 && substitutes.length === 0) return feed

  const sources = { ...(feed.sources ?? {}) }
  if (scouts.length > 0 && !sources.scout) {
    const node = scouts[0]!
    sources.scout = {
      type: 'scout',
      enabled: true,
      scouts: node.scouts,
      autoDerive: node.autoDerive,
      threshold: node.threshold,
      maxPostAgeHours: node.maxPostAgeHours,
    }
  }
  if (substitutes.length > 0 && !sources.substitute) {
    sources.substitute = {
      type: 'substitute',
      enabled: true,
      pathways: substitutes.map((node) => ({
        direction: node.direction,
        threshold: node.threshold,
        timeWindowHours: node.timeWindowHours,
      })),
    }
  }

  const nextMatch = removeNodesFromMatch(feed.match, new Set(['scout', 'substitute']))
  return { ...feed, sources, match: nextMatch }
}
