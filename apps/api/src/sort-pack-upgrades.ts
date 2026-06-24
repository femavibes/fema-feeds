import type { FeedConfig, SortPackUpgradeHint } from '@cfb/core-types'
import { scanSortPackUpgrade } from '@cfb/l2-eval'
import { getLatestSortPackPackagesByIds, saveFeedDraft, type Pool } from '@cfb/storage-postgres'

import { loadFeedEditorState } from './feed-editor.js'
import { normalizeFeedDraft } from './feed-lifecycle.js'

export async function scanFeedSortPackUpgrade(
  feedsDir: string,
  feedId: string,
  pool: Pool | null,
): Promise<SortPackUpgradeHint | null> {
  if (!pool) return null
  const { editor } = await loadFeedEditorState(feedsDir, feedId, pool)
  const packRef = editor.rank?.packRef
  if (!packRef) return null
  const latestPackages = await getLatestSortPackPackagesByIds(pool, [packRef.packageId])
  const latest = latestPackages[0]
  return scanSortPackUpgrade(packRef, latest ? { version: latest.version, name: latest.name } : undefined)
}

export async function applyFeedSortPackUpgrade(
  feedsDir: string,
  feedId: string,
  pool: Pool,
  userDid: string,
): Promise<{ feed: FeedConfig; applied: SortPackUpgradeHint | null }> {
  const hint = await scanFeedSortPackUpgrade(feedsDir, feedId, pool)
  if (!hint) {
    const { editor } = await loadFeedEditorState(feedsDir, feedId, pool)
    return { feed: editor, applied: null }
  }

  const { editor } = await loadFeedEditorState(feedsDir, feedId, pool)
  const packRef = editor.rank?.packRef
  if (!packRef) return { feed: editor, applied: null }

  const nextFeed = normalizeFeedDraft({
    ...editor,
    rank: {
      ...editor.rank,
      packRef: { ...packRef, versionPin: hint.latestVersion },
    },
  })

  await saveFeedDraft(pool, feedId, userDid, nextFeed)
  return { feed: nextFeed, applied: hint }
}
