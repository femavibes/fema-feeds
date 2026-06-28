import type { L1FilterStep } from '@cfb/l1-registry'
import { labelsStep } from './labels.js'
import { postKindStep } from './post-kind.js'
import { authorAllowlistStep } from './author-allowlist.js'
import { authorBlocklistStep } from './author-blocklist.js'
import { languageStep } from './language.js'
import { languageUnknownStep } from './language-unknown.js'
import {
  hasVideoStep,
  hasImageStep,
  hasLinkCardStep,
  hasQuoteStep,
  hasRecordStep,
  hasTextOnlyStep,
} from './embed-flags.js'
import {
  hashtagIncludeStep,
  hashtagExcludeStep,
  keywordIncludeStep,
  keywordExcludeStep,
} from './hashtag-keyword.js'
import { followRingStep } from './follow-ring.js'
import { ingestGateStep, evaluateIngestGate } from './ingest-gate.js'

export { evaluateIngestGate }

/** All L1 steps keyed by id. Order is enforced by @cfb/l1-eval using L1_STEP_ORDER. */
export const L1_FILTER_STEPS: Record<string, L1FilterStep> = {
  labels: labelsStep,
  post_kind: postKindStep,
  author_allowlist: authorAllowlistStep,
  author_blocklist: authorBlocklistStep,
  follow_ring: followRingStep,
  ingest_gate: ingestGateStep,
  language: languageStep,
  language_unknown: languageUnknownStep,
  has_video: hasVideoStep,
  has_image: hasImageStep,
  has_link_card: hasLinkCardStep,
  has_quote: hasQuoteStep,
  has_record: hasRecordStep,
  has_text_only: hasTextOnlyStep,
  hashtag_exclude: hashtagExcludeStep,
  hashtag_include: hashtagIncludeStep,
  keyword_exclude: keywordExcludeStep,
  keyword_include: keywordIncludeStep,
}

export function getL1FilterStep(id: string): L1FilterStep | undefined {
  return L1_FILTER_STEPS[id]
}
