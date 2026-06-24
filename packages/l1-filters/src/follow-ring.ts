import type { L1FilterStep } from '@cfb/l1-registry'
import { pushTrace } from '@cfb/l1-registry'
import { isViewerFollowRing, formatFollowRingDirection, type FollowRingFilterConfig } from '@cfb/core-types'

function shortDid(did: string): string {
  return did.length > 26 ? `${did.slice(0, 24)}…` : did
}

function matchRing(
  authorDid: string,
  ring: Set<string>,
  op: FollowRingFilterConfig['op'],
): boolean {
  const on = ring.has(authorDid)
  return op === 'includes' ? on : !on
}

/**
 * L1 follow ring — account hub at ingest (cached); viewer hub deferred to skeleton.
 */
export const followRingStep: L1FilterStep = {
  id: 'follow_ring',
  evaluate(ctx) {
    const cfg = ctx.config.followRing
    if (!cfg) {
      return pushTrace(ctx, 'follow_ring', 'skip')
    }

    if (isViewerFollowRing(cfg.hubSource)) {
      return pushTrace(ctx, 'follow_ring', 'pass', 'viewer ring — applied at skeleton serve')
    }

    const ringList = ctx.accountFollowRingDids ?? []
    const ring = new Set(ringList)
    const author = shortDid(ctx.post.authorDid)
    const ok = matchRing(ctx.post.authorDid, ring, cfg.op)
    const dir = formatFollowRingDirection(cfg.direction)
    const hub = cfg.hub?.trim() || 'hub'

    if (cfg.op === 'includes') {
      if (ok) {
        return pushTrace(ctx, 'follow_ring', 'pass', `${author} in ${hub} ${dir} (${ring.size} cached)`)
      }
      const detail =
        ring.size > 0
          ? `${author} not in ${hub} ${dir} (${ring.size} cached)`
          : `follow ring empty — sync hub ${hub}`
      return pushTrace(ctx, 'follow_ring', 'fail', detail)
    }

    if (ok) {
      return pushTrace(ctx, 'follow_ring', 'pass', `${author} not in blocked ${hub} ${dir}`)
    }
    return pushTrace(ctx, 'follow_ring', 'fail', `${author} in ${hub} ${dir} (excludes fails)`)
  },
}
