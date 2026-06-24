import type { L1FilterStep } from '@cfb/l1-registry'
import { pushTrace } from '@cfb/l1-registry'

/**
 * L1-04 — policy when langs is empty.
 * `detect` is stubbed in v1 — treats as pass with note (plug franc later).
 */
export const languageUnknownStep: L1FilterStep = {
  id: 'language_unknown',
  evaluate(ctx) {
    const langCfg = ctx.config.language
    if (!langCfg || langCfg.allow.length === 0) return pushTrace(ctx, 'language_unknown', 'skip')
    if (ctx.post.langs.length > 0) return pushTrace(ctx, 'language_unknown', 'skip', 'langs present')

    switch (langCfg.unknown) {
      case 'include':
        return pushTrace(ctx, 'language_unknown', 'pass', 'unknown included')
      case 'exclude':
        return pushTrace(ctx, 'language_unknown', 'fail', 'unknown excluded')
      case 'detect':
        return pushTrace(ctx, 'language_unknown', 'pass', 'detect stub — TODO franc')
    }
  },
}
