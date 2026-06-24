import type { L1FilterStep } from '@cfb/l1-registry'
import { pushTrace } from '@cfb/l1-registry'

/** L1-03 — language allowlist from record.langs. */
export const languageStep: L1FilterStep = {
  id: 'language',
  evaluate(ctx) {
    const langCfg = ctx.config.language
    if (!langCfg || langCfg.allow.length === 0) return pushTrace(ctx, 'language', 'skip')

    if (ctx.post.langs.length === 0) {
      return pushTrace(ctx, 'language', 'pass', 'no langs; defer to language_unknown')
    }

    const ok = ctx.post.langs.some((l) => langCfg.allow.includes(l))
    return ok
      ? pushTrace(ctx, 'language', 'pass')
      : pushTrace(ctx, 'language', 'fail', `langs ${ctx.post.langs.join(',')}`)
  },
}
