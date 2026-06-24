import type {
  FeedConfig,
  L2FollowRingCondition,
  L2EvalInput,
  L2RuleGroup,
  L2RuleNode,
  NormalizedPost,
  ProjectL1Config,
} from '@cfb/core-types'
import { isViewerFollowRing, l1FollowRingNodeId } from '@cfb/core-types'
import { buildL2Runtime } from './context.js'
import type { L2RuntimeContext } from './context.js'

function matchFollowRing(
  node: L2FollowRingCondition,
  authorDid: string,
  followRings: Record<string, string[]>,
): boolean {
  const legacyOp = String((node as { op?: string }).op ?? node.op)
  const op: 'includes' | 'excludes' =
    legacyOp === 'in' || legacyOp === 'in_list'
      ? 'includes'
      : legacyOp === 'not_in' || legacyOp === 'not_in_list'
        ? 'excludes'
        : node.op
  const ring = new Set(followRings[node.id] ?? [])
  const on = ring.has(authorDid)
  return op === 'includes' ? on : !on
}

function emptyGroupOutcome(logic: L2RuleGroup['logic']): boolean {
  switch (logic) {
    case 'all':
    case 'none':
      return true
    case 'any':
    case 'n_of':
    default:
      return false
  }
}

function evalViewerOverlayNode(
  node: L2RuleNode,
  ctx: L2RuntimeContext,
  followRings: Record<string, string[]>,
  input: Pick<L2EvalInput, 'resolveLogicBlock'>,
): boolean {
  if (node.type === 'group') {
    if (node.children.length === 0) return emptyGroupOutcome(node.logic)
    const results = node.children.map((child) =>
      evalViewerOverlayNode(child, ctx, followRings, input),
    )
    switch (node.logic) {
      case 'all':
        return results.every(Boolean)
      case 'any':
        return results.some(Boolean)
      case 'n_of': {
        const need = Math.max(1, node.minPass ?? 2)
        return results.filter(Boolean).length >= need
      }
      case 'none':
        return !results.some(Boolean)
    }
  }

  if (node.type === 'follow_ring') {
    if (!isViewerFollowRing(node.hubSource)) return true
    return matchFollowRing(node, ctx.post.authorDid, followRings)
  }

  if (node.type === 'logic_block_ref') {
    const resolved = input.resolveLogicBlock?.({
      packageId: node.packageId,
      versionPin: node.versionPin,
    })
    if (!resolved) return false
    return evalViewerOverlayNode(resolved, ctx, followRings, input)
  }

  return true
}

/** Re-evaluate only viewer-hub follow_ring nodes in an L2 tree at skeleton serve. */
export function evaluateViewerFollowRingOverlay(
  post: NormalizedPost,
  root: L2RuleNode,
  followRings: Record<string, string[]>,
  input: Pick<L2EvalInput, 'resolveLogicBlock'> = {},
): boolean {
  const ctx = buildL2Runtime(post, undefined, Date.now())
  return evalViewerOverlayNode(root, ctx, followRings, input)
}

/** Evaluate a single viewer follow-ring node (e.g. L1 project config at skeleton). */
export function evaluateViewerFollowRingNode(
  post: NormalizedPost,
  node: L2FollowRingCondition,
  followRings: Record<string, string[]>,
): boolean {
  if (!isViewerFollowRing(node.hubSource)) return true
  return matchFollowRing(node, post.authorDid, followRings)
}

export function collectViewerFollowRingNodes(feed: FeedConfig): L2FollowRingCondition[] {
  return walkRuleNodes(feed.match).filter(
    (n): n is L2FollowRingCondition =>
      n.type === 'follow_ring' && isViewerFollowRing(n.hubSource),
  )
}

export function projectViewerFollowRingNode(
  project: ProjectL1Config,
): L2FollowRingCondition | null {
  const cfg = project.followRing
  if (!cfg || !isViewerFollowRing(cfg.hubSource)) return null
  return {
    type: 'follow_ring',
    id: l1FollowRingNodeId(project.projectId),
    op: cfg.op,
    hubSource: 'viewer',
    direction: cfg.direction,
    pollIntervalMinutes: cfg.pollIntervalMinutes,
  }
}

export function collectAllViewerFollowRingNodes(
  feed: FeedConfig,
  project?: ProjectL1Config,
): L2FollowRingCondition[] {
  const nodes = collectViewerFollowRingNodes(feed)
  const l1 = project ? projectViewerFollowRingNode(project) : null
  return l1 ? [...nodes, l1] : nodes
}

function walkRuleNodes(root: L2RuleNode): L2RuleNode[] {
  const out: L2RuleNode[] = [root]
  if (root.type === 'group') {
    for (const child of root.children) {
      out.push(...walkRuleNodes(child))
    }
  }
  return out
}
