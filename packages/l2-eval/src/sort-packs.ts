import type { FeedConfig, FeedRankConfig, L2Expr, SortPackUpgradeHint } from '@cfb/core-types'
import { compareSemver, isPatchUpgrade, resolveLogicBlockVersionPin } from './logic-block-upgrades.js'

export { resolveLogicBlockVersionPin as resolveSortPackVersionPin }

export function scanSortPackUpgrade(
  packRef: NonNullable<FeedRankConfig['packRef']>,
  latest: { version: string; name: string } | undefined,
): SortPackUpgradeHint | null {
  if (!latest) return null
  if (compareSemver(latest.version, packRef.versionPin) <= 0) return null
  return {
    packageId: packRef.packageId,
    packageName: latest.name,
    label: packRef.label,
    pinnedVersion: packRef.versionPin,
    latestVersion: latest.version,
    updatePolicy: packRef.updatePolicy ?? 'pinned',
    patchUpgrade: isPatchUpgrade(packRef.versionPin, latest.version),
  }
}

/** Hints that still need a human decision (exclude quiet/pinned + auto_minor patches). */
export function manualSortPackUpgradeHint(
  hint: SortPackUpgradeHint | null,
): SortPackUpgradeHint | null {
  if (!hint) return null
  if (hint.updatePolicy === 'pinned') return null
  if (hint.updatePolicy === 'auto_minor' && hint.patchUpgrade) return null
  return hint
}

export function bumpAutoMinorSortPackPin(
  packRef: NonNullable<FeedRankConfig['packRef']> | undefined,
  latestVersion: string | undefined,
): { next: NonNullable<FeedRankConfig['packRef']> | undefined; bumped: boolean } {
  if (!packRef || !latestVersion) return { next: packRef, bumped: false }
  const policy = packRef.updatePolicy ?? 'pinned'
  if (policy !== 'auto_minor' || !isPatchUpgrade(packRef.versionPin, latestVersion)) {
    return { next: packRef, bumped: false }
  }
  if (packRef.versionPin === latestVersion) return { next: packRef, bumped: false }
  return {
    next: { ...packRef, versionPin: latestVersion },
    bumped: true,
  }
}

export function feedWithResolvedRank(feed: FeedConfig, resolvedSortKey: L2Expr | null): FeedConfig {
  if (!resolvedSortKey) return feed
  return {
    ...feed,
    rank: {
      ...feed.rank,
      sortKey: resolvedSortKey,
    },
  }
}
