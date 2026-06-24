import type { L1FilterStep } from '@cfb/l1-registry'
import { pushTrace } from '@cfb/l1-registry'

/** L1-02 — allow only configured post kinds (reply, quote, repost, root). */
export const postKindStep: L1FilterStep = {
  id: 'post_kind',
  evaluate(ctx) {
    const allowed = ctx.config.postKinds
    if (!allowed || allowed.length === 0) return pushTrace(ctx, 'post_kind', 'skip')
    return allowed.includes(ctx.post.postKind)
      ? pushTrace(ctx, 'post_kind', 'pass')
      : pushTrace(ctx, 'post_kind', 'fail', `kind ${ctx.post.postKind} not allowed`)
  },
}
