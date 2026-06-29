import { useEffect, useState } from 'react'
import type { PluginKind, PluginPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import { PackageVersionHistory } from '../marketplace/PackageVersionHistory'

interface Props {
  kind?: PluginKind
  selectedId: string | null
  onSelect: (pkg: PluginPackage) => void
  onChanged?: () => void
}

export function InjectorsInstalledView({ kind = 'injector', selectedId, onSelect, onChanged }: Props) {
  const [subscriptions, setSubscriptions] = useState<
    Awaited<ReturnType<typeof api.listPluginSubscriptions>>['subscriptions']
  >([])
  const [latestById, setLatestById] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    void Promise.all([
      api.listPluginSubscriptions(kind),
      api.listPluginCatalog(kind, 'all').catch(() => ({ packages: [] as PluginPackage[] })),
    ])
      .then(([subsRes, catalogRes]) => {
        setSubscriptions(subsRes.subscriptions)
        const latest = new Map<string, string>()
        for (const pkg of catalogRes.packages) latest.set(pkg.id, pkg.version)
        setLatestById(latest)
      })
      .catch(() => setSubscriptions([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [kind])

  const pinVersion = async (packageId: string, versionPin: string, updatePolicy: string) => {
    setBusyId(packageId)
    try {
      await api.subscribePlugin(packageId, {
        versionPin,
        updatePolicy: updatePolicy as import('@cfb/core-types').PluginUpdatePolicy,
      })
      load()
      onChanged?.()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="logic-blocks-installed">
      {loading && <p className="card-hint">Loading subscriptions…</p>}
      {!loading && subscriptions.length === 0 && (
        <p className="card-hint">
          No {kind === 'ranker' ? 'personalization plugins' : 'injectors'} subscribed yet. Browse the marketplace to install one.
        </p>
      )}
      <ul className="logic-blocks-catalog-list">
        {subscriptions.map((sub) => {
          const latest = latestById.get(sub.packageId) ?? sub.package.version
          return (
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
              <PackageVersionHistory
                productKind="plugin"
                packageId={sub.packageId}
                pluginKind={kind}
                latestVersion={latest}
                pinnedVersion={sub.versionPin}
                updatePolicy={sub.updatePolicy}
                mode="subscriber"
                busy={busyId === sub.packageId}
                onPinVersion={(v, policy) =>
                  void pinVersion(sub.packageId, v, policy ?? sub.updatePolicy)
                }
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
