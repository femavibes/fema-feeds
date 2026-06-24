import { useEffect, useState } from 'react'
import type { PluginKind, PluginPackage } from '@cfb/core-types'

import { api } from '../../api/client'

interface Props {
  kind?: PluginKind
  selectedId: string | null
  onSelect: (pkg: PluginPackage) => void
  onChanged?: () => void
}

export function InjectorsInstalledView({ kind = 'injector', selectedId, onSelect }: Props) {
  const [subscriptions, setSubscriptions] = useState<
    Awaited<ReturnType<typeof api.listPluginSubscriptions>>['subscriptions']
  >([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void api
      .listPluginSubscriptions(kind)
      .then((res) => setSubscriptions(res.subscriptions))
      .catch(() => setSubscriptions([]))
      .finally(() => setLoading(false))
  }, [kind])

  return (
    <div className="logic-blocks-installed">
      {loading && <p className="card-hint">Loading subscriptions…</p>}
      {!loading && subscriptions.length === 0 && (
        <p className="card-hint">
          No {kind === 'ranker' ? 'rankers' : 'injectors'} subscribed yet. Browse the marketplace to install one.
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
                  v{sub.versionPin} · {sub.updatePolicy} · {sub.package.runtime}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
