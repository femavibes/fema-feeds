import { useEffect, useState } from 'react'
import type { L2NodeProvenance, LogicBlockPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import { LogicBlockTrustBadge } from './logic-block-labels'

interface Props {
  onInsert: (pkg: LogicBlockPackage, versionPin: string, provenance: L2NodeProvenance) => void
}

export function LogicBlockInsertPanel({ onInsert }: Props) {
  const [subscriptions, setSubscriptions] = useState<
    Array<{ package: LogicBlockPackage; versionPin: string }>
  >([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void api
      .listLogicBlockSubscriptions()
      .then((res) =>
        setSubscriptions(
          res.subscriptions.map((s) => ({ package: s.package, versionPin: s.versionPin })),
        ),
      )
      .catch(() => setSubscriptions([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="logic-block-insert-panel">
      <p className="l2-inspector-guide-title">Subscribed logic blocks</p>
      {loading && <p className="card-hint">Loading…</p>}
      {!loading && subscriptions.length === 0 && (
        <p className="card-hint">
          Save a group to your collection or subscribe to blocks from the marketplace.
        </p>
      )}
      <ul className="logic-block-insert-list">
        {subscriptions.map(({ package: pkg, versionPin }) => (
          <li key={`${pkg.id}@${versionPin}`} className="logic-block-insert-item">
            <div className="logic-block-insert-meta">
              <span className="logic-block-insert-name">{pkg.name}</span>
              <span className="logic-block-insert-version">v{versionPin}</span>
              <LogicBlockTrustBadge tier={pkg.trustTier} visibility={pkg.visibility} />
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                onInsert(
                  pkg,
                  versionPin,
                  pkg.visibility === 'collection' ? 'collection' : 'subscription',
                )
              }
            >
              Insert
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
