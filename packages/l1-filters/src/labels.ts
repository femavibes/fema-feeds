import type { L1FilterStep } from '@cfb/l1-registry'
import { pushTrace } from '@cfb/l1-registry'
import { allLabelValues } from '@cfb/core-types'

/** L1-01 — drop posts with blocked labels (self + resolved labeler labels). */
export const labelsStep: L1FilterStep = {
  id: 'labels',
  evaluate(ctx) {
    const block = ctx.config.labels?.block ?? []
    if (block.length === 0) return pushTrace(ctx, 'labels', 'skip')
    const have = allLabelValues(ctx.post)
    const hit = block.find((b) => have.some((h) => h.toLowerCase() === b.toLowerCase()))
    return hit
      ? pushTrace(ctx, 'labels', 'fail', `blocked label: ${hit}`)
      : pushTrace(ctx, 'labels', 'pass')
  },
}
