import { useEffect, useState } from 'react'
import type { SortPackPackage } from '@cfb/core-types'

import { api } from '../../api/client'

interface Props {
  selectedId: string | null
  onSelect: (pkg: SortPackPackage) => void
  onChanged?: () => void
}

export function SortPacksInstalledView({ selectedId, onSelect, onChanged }: Props) {
  const [subscriptions, setSubscriptions] = useState<
    Awaited<ReturnType<typeof api.listSortPackSubscriptions>>['subscriptions']
  >([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    void api
      .listSortPackSubscriptions()
      .then((res) => setSubscriptions(res.subscriptions))
      .catch(() => setSubscriptions([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="logic-blocks-installed">
      {loading && <p className="card-hint">Loading subscriptions…</p>}
      {!loading && subscriptions.length === 0 && (
        <p className="card-hint">
          No sort packs subscribed yet. Browse the marketplace or save from a feed&apos;s Sorting tab.
        </p>
      )}
      <ul className="logic-blocks-catalog-list">
        {subscriptions.map((sub) => (
          <li key={sub.packageId}>
            <button
              type="button"
              className={`logic-blocks-catalog-item${selectedId === sub.packageId ? ' is-selected' : ''}`}
              onClick={() => onSelect(sub.package)}
            >
              <div className="logic-blocks-catalog-meta">
                <span className="logic-blocks-catalog-name">{sub.package.name}</span>
                <span className="logic-blocks-catalog-sub">
                  v{sub.versionPin} · {sub.updatePolicy}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {onChanged ? null : null}
    </div>
  )
}
