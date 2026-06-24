import type { L1StepId } from '@cfb/core-types'

/**
 * Fixed L1 evaluation order (cheapest first, keywords last).
 * See docs/PLAN.md §3.3
 */
export const L1_STEP_ORDER: readonly L1StepId[] = [
  'labels',
  'post_kind',
  'author_allowlist',
  'author_blocklist',
  'ingest_gate',
  'follow_ring',
  'language',
  'language_unknown',
  'has_video',
  'has_image',
  'has_link_card',
  'has_quote',
  'has_record',
  'has_text_only',
  'hashtag_exclude',
  'hashtag_include',
  'keyword_exclude',
  'keyword_include',
] as const

export function isStepBypassed(
  stepId: L1StepId,
  bypassed: Set<L1StepId>,
): boolean {
  return bypassed.has(stepId)
}
