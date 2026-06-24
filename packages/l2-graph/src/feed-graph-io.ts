import type { FeedConfig, L2RuleGroup } from '@cfb/core-types'
import { importFeedGenRules } from './import.js'
import { normalizeCanvasFeedStorage } from './canvas-match.js'

/** Native CFB feed logic export — round-trips with importFeedGraph. */
export interface CfbFeedGraphExport {
  version: 1
  format: 'cfb-feed-graph'
  exportedAt: string
  match: L2RuleGroup
  visualLayout?: FeedConfig['visualLayout']
  rank?: FeedConfig['rank']
}

export interface FeedGraphImportResult {
  match: L2RuleGroup
  visualLayout?: FeedConfig['visualLayout']
  rank?: FeedConfig['rank']
  /** Where the rules came from — for UI messaging. */
  source: 'cfb' | 'converted'
}

function isRuleGroup(value: unknown): value is L2RuleGroup {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as L2RuleGroup).type === 'group' &&
    Array.isArray((value as L2RuleGroup).children)
  )
}

export function exportFeedGraph(
  draft: Pick<FeedConfig, 'match' | 'visualLayout' | 'rank'>,
): CfbFeedGraphExport {
  const match =
    draft.visualLayout?.edges?.length
      ? normalizeCanvasFeedStorage(draft.match)
      : draft.match

  const payload: CfbFeedGraphExport = {
    version: 1,
    format: 'cfb-feed-graph',
    exportedAt: new Date().toISOString(),
    match,
  }
  if (draft.visualLayout) payload.visualLayout = draft.visualLayout
  if (draft.rank) payload.rank = draft.rank
  return payload
}

export function importFeedGraph(raw: unknown): FeedGraphImportResult | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  if (obj.format === 'cfb-feed-graph' && isRuleGroup(obj.match)) {
    const visualLayout = obj.visualLayout as FeedConfig['visualLayout'] | undefined
    const match =
      visualLayout?.edges?.length
        ? normalizeCanvasFeedStorage(obj.match)
        : obj.match
    return {
      match,
      visualLayout,
      rank: obj.rank as FeedConfig['rank'] | undefined,
      source: 'cfb',
    }
  }

  if (isRuleGroup(obj.match)) {
    const visualLayout = obj.visualLayout as FeedConfig['visualLayout'] | undefined
    const match =
      visualLayout?.edges?.length
        ? normalizeCanvasFeedStorage(obj.match)
        : obj.match
    return {
      match,
      visualLayout,
      rank: obj.rank as FeedConfig['rank'] | undefined,
      source: 'cfb',
    }
  }

  const converted = importFeedGenRules(raw)
  if (converted) {
    return { match: converted, source: 'converted' }
  }

  return null
}

export function feedGraphToJson(draft: Pick<FeedConfig, 'match' | 'visualLayout' | 'rank'>): string {
  return JSON.stringify(exportFeedGraph(draft), null, 2)
}
