import type { L1FilterStep } from '@cfb/l1-registry'
import { pushTrace } from '@cfb/l1-registry'

/** L1-05 — hard reject blocked authors. */
export const authorBlocklistStep: L1FilterStep = {
  id: 'author_blocklist',
  evaluate(ctx) {
    const block = ctx.config.authorBlocklist ?? []
    if (block.length === 0) return pushTrace(ctx, 'author_blocklist', 'skip')
    return block.includes(ctx.post.authorDid)
      ? pushTrace(ctx, 'author_blocklist', 'fail', 'author on blocklist')
      : pushTrace(ctx, 'author_blocklist', 'pass')
  },
}
