import type { L1FilterStep } from '@cfb/l1-registry'
import { pushTrace } from '@cfb/l1-registry'
import type { AuthorListConfig } from '@cfb/core-types'

function listDids(list: AuthorListConfig): string[] {
  return list.dids ?? []
}

function shortDid(did: string): string {
  return did.length > 26 ? `${did.slice(0, 24)}…` : did
}

function listSummary(lists: AuthorListConfig[]): string {
  return lists.map((l) => `"${l.listId}" (${listDids(l).length} DIDs)`).join(', ')
}

/**
 * L1-06 — author allowlist + fast-path bypass.
 *
 * - `authorsOnly: true` → non-listed authors fail here.
 * - Listed author + fast-path → bypass remaining steps (except never_bypass).
 * - Listed author without fast-path → continue through L1 filters.
 * - Not listed + not authorsOnly → continue (jetstream discovery path).
 */
export const authorAllowlistStep: L1FilterStep = {
  id: 'author_allowlist',
  evaluate(ctx) {
    const lists = ctx.config.authorLists ?? []
    if (lists.length === 0) {
      if (ctx.config.authorsOnly) {
        return pushTrace(ctx, 'author_allowlist', 'fail', 'Authors only is on but no lists configured')
      }
      return pushTrace(ctx, 'author_allowlist', 'skip')
    }

    const allDids = new Set(lists.flatMap((l) => listDids(l)))
    const onList = allDids.has(ctx.post.authorDid)
    const author = shortDid(ctx.post.authorDid)

    if (!onList) {
      if (ctx.config.authorsOnly) {
        return pushTrace(
          ctx,
          'author_allowlist',
          'fail',
          `${author} not on any list — checked ${listSummary(lists)}`,
        )
      }
      return pushTrace(
        ctx,
        'author_allowlist',
        'pass',
        `${author} not listed; continuing discovery path`,
      )
    }

    const matchedList = lists.find((l) => listDids(l).includes(ctx.post.authorDid))!

    if (!matchedList.fastPath.enabled) {
      return pushTrace(
        ctx,
        'author_allowlist',
        'pass',
        `${author} on list "${matchedList.listId}" — must pass remaining filters`,
      )
    }

    for (const step of matchedList.fastPath.bypassSteps) {
      ctx.bypassedSteps.add(step)
    }
    ctx.authorFastPathActive = true
    return pushTrace(
      ctx,
      'author_allowlist',
      'bypass_remaining',
      `${author} on list "${matchedList.listId}" (${listDids(matchedList).length} DIDs) — fast-path saves to pool`,
    )
  },
}
