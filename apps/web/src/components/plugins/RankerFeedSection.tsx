import { useEffect, useMemo, useState } from 'react'
import type { FeedConfig, PluginPackage, RankerRef } from '@cfb/core-types'

import { api } from '../../api/client'
import { FeedPluginPackGrid } from './FeedPluginPackGrid'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig) => void
}

function defaultRankerRef(pkg: PluginPackage, versionPin: string): RankerRef {
  return {
    packageId: pkg.id,
    versionPin,
    label: pkg.name,
    config: pkg.runtime === 'native' ? { pinnedUris: [] } : {},
  }
}

export function RankerFeedSection({ draft, onChange }: Props) {
  const [subscriptions, setSubscriptions] = useState<
    Awaited<ReturnType<typeof api.listPluginSubscriptions>>['subscriptions']
  >([])

  const rankerRef = draft.rank?.rankerRef

  useEffect(() => {
    void api
      .listPluginSubscriptions('ranker')
      .then((res) => setSubscriptions(res.subscriptions))
      .catch(() => setSubscriptions([]))
  }, [])

  const packages = useMemo(
    () =>
      [...subscriptions]
        .map((s) => s.package)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [subscriptions],
  )

  const versionPins = useMemo(
    () => new Map(subscriptions.map((s) => [s.packageId, s.versionPin])),
    [subscriptions],
  )

  const applyRanker = (pkg: PluginPackage, versionPin: string) => {
    onChange({
      ...draft,
      rank: {
        ...draft.rank,
        rankerRef: defaultRankerRef(pkg, versionPin),
      },
    })
  }

  const patchPinnedUris = (text: string) => {
    if (!rankerRef) return
    const pinnedUris = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    onChange({
      ...draft,
      rank: {
        ...draft.rank,
        rankerRef: { ...rankerRef, config: { ...rankerRef.config, pinnedUris } },
      },
    })
  }

  const clearRanker = () => {
    const { rankerRef: _removed, ...restRank } = draft.rank ?? {}
    onChange({ ...draft, rank: Object.keys(restRank).length > 0 ? restRank : undefined })
  }

  const pinnedText = Array.isArray(rankerRef?.config?.pinnedUris)
    ? (rankerRef.config.pinnedUris as string[]).join('\n')
    : ''

  return (
    <div className="feed-sorting-packs feed-ranker-section">
      <p className="sidebar-block-title">Personalization (custom code)</p>
      {rankerRef ? (
        <>
          <p className="card-hint">
            Using <strong>{rankerRef.label ?? 'personalization'}</strong> v{rankerRef.versionPin}. Reorders each skeleton
            page at serve time (after DB sort, before inject).
          </p>
          <label className="field-label">
            Pinned URIs (one at:// URI per line, top of page)
            <textarea
              rows={4}
              value={pinnedText}
              onChange={(e) => patchPinnedUris(e.target.value)}
              placeholder="at://did:plc:…/app.bsky.feed.post/…"
            />
          </label>
          <button type="button" className="btn btn-secondary btn-sm" onClick={clearRanker}>
            Remove
          </button>
        </>
      ) : (
        <p className="card-hint">
          Subscribe to a personalization plugin in Marketplace, then apply it here for serve-time reordering.
        </p>
      )}

      {packages.length > 0 ? (
        <>
          <p className="feed-formula-pack-group-label">Subscribed</p>
          <FeedPluginPackGrid
            packages={packages}
            versionPins={versionPins}
            productKind="ranker"
            selectedPackageId={rankerRef?.packageId}
            subscribed
            onSelect={applyRanker}
          />
        </>
      ) : (
        <p className="card-hint">Subscribe in Marketplace → Browse → Personalization.</p>
      )}
    </div>
  )
}
