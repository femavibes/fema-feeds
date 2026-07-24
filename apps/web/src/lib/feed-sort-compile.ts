import type {
  EngagementSignal,
  EngagementWeights,
  L2Expr,
  L2NumericField,
  SortTuning,
} from '@cfb/core-types'
import { applySharedScoring, compileEditorBoost, decayAndFairnessSuffix, editorBoostFormulaLabel } from './feed-sort-chunks.js'

function fieldExpr(field: L2NumericField): L2Expr {
  return { type: 'field', field }
}

function literal(value: number): L2Expr {
  return { type: 'literal', value }
}

function binary(op: '+' | '-' | '*' | '/', left: L2Expr, right: L2Expr): L2Expr {
  return { type: 'binary', op, left, right }
}

export function engagementExpr(weights: EngagementWeights): L2Expr {
  const terms: L2Expr[] = []
  const add = (field: L2NumericField, signal: EngagementSignal) => {
    if (!signal.enabled) return
    terms.push(signal.weight === 1 ? fieldExpr(field) : binary('*', fieldExpr(field), literal(signal.weight)))
  }
  add('like_count', weights.likes)
  add('repost_count', weights.reposts)
  add('reply_count', weights.replies)
  add('quote_count', weights.quotes)
  add('bookmark_count', weights.bookmarks)
  add('audience_like_count', weights.audienceLikes)
  add('audience_repost_count', weights.audienceReposts)
  if (terms.length === 0) return fieldExpr('like_count')
  return terms.reduce((acc, t) => binary('+', acc, t))
}

function engagementSumLabel(weights: EngagementWeights): string {
  const parts: string[] = []
  const add = (name: string, signal: EngagementSignal) => {
    if (!signal.enabled) return
    parts.push(signal.weight === 1 ? name : `${name} × ${signal.weight}`)
  }
  add('likes', weights.likes)
  add('reposts', weights.reposts)
  add('replies', weights.replies)
  add('quotes', weights.quotes)
  add('bookmarks', weights.bookmarks)
  add('audience_likes', weights.audienceLikes)
  add('audience_reposts', weights.audienceReposts)
  return parts.length ? parts.join(' + ') : 'likes'
}

function applyMediaBonus(base: L2Expr, media: SortTuning['mediaBonus']): L2Expr {
  let expr = base
  if (media.image.enabled && media.image.weight > 0) {
    expr = binary('+', expr, binary('*', fieldExpr('image_count'), literal(media.image.weight)))
  }
  if (media.video.enabled && media.video.weight > 0) {
    expr = binary(
      '+',
      expr,
      binary(
        '*',
        binary('/', fieldExpr('video_size_bytes'), binary('+', fieldExpr('video_size_bytes'), literal(1))),
        literal(media.video.weight),
      ),
    )
  }
  if (media.linkCard.enabled && media.linkCard.weight > 0) {
    expr = binary(
      '+',
      expr,
      binary(
        '*',
        binary('/', fieldExpr('link_thumb_size_bytes'), binary('+', fieldExpr('link_thumb_size_bytes'), literal(1))),
        literal(media.linkCard.weight),
      ),
    )
  }
  return expr
}

function applyContentSignals(base: L2Expr, signals: SortTuning['contentSignals']): L2Expr {
  let expr = base
  const add = (field: L2NumericField, signal: EngagementSignal) => {
    if (!signal.enabled || signal.weight === 0) return
    expr = binary('+', expr, signal.weight === 1 ? fieldExpr(field) : binary('*', fieldExpr(field), literal(signal.weight)))
  }
  add('author_follower_count', signals.authorFollowers)
  add('author_posts_count', signals.authorPosts)
  add('text_length', signals.textLength)
  add('facet_tag_count', signals.hashtagCount)
  add('facet_mention_count', signals.mentionCount)
  add('facet_link_count', signals.linkCount)
  if (signals.altTextBonus.enabled && signals.altTextBonus.weight !== 0) {
    expr = binary('+', expr, binary('*', fieldExpr('image_count'), literal(signals.altTextBonus.weight)))
  }
  return expr
}

function applyRatioSignals(base: L2Expr, signals: SortTuning['ratioSignals']): L2Expr {
  let expr = base
  if (signals.engagementRate.enabled && signals.engagementRate.weight !== 0) {
    const rate = binary(
      '/',
      binary('+', fieldExpr('like_count'), fieldExpr('repost_count')),
      binary('+', fieldExpr('author_follower_count'), literal(1)),
    )
    expr = binary('+', expr, binary('*', rate, literal(signals.engagementRate.weight)))
  }
  if (signals.replyRatio.enabled && signals.replyRatio.weight !== 0) {
    const rate = binary('/', fieldExpr('reply_count'), binary('+', fieldExpr('like_count'), literal(1)))
    expr = binary('+', expr, binary('*', rate, literal(signals.replyRatio.weight)))
  }
  if (signals.quoteRatio.enabled && signals.quoteRatio.weight !== 0) {
    const rate = binary('/', fieldExpr('quote_count'), binary('+', fieldExpr('like_count'), literal(1)))
    expr = binary('+', expr, binary('*', rate, literal(signals.quoteRatio.weight)))
  }
  return expr
}

