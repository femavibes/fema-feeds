import { useEffect, useState } from 'react'
import type { FeedConfig, PluginPackage, RankerRef } from '@cfb/core-types'

import { api } from '../../api/client'

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
      <p className="sidebar-block-title">Serve-time ranker (custom code)</p>
      {rankerRef ? (
        <>
          <p className="card-hint">
            Using <strong>{rankerRef.label ?? 'ranker'}</strong> v{rankerRef.versionPin}. Reorders each skeleton
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
            Remove ranker
          </button>
        </>
      ) : (
        <p className="card-hint">
          Subscribe to a ranker in Marketplace, then apply it here for serve-time reordering.
        </p>
      )}

      {subscriptions.length > 0 ? (
        <ul className="logic-blocks-catalog-list feed-sorting-pack-list">
          {subscriptions.map((sub) => (
            <li key={sub.packageId}>
              <button
                type="button"
                className="logic-blocks-catalog-item"
                onClick={() => applyRanker(sub.package, sub.versionPin)}
              >
                <span className="logic-blocks-catalog-name">{sub.package.name}</span>
                <span className="logic-blocks-catalog-sub">
                  v{sub.versionPin} · {sub.package.runtime}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card-hint">Subscribe to rankers in Marketplace → Browse → Rankers.</p>
      )}
    </div>
  )
}
