import type { L2Expr } from '@cfb/core-types'
import type { AuthorAffinityRecord } from '@cfb/storage-postgres'
import type { ViewerPersonalizationContext } from './native-personalization.js'

/**
 * Per-post personalization context used to resolve viewer-relative formula fields.
 */
export interface PersonalizationPostContext {
  postUri: string
  authorDid: string | null
  /** The sort_key from sorting (base score). */
  baseScore: number
}

/**
 * Evaluate a personalization formula for a single post.
 * Resolves viewer-relative fields (base_score, is_followed, feed_affinity_*, etc.)
 * and standard numeric fields (likes, reposts, etc. — returns 0 for these since
 * we don't have full post data at serve time, only sort_key).
 */
export function evalPersonalizationFormula(
  formula: L2Expr,
  viewer: ViewerPersonalizationContext,
  post: PersonalizationPostContext,
): number {
  return evalNode(formula, viewer, post)
}

function evalNode(
  expr: L2Expr,
  viewer: ViewerPersonalizationContext,
  post: PersonalizationPostContext,
): number {
  switch (expr.type) {
    case 'literal':
      return expr.value

    case 'field':
      return resolvePersonalizationField(expr.field, viewer, post)

    case 'enrichment_field':
      // Enrichment not available at personalization serve time (would need loading)
      return 0

    case 'binary': {
      const left = evalNode(expr.left, viewer, post)
      const right = evalNode(expr.right, viewer, post)
      switch (expr.op) {
        case '+': return left + right
        case '-': return left - right
        case '*': return left * right
        case '/': return right === 0 ? 0 : left / right
        case '**': return Math.pow(left, right)
        case 'min': return Math.min(left, right)
        case 'max': return Math.max(left, right)
      }
      return 0
    }

    case 'unary': {
      const val = evalNode(expr.operand, viewer, post)
      switch (expr.op) {
        case 'log': return val > 0 ? Math.log(val) : 0
        case 'sqrt': return val >= 0 ? Math.sqrt(val) : 0
        case 'abs': return Math.abs(val)
        case 'floor': return Math.floor(val)
        case 'ceil': return Math.ceil(val)
        case 'neg': return -val
      }
      return 0
    }

    case 'clamp': {
      const val = evalNode(expr.value, viewer, post)
      const min = evalNode(expr.min, viewer, post)
      const max = evalNode(expr.max, viewer, post)
      return Math.min(Math.max(val, min), max)
    }

    case 'cond': {
      const left = evalNode(expr.left, viewer, post)
      const right = evalNode(expr.right, viewer, post)
      let passed: boolean
      switch (expr.op) {
        case '==': passed = left === right; break
        case '!=': passed = left !== right; break
        case '<': passed = left < right; break
        case '<=': passed = left <= right; break
        case '>': passed = left > right; break
        case '>=': passed = left >= right; break
        default: passed = false
      }
      return evalNode(passed ? expr.then : expr.else, viewer, post)
    }

    case 'ratio': {
      const num = evalNode(expr.numerator, viewer, post)
      const den = evalNode(expr.denominator, viewer, post)
      const guard = expr.guard ?? 1
      return den + guard === 0 ? 0 : num / (den + guard)
    }
  }
}

function resolvePersonalizationField(
  field: string,
  viewer: ViewerPersonalizationContext,
  post: PersonalizationPostContext,
): number {
  const authorDid = post.authorDid

  switch (field) {
    // Core viewer signals
    case 'base_score':
      return post.baseScore

    case 'is_followed':
      return authorDid && viewer.followedDids.has(authorDid) ? 1 : 0

    case 'is_mutual':
      return authorDid && viewer.mutualDids.has(authorDid) ? 1 : 0

    case 'times_seen': {
      const seen = viewer.seenPosts.get(post.postUri)
      return seen?.impressionCount ?? 0
    }

    case 'hours_since_seen': {
      const seen = viewer.seenPosts.get(post.postUri)
      if (!seen) return 0
      return Math.max(0, (Date.now() - seen.servedAt.getTime()) / (1000 * 60 * 60))
    }

    case 'hours_since_last_open':
      return viewer.hoursSinceLastOpen ?? 0

    case 'days_since_interaction': {
      if (!authorDid) return 0
      const record = viewer.affinityCounts.get(authorDid)
      if (!record) return 0
      return Math.max(0, (Date.now() - record.lastAt.getTime()) / (1000 * 60 * 60 * 24))
    }

    // Feed-scoped affinity (total + per-event)
    case 'feed_affinity':
      return getAffinity(viewer, authorDid)?.total ?? 0

    case 'feed_affinity_likes':
      return getAffinity(viewer, authorDid)?.likes ?? 0

    case 'feed_affinity_reposts':
      return getAffinity(viewer, authorDid)?.reposts ?? 0

    case 'feed_affinity_replies':
      return getAffinity(viewer, authorDid)?.replies ?? 0

    case 'feed_affinity_quotes':
      return getAffinity(viewer, authorDid)?.quotes ?? 0

    // Standard post metrics — available if we pass them through, but at serve time
    // these would need to be loaded. For now return 0 (use base_score instead).
    default:
      return 0
  }
}

function getAffinity(
  viewer: ViewerPersonalizationContext,
  authorDid: string | null,
): AuthorAffinityRecord | undefined {
  if (!authorDid) return undefined
  return viewer.affinityCounts.get(authorDid)
}
