import type { FeedConfig, LogicBlockUpgradeHint } from '@cfb/core-types'
import { resolveFeedMatch } from '@cfb/l2-graph'
import {
  applyLogicBlockUpgrades,
  collectLogicBlockRefNodes,
  scanLogicBlockUpgrades,
  type LogicBlockRefInFeed,
} from '@cfb/l2-eval'
import { getLatestLogicBlockPackagesByIds, saveFeedDraft, type Pool } from '@cfb/storage-postgres'

import { loadFeedEditorState } from './feed-editor.js'
import { normalizeFeedDraft } from './feed-lifecycle.js'

export async function scanFeedLogicBlockUpgrades(
  feedsDir: string,
  feedId: string,
  pool: Pool | null,
): Promise<LogicBlockUpgradeHint[]> {
  if (!pool) return []

  const { editor } = await loadFeedEditorState(feedsDir, feedId, pool)
  const refs = collectLogicBlockRefNodes(resolveFeedMatch(editor))
  if (refs.length === 0) return []

  const packageIds = [...new Set(refs.map((r: LogicBlockRefInFeed) => r.packageId))]
  const latestPackages = await getLatestLogicBlockPackagesByIds(pool, packageIds)
  const latestByPackageId = new Map(
    latestPackages.map((pkg) => [pkg.id, { version: pkg.version, name: pkg.name }]),
  )

  return scanLogicBlockUpgrades(refs, latestByPackageId)
}

export async function applyFeedLogicBlockUpgrades(
  feedsDir: string,
  feedId: string,
  pool: Pool,
  userDid: string,
  nodeIds: string[],
): Promise<{ feed: FeedConfig; applied: LogicBlockUpgradeHint[] }> {
  const hints = await scanFeedLogicBlockUpgrades(feedsDir, feedId, pool)
  const selected = new Set(nodeIds)
  const toApply = hints.filter((h) => selected.has(h.nodeId))
  if (toApply.length === 0) {
    const { editor } = await loadFeedEditorState(feedsDir, feedId, pool)
    return { feed: editor, applied: [] }
  }

  const { editor } = await loadFeedEditorState(feedsDir, feedId, pool)
  const bumps = new Map(toApply.map((h) => [h.nodeId, h.latestVersion]))
  const nextMatch = applyLogicBlockUpgrades(resolveFeedMatch(editor), bumps)
  const nextFeed = normalizeFeedDraft({
    ...editor,
    match: nextMatch,
  })

  await saveFeedDraft(pool, feedId, userDid, nextFeed)
  return { feed: nextFeed, applied: toApply }
}
