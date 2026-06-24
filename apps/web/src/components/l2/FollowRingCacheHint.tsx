import type { L2FollowRingCondition } from '@cfb/core-types'
import { followRingCacheListId } from '../../lib/l2-form'
import type { ListCacheEntry } from '../../api/client'

interface Props {
  node: L2FollowRingCondition
  listCache: ListCacheEntry[]
}

export function FollowRingCacheHint({ node, listCache }: Props) {
  const cacheId = followRingCacheListId(node.id)
  const entry = listCache.find((c) => c.listId === cacheId)
  const memberCount = entry?.memberCount

  if ((node.hubSource ?? 'account') === 'viewer') return null

  if (!(node.hub ?? '').trim()) return null

  return (
    <p className="l2-condition-hint">
      {memberCount != null ? (
        <>
          Cached ring: <strong>{memberCount.toLocaleString()}</strong> accounts
          {entry?.refreshedAt ? ` · updated ${new Date(entry.refreshedAt).toLocaleString()}` : ''}
        </>
      ) : (
        'Ring not cached yet — save the feed or run list poll to refresh from Bluesky.'
      )}
    </p>
  )
}
