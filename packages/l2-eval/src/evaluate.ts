import type {
  FeedConfig,
  L2EvalInput,
  L2EvalResult,
  L2NodeTrace,
  L2RuleNode,
  NormalizedPost,
} from '@cfb/core-types'
import { buildL2Runtime } from './context.js'
import { evalExpr } from './expr.js'
import { evalRuleNode } from './nodes.js'

export function evaluateFeedL2(
  post: NormalizedPost,
  feed: FeedConfig,
  input: L2EvalInput = {},
): L2EvalResult {
  if (!feed.enabled && !input.preview) {
    return { feedId: feed.feedId, matched: false, sortKey: null, editorScore: 0, trace: [] }
  }

  const ctx = buildL2Runtime(post, input.metrics, input.nowMs)
  const trace: L2NodeTrace[] = []
  const scoreAcc = { value: 0 }
  const matched = evalRuleNode(feed.match, ctx, input, trace, scoreAcc)

  // +1 cold-start floor for all matched posts
  const editorScore = matched ? scoreAcc.value + 1 : 0

  let sortKey: number | null = null
  if (matched && feed.rank?.sortKey) {
    sortKey = evalExpr(ctx, feed.rank.sortKey)
  }

  return { feedId: feed.feedId, matched, sortKey, editorScore, trace }
}

export function walkRuleNodes(root: L2RuleNode): L2RuleNode[] {
  const out: L2RuleNode[] = [root]
  if (root.type === 'group') {
    for (const child of root.children) {
      out.push(...walkRuleNodes(child))
    }
  }
  return out
}
