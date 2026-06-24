import type { FeedConfig } from '@cfb/core-types'
import {
  countImportableConditions,
  feedGraphToJson,
  flattenTopLevelMatch,
  importFeedGraph,
  normalizeCanvasFeedStorage,
} from '@cfb/l2-graph'

export type FeedLogicPatch = Pick<FeedConfig, 'match' | 'visualLayout' | 'rank'>

export function normalizeFeedLogicPatch(patch: FeedLogicPatch): FeedLogicPatch {
  const match =
    patch.visualLayout?.edges?.length
      ? normalizeCanvasFeedStorage(patch.match)
      : flattenTopLevelMatch(patch.match)
  return { ...patch, match }
}

export function feedLogicJson(draft: Pick<FeedConfig, 'match' | 'visualLayout' | 'rank'>): string {
  return feedGraphToJson(draft)
}

export async function copyFeedLogicJson(
  draft: Pick<FeedConfig, 'match' | 'visualLayout' | 'rank'>,
): Promise<'ok' | 'clipboard-failed'> {
  try {
    await navigator.clipboard.writeText(feedGraphToJson(draft))
    return 'ok'
  } catch {
    return 'clipboard-failed'
  }
}

export function downloadFeedLogicJson(draft: Pick<FeedConfig, 'match' | 'visualLayout' | 'rank'>, feedId: string) {
  const text = feedGraphToJson(draft)
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${feedId}-graph.json`
  a.click()
  URL.revokeObjectURL(url)
}

export type ApplyFeedLogicResult =
  | { ok: true; patch: FeedLogicPatch; message: string }
  | { ok: false; error: string }

export function applyFeedLogicJson(
  json: string,
  draft: Pick<FeedConfig, 'match' | 'visualLayout' | 'rank'>,
  options?: { confirmReplace?: boolean },
): ApplyFeedLogicResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json) as unknown
  } catch {
    return { ok: false, error: 'Invalid JSON' }
  }

  const result = importFeedGraph(parsed)
  if (!result) {
    return {
      ok: false,
      error:
        'Unrecognized format. Use CFB feed graph JSON (format: cfb-feed-graph), a snippet with match, or feed-gen / Graze rules.',
    }
  }

  if (options?.confirmReplace !== false && draft.match.children.length > 0) {
    const ok = window.confirm('Replace current feed logic with imported graph?')
    if (!ok) return { ok: false, error: 'Cancelled' }
  }

  const patch = normalizeFeedLogicPatch({
    match: result.match,
    visualLayout: result.visualLayout,
    rank: result.rank ?? draft.rank,
  })

  const count = countImportableConditions(patch.match)
  const message =
    result.source === 'cfb'
      ? `Applied CFB graph (${count} condition node${count === 1 ? '' : 's'}).`
      : `Converted external rules (${count} node${count === 1 ? '' : 's'}). Layout may reset.`

  return { ok: true, patch, message }
}
