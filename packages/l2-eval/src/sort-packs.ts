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
