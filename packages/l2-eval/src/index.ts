export { evaluateFeedL2, walkRuleNodes } from './evaluate.js'
export { evalRuleNode, type ScoreAccumulator } from './nodes.js'
export {
  evaluateViewerFollowRingOverlay,
  evaluateViewerFollowRingNode,
  collectViewerFollowRingNodes,
  collectAllViewerFollowRingNodes,
  projectViewerFollowRingNode,
} from './viewer-overlay.js'
export { evalExpr, compareNumbers, exprUsesField } from './expr.js'
export {
  collectLogicBlockRefs,
  createLogicBlockResolver,
  logicBlockCacheKey,
  resolveLogicBlockRoot,
} from './logic-blocks.js'
export {
  collectLogicBlockRefNodes,
  compareSemver,
  isPatchUpgrade,
  scanLogicBlockUpgrades,
  applyLogicBlockUpgrades,
  resolveLogicBlockVersionPin,
} from './logic-block-upgrades.js'
export type { LogicBlockRefInFeed } from './logic-block-upgrades.js'
export {
  feedWithResolvedRank,
  resolveSortPackVersionPin,
  scanSortPackUpgrade,
} from './sort-packs.js'
export { buildL2Runtime, numericFieldValue } from './context.js'
export type { L2RuntimeContext } from './context.js'
