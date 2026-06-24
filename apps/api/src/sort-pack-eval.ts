import type { FeedConfig } from '@cfb/core-types'
import { feedWithResolvedRank, resolveSortPackVersionPin } from '@cfb/l2-eval'
import {
  getLatestSortPackPackagesByIds,
  getSortPackPackageById,
  type Pool,
} from '@cfb/storage-postgres'

export async function resolveFeedSortPack(pool: Pool | null, feed: FeedConfig): Promise<FeedConfig> {
  const packRef = feed.rank?.packRef
  if (!pool || !packRef) return feed

  const latestPackages = await getLatestSortPackPackagesByIds(pool, [packRef.packageId])
  const latest = latestPackages[0]?.version
  const versionPin =
    latest != null
      ? resolveSortPackVersionPin(packRef.versionPin, latest, packRef.updatePolicy ?? 'pinned')
      : packRef.versionPin

  const pkg = await getSortPackPackageById(pool, packRef.packageId, versionPin)
  if (!pkg) return feed

  return feedWithResolvedRank(feed, pkg.sortKey)
}
