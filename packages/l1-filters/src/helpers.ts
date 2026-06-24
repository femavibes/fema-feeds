import type { EmbedFlagRequirement, L1StepOutcome } from '@cfb/core-types'
import type { L1EvalContext } from '@cfb/l1-registry'
import { pushTrace } from '@cfb/l1-registry'

export function applyEmbedRequirement(
  ctx: L1EvalContext,
  stepId: 'has_video' | 'has_image' | 'has_link_card' | 'has_quote' | 'has_record' | 'has_text_only',
  requirement: EmbedFlagRequirement | undefined,
  present: boolean,
): L1StepOutcome {
  if (!requirement || requirement === 'ignore') {
    return pushTrace(ctx, stepId, 'skip', 'not configured')
  }
  if (requirement === 'require') {
    return present
      ? pushTrace(ctx, stepId, 'pass', `${stepId.replace('has_', '')} present`)
      : pushTrace(ctx, stepId, 'fail', `${stepId.replace('has_', '')} required but missing`)
  }
  return present
    ? pushTrace(ctx, stepId, 'fail', `${stepId.replace('has_', '')} present but excluded`)
    : pushTrace(ctx, stepId, 'pass')
}
