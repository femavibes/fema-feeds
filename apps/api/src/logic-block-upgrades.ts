import type { FeedConfig, LogicBlockUpgradeHint } from '@cfb/core-types'
import { loadAllFeeds, saveFeed } from '@cfb/feed-config'
import { resolveFeedMatch } from '@cfb/l2-graph'
import {
  applyLogicBlockUpgrades,
  bumpAutoMinorLogicBlockPins,
  collectLogicBlockRefNodes,
  manualLogicBlockUpgradeHints,
  scanLogicBlockUpgrades,
  type LogicBlockRefInFeed,
} from '@cfb/l2-eval'
import { getLatestLogicBlockPackagesByIds, saveFeedDraft, type Pool } from '@cfb/storage-postgres'

import { loadFeedEditorState } from './feed-editor.js'
import { normalizeFeedDraft } from './feed-lifecycle.js'

async function latestMapForRefs(
  pool: Pool,
  refs: LogicBlockRefInFeed[],
): Promise<Map<string, { version: string; name: string }>> {
  const packageIds = [...new Set(refs.map((r) => r.packageId))]
  const latestPackages = await getLatestLogicBlockPackagesByIds(pool, packageIds)
  return new Map(latestPackages.map((pkg) => [pkg.id, { version: pkg.version, name: pkg.name }]))
}

/**
 * Persist auto_minor patch pin bumps on live (+ draft when present) so feed JSON
 * matches what eval already uses.
 */
export async function syncAutoMinorLogicBlockPins(
  feedsDir: string,
  feedId: string,
  pool: Pool,
  opts?: { packageId?: string; latestByPackageId?: Map<string, string> },
): Promise<{ feed: FeedConfig; bumpedNodeIds: string[] }> {
  const state = await loadFeedEditorState(feedsDir, feedId, pool)
  const ownerDid = state.live.ownerDid

  let latestByPackageId = opts?.latestByPackageId
  if (!latestByPackageId) {
    const refs = collectLogicBlockRefNodes(resolveFeedMatch(state.editor))
    if (refs.length === 0) return { feed: state.editor, bumpedNodeIds: [] }
    const latest = await latestMapForRefs(pool, refs)
    latestByPackageId = new Map([...latest].map(([id, v]) => [id, v.version]))
  }

  const editorBump = bumpAutoMinorLogicBlockPins(
    resolveFeedMatch(state.editor),
    latestByPackageId,
    opts?.packageId,
  )
  const liveBump = bumpAutoMinorLogicBlockPins(
    resolveFeedMatch(state.live),
    latestByPackageId,
    opts?.packageId,
  )

  if (editorBump.bumpedNodeIds.length === 0 && liveBump.bumpedNodeIds.length === 0) {
    return { feed: state.editor, bumpedNodeIds: [] }
  }

  const nextLive: FeedConfig = {
    ...state.live,
    match: liveBump.bumpedNodeIds.length > 0 ? liveBump.next : state.live.match,
  }
  await saveFeed(feedsDir, nextLive)

  let nextEditor: FeedConfig = {
    ...state.editor,
    match: editorBump.bumpedNodeIds.length > 0 ? editorBump.next : state.editor.match,
    published: nextLive.published,
    publishedAt: nextLive.publishedAt,
    liveAt: nextLive.liveAt,
    publishedUri: nextLive.publishedUri,
    enabled: nextLive.enabled,
  }

  if (state.draft && ownerDid) {
    nextEditor = normalizeFeedDraft(nextEditor)
    await saveFeedDraft(pool, feedId, ownerDid, nextEditor)
  } else {
    // No separate draft — live is the editor source.
    nextEditor = nextLive
  }

  const bumpedNodeIds = [...new Set([...editorBump.bumpedNodeIds, ...liveBump.bumpedNodeIds])]
  return { feed: nextEditor, bumpedNodeIds }
}

/** After a logic block package patch bump, update all feeds that auto-follow it. */
export async function propagateAutoMinorPinsForPackage(
  feedsDir: string,
  pool: Pool,
  packageId: string,
  latestVersion: string,
): Promise<number> {
  const feeds = await loadAllFeeds(feedsDir)
  const latestByPackageId = new Map([[packageId, latestVersion]])
  let touched = 0
  for (const feed of feeds) {
    const { bumpedNodeIds } = await syncAutoMinorLogicBlockPins(feedsDir, feed.feedId, pool, {
      packageId,
      latestByPackageId,
    })
    if (bumpedNodeIds.length > 0) touched += 1
  }
  return touched
}

export async function scanFeedLogicBlockUpgrades(
  feedsDir: string,
  feedId: string,
  pool: Pool | null,
): Promise<{
  upgrades: LogicBlockUpgradeHint[]
  feed: FeedConfig
  autoAppliedNodeIds: string[]
}> {
  if (!pool) {
    const { editor } = await loadFeedEditorState(feedsDir, feedId, null)
    return { upgrades: [], feed: editor, autoAppliedNodeIds: [] }
  }

  const synced = await syncAutoMinorLogicBlockPins(feedsDir, feedId, pool)
  const { editor } = await loadFeedEditorState(feedsDir, feedId, pool)
  const refs = collectLogicBlockRefNodes(resolveFeedMatch(editor))
  if (refs.length === 0) {
    return { upgrades: [], feed: editor, autoAppliedNodeIds: synced.bumpedNodeIds }
  }

  const latestByPackageId = await latestMapForRefs(pool, refs)
  return {
    upgrades: manualLogicBlockUpgradeHints(scanLogicBlockUpgrades(refs, latestByPackageId)),
    feed: editor,
    autoAppliedNodeIds: synced.bumpedNodeIds,
  }
}

export async function applyFeedLogicBlockUpgrades(
  feedsDir: string,
  feedId: string,
  pool: Pool,
  userDid: string,
  nodeIds: string[],
): Promise<{ feed: FeedConfig; applied: LogicBlockUpgradeHint[] }> {
  const { editor } = await loadFeedEditorState(feedsDir, feedId, pool)
  const refs = collectLogicBlockRefNodes(resolveFeedMatch(editor))
  const latestByPackageId = await latestMapForRefs(pool, refs)
  const hints = scanLogicBlockUpgrades(refs, latestByPackageId)

  const selected = new Set(nodeIds)
  const toApply = hints.filter((h) => selected.has(h.nodeId))
  if (toApply.length === 0) {
    return { feed: editor, applied: [] }
  }

  const bumps = new Map(toApply.map((h) => [h.nodeId, h.latestVersion]))
  const nextMatch = applyLogicBlockUpgrades(resolveFeedMatch(editor), bumps)
  const nextFeed = normalizeFeedDraft({
    ...editor,
    match: nextMatch,
  })

  await saveFeedDraft(pool, feedId, userDid, nextFeed)
  return { feed: nextFeed, applied: toApply }
}
