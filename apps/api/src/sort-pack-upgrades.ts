import type { FeedConfig, SortPackRef, SortPackUpgradeHint } from '@cfb/core-types'
import { loadAllFeeds, saveFeed } from '@cfb/feed-config'
import {
  bumpAutoMinorSortPackPin,
  manualSortPackUpgradeHint,
  scanSortPackUpgrade,
} from '@cfb/l2-eval'
import { getLatestSortPackPackagesByIds, saveFeedDraft, type Pool } from '@cfb/storage-postgres'

import { loadFeedEditorState } from './feed-editor.js'
import { normalizeFeedDraft } from './feed-lifecycle.js'

type PackRefTarget = 'rank' | 'personalization'

function readPackRef(feed: FeedConfig, target: PackRefTarget): SortPackRef | undefined {
  if (target === 'rank') return feed.rank?.packRef
  return feed.personalization?.formulaPackRef
}

function writePackRef(feed: FeedConfig, target: PackRefTarget, packRef: SortPackRef | undefined): FeedConfig {
  if (target === 'rank') {
    if (!packRef) {
      const { packRef: _removed, ...restRank } = feed.rank ?? {}
      return { ...feed, rank: Object.keys(restRank).length ? restRank : undefined }
    }
    return { ...feed, rank: { ...feed.rank, packRef } }
  }
  if (!packRef) {
    if (!feed.personalization?.formulaPackRef) return feed
    const { formulaPackRef: _removed, ...rest } = feed.personalization
    return { ...feed, personalization: rest }
  }
  return {
    ...feed,
    personalization: { ...feed.personalization, formulaPackRef: packRef },
  }
}

async function latestForRef(
  pool: Pool,
  packRef: SortPackRef,
): Promise<{ version: string; name: string; sortKey: import('@cfb/core-types').L2Expr } | undefined> {
  const latestPackages = await getLatestSortPackPackagesByIds(pool, [packRef.packageId])
  const latest = latestPackages[0]
  if (!latest) return undefined
  return { version: latest.version, name: latest.name, sortKey: latest.sortKey }
}

export async function scanFeedSortPackUpgrade(
  feedsDir: string,
  feedId: string,
  pool: Pool | null,
  target: PackRefTarget = 'rank',
): Promise<SortPackUpgradeHint | null> {
  if (!pool) return null
  const { editor } = await loadFeedEditorState(feedsDir, feedId, pool)
  const packRef = readPackRef(editor, target)
  if (!packRef) return null
  const latest = await latestForRef(pool, packRef)
  return manualSortPackUpgradeHint(
    scanSortPackUpgrade(packRef, latest ? { version: latest.version, name: latest.name } : undefined),
  )
}

export async function syncAutoMinorSortPackPin(
  feedsDir: string,
  feedId: string,
  pool: Pool,
  target: PackRefTarget,
  opts?: { packageId?: string; latestVersion?: string },
): Promise<{ feed: FeedConfig; bumped: boolean }> {
  const state = await loadFeedEditorState(feedsDir, feedId, pool)
  const ownerDid = state.live.ownerDid
  const editorRef = readPackRef(state.editor, target)
  const liveRef = readPackRef(state.live, target)
  if (!editorRef && !liveRef) return { feed: state.editor, bumped: false }
  if (opts?.packageId) {
    if (editorRef?.packageId !== opts.packageId && liveRef?.packageId !== opts.packageId) {
      return { feed: state.editor, bumped: false }
    }
  }

  let latestVersion = opts?.latestVersion
  const ref = editorRef ?? liveRef
  if (!latestVersion && ref && pool) {
    const latest = await latestForRef(pool, ref)
    latestVersion = latest?.version
  }

  const editorBump = bumpAutoMinorSortPackPin(editorRef, latestVersion)
  const liveBump = bumpAutoMinorSortPackPin(liveRef, latestVersion)
  if (!editorBump.bumped && !liveBump.bumped) return { feed: state.editor, bumped: false }

  const nextLive = writePackRef(state.live, target, liveBump.next ?? liveRef)
  await saveFeed(feedsDir, nextLive)

  let nextEditor = writePackRef(state.editor, target, editorBump.next ?? editorRef)
  nextEditor = {
    ...nextEditor,
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
    nextEditor = nextLive
  }

  return { feed: nextEditor, bumped: true }
}

/** After a sort/personalization formula patch bump, update feeds that auto-follow it. */
export async function propagateAutoMinorPinsForSortPack(
  feedsDir: string,
  pool: Pool,
  packageId: string,
  latestVersion: string,
): Promise<number> {
  const feeds = await loadAllFeeds(feedsDir)
  let touched = 0
  for (const feed of feeds) {
    if (feed.rank?.packRef?.packageId === packageId) {
      const { bumped } = await syncAutoMinorSortPackPin(feedsDir, feed.feedId, pool, 'rank', {
        packageId,
        latestVersion,
      })
      if (bumped) touched += 1
    }
    if (feed.personalization?.formulaPackRef?.packageId === packageId) {
      const { bumped } = await syncAutoMinorSortPackPin(feedsDir, feed.feedId, pool, 'personalization', {
        packageId,
        latestVersion,
      })
      if (bumped) touched += 1
    }
  }
  return touched
}

export async function applyFeedSortPackUpgrade(
  feedsDir: string,
  feedId: string,
  pool: Pool,
  userDid: string,
  target: PackRefTarget = 'rank',
): Promise<{ feed: FeedConfig; applied: SortPackUpgradeHint | null }> {
  const hint = await scanFeedSortPackUpgrade(feedsDir, feedId, pool, target)
  if (!hint) {
    const { editor } = await loadFeedEditorState(feedsDir, feedId, pool)
    return { feed: editor, applied: null }
  }

  const { editor } = await loadFeedEditorState(feedsDir, feedId, pool)
  const packRef = readPackRef(editor, target)
  if (!packRef) return { feed: editor, applied: null }

  const latest = await latestForRef(pool, packRef)
  let nextFeed = writePackRef(editor, target, { ...packRef, versionPin: hint.latestVersion })

  if (target === 'personalization' && latest?.sortKey) {
    nextFeed = {
      ...nextFeed,
      personalization: {
        ...nextFeed.personalization,
        formulaEnabled: true,
        formula: latest.sortKey,
      },
    }
  }

  nextFeed = normalizeFeedDraft(nextFeed)
  await saveFeedDraft(pool, feedId, userDid, nextFeed)
  return { feed: nextFeed, applied: hint }
}