function advancedExtrasLabel(tuning: SortTuning): string {
  const parts: string[] = []
  if (tuning.mediaBonus.image.enabled && tuning.mediaBonus.image.weight > 0) {
    parts.push(`images +${tuning.mediaBonus.image.weight}`)
  }
  if (tuning.mediaBonus.video.enabled && tuning.mediaBonus.video.weight > 0) {
    parts.push(`video +${tuning.mediaBonus.video.weight}`)
  }
  if (tuning.mediaBonus.linkCard.enabled && tuning.mediaBonus.linkCard.weight > 0) {
    parts.push(`link +${tuning.mediaBonus.linkCard.weight}`)
  }
  if (tuning.contentSignals.authorFollowers.enabled && tuning.contentSignals.authorFollowers.weight !== 0) {
    parts.push(`followers × ${tuning.contentSignals.authorFollowers.weight}`)
  }
  if (tuning.contentSignals.authorPosts.enabled && tuning.contentSignals.authorPosts.weight !== 0) {
    parts.push(`author_posts × ${tuning.contentSignals.authorPosts.weight}`)
  }
  if (tuning.contentSignals.textLength.enabled && tuning.contentSignals.textLength.weight !== 0) {
    parts.push(`text_len × ${tuning.contentSignals.textLength.weight}`)
  }
  if (tuning.contentSignals.hashtagCount.enabled && tuning.contentSignals.hashtagCount.weight !== 0) {
    parts.push(`tags × ${tuning.contentSignals.hashtagCount.weight}`)
  }
  if (tuning.contentSignals.mentionCount.enabled && tuning.contentSignals.mentionCount.weight !== 0) {
    parts.push(`mentions × ${tuning.contentSignals.mentionCount.weight}`)
  }
  if (tuning.contentSignals.linkCount.enabled && tuning.contentSignals.linkCount.weight !== 0) {
    parts.push(`links × ${tuning.contentSignals.linkCount.weight}`)
  }
  if (tuning.contentSignals.altTextBonus.enabled && tuning.contentSignals.altTextBonus.weight !== 0) {
    parts.push(`alt_text × ${tuning.contentSignals.altTextBonus.weight}`)
  }
  if (tuning.ratioSignals.engagementRate.enabled && tuning.ratioSignals.engagementRate.weight !== 0) {
    parts.push(`eng_rate × ${tuning.ratioSignals.engagementRate.weight}`)
  }
  if (tuning.ratioSignals.replyRatio.enabled && tuning.ratioSignals.replyRatio.weight !== 0) {
    parts.push(`reply_ratio × ${tuning.ratioSignals.replyRatio.weight}`)
  }
  if (tuning.ratioSignals.quoteRatio.enabled && tuning.ratioSignals.quoteRatio.weight !== 0) {
    parts.push(`quote_ratio × ${tuning.ratioSignals.quoteRatio.weight}`)
  }
  return parts.length ? ` + ${parts.join(' + ')}` : ''
}

export function compileEngagementSort(weights: EngagementWeights, tuning: SortTuning): L2Expr {
  const base = compileEditorBoost(engagementExpr(weights), tuning.editorScoreWeight)
  return applySharedScoring(base, tuning)
}

export function compileAdvancedSort(weights: EngagementWeights, tuning: SortTuning): L2Expr {
  let base = compileEditorBoost(engagementExpr(weights), tuning.editorScoreWeight)
  base = applyContentSignals(base, tuning.contentSignals)
  base = applyRatioSignals(base, tuning.ratioSignals)
  base = applyMediaBonus(base, tuning.mediaBonus)
  return applySharedScoring(base, tuning)
}

export function engagementFormulaLabel(
  weights: EngagementWeights,
  tuning: SortTuning,
): string {
  let formula = engagementSumLabel(weights)
  const editor = editorBoostFormulaLabel(tuning.editorScoreWeight)
  if (editor) formula += editor
  const suffix = decayAndFairnessSuffix(tuning)
  if (suffix) formula = `(${formula})${suffix}`
  return formula
}

export function advancedFormulaLabel(weights: EngagementWeights, tuning: SortTuning): string {
  let formula = engagementSumLabel(weights)
  const editor = editorBoostFormulaLabel(tuning.editorScoreWeight)
  if (editor) formula += editor
  const extras = advancedExtrasLabel(tuning)
  if (extras) formula += extras
  const suffix = decayAndFairnessSuffix(tuning)
  if (suffix) formula = `(${formula})${suffix}`
  return formula
}

/** @deprecated Use compileEngagementSort or compileAdvancedSort */
export function applyTuning(base: L2Expr, tuning: SortTuning): L2Expr {
  let expr = compileEditorBoost(base, tuning.editorScoreWeight)
  expr = applyContentSignals(expr, tuning.contentSignals)
  expr = applyRatioSignals(expr, tuning.ratioSignals)
  expr = applyMediaBonus(expr, tuning.mediaBonus)
  return applySharedScoring(expr, tuning)
}
