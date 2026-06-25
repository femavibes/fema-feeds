import { useEffect, useState } from 'react'
import type { LogicBlockPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import { PackageVersionHistory } from '../marketplace/PackageVersionHistory'
import { compareSemver, LogicBlockTrustBadge, trustLabel, visibilityLabel } from './logic-block-labels'

interface Props {
  selectedId?: string | null
  onSelect?: (pkg: LogicBlockPackage) => void
  onChanged?: () => void
}

export function LogicBlocksInstalledView({ selectedId, onSelect, onChanged }: Props) {
  const [subscriptions, setSubscriptions] = useState<
    Array<{ package: LogicBlockPackage; versionPin: string; updatePolicy: import('@cfb/core-types').LogicBlockUpdatePolicy }>
  >([])
  const [catalogLatest, setCatalogLatest] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    void Promise.all([
      api.listLogicBlockSubscriptions(),
      api.listLogicBlockCatalog('all').catch(() => ({
        packages: [] as LogicBlockPackage[],
        scope: 'all' as const,
        mode: 'local' as const,
      })),
    ])
      .then(([subsRes, catalogRes]) => {
        setSubscriptions(
          subsRes.subscriptions.map((s) => ({
            package: s.package,
            versionPin: s.versionPin,
            updatePolicy: s.updatePolicy,
          })),
        )
        const latest = new Map<string, string>()
        for (const pkg of catalogRes.packages) {
          latest.set(pkg.id, pkg.version)
        }
        setCatalogLatest(latest)
      })
      .catch(() => setSubscriptions([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const pinVersion = async (
    pkg: LogicBlockPackage,
    versionPin: string,
    updatePolicy: import('@cfb/core-types').LogicBlockUpdatePolicy,
  ) => {
    setBusyId(pkg.id)
    try {
      await api.subscribeLogicBlock(pkg.id, { versionPin, updatePolicy })
      load()
      onChanged?.()
    } finally {
      setBusyId(null)
    }
  }

  const changePolicy = async (
    pkg: LogicBlockPackage,
    versionPin: string,
    updatePolicy: import('@cfb/core-types').LogicBlockUpdatePolicy,
  ) => {
    setBusyId(pkg.id)
    try {
      await api.subscribeLogicBlock(pkg.id, { versionPin, updatePolicy })
      load()
      onChanged?.()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="logic-blocks-installed">
      <p className="card-hint">
        Subscribed blocks are available in the visual editor. Pin any published version or update
        manually when the publisher ships a new release.
      </p>
      {loading && <p className="card-hint">Loading subscriptions…</p>}
      {!loading && subscriptions.length === 0 && (
        <p className="card-hint">
          Nothing subscribed yet. Browse the marketplace or save logic to My collection.
        </p>
      )}
      <ul className="logic-blocks-installed-list">
        {subscriptions.map(({ package: pkg, versionPin, updatePolicy }) => {
          const latest = catalogLatest.get(pkg.id) ?? pkg.version
          return (
            <li key={`${pkg.id}@${versionPin}`} className="logic-blocks-installed-item">
              <button
                type="button"
                className={`logic-blocks-installed-select${selectedId === pkg.id ? ' is-selected' : ''}`}
                onClick={() => onSelect?.(pkg)}
              >
                <div className="logic-blocks-installed-meta">
                  <span className="logic-blocks-installed-name">{pkg.name}</span>
                  <span className="logic-blocks-installed-sub">
                    v{versionPin} · {visibilityLabel(pkg.visibility)}
                    {trustLabel(pkg) ? ` · ${trustLabel(pkg)}` : ''}
                    {latest && compareSemver(latest, versionPin) > 0 ? ` · v${latest} available` : ''}
                  </span>
                  {pkg.description ? <span className="card-hint">{pkg.description}</span> : null}
                  <LogicBlockTrustBadge tier={pkg.trustTier} visibility={pkg.visibility} />
                </div>
              </button>
              <div className="logic-blocks-installed-actions">
                <label className="l2-inspector-field logic-blocks-installed-policy">
                  Update policy
                  <select
                    value={updatePolicy}
                    disabled={busyId === pkg.id}
                    onChange={(e) =>
                      void changePolicy(
                        pkg,
                        versionPin,
                        e.target.value as import('@cfb/core-types').LogicBlockUpdatePolicy,
                      )
                    }
                  >
                    <option value="pinned">Pinned (manual updates)</option>
                    <option value="notify">Notify on new version</option>
                    <option value="auto_minor">Auto minor patches</option>
                  </select>
                </label>
                <PackageVersionHistory
                  productKind="logic_block"
                  packageId={pkg.id}
                  latestVersion={latest}
                  pinnedVersion={versionPin}
                  updatePolicy={updatePolicy}
                  mode="subscriber"
                  busy={busyId === pkg.id}
                  onPinVersion={(v, policy) => void pinVersion(pkg, v, policy ?? updatePolicy)}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
