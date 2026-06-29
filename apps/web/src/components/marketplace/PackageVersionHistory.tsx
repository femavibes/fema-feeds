import type { PluginKind } from '@cfb/core-types'
import { useEffect, useMemo, useState } from 'react'

import { api } from '../../api/client'
import { compareSemver } from '../logic-blocks/logic-block-labels'

export type PackageVersionProductKind = 'logic_block' | 'sort_pack' | 'plugin'

interface VersionRow {
  version: string
  createdAt: string
}

interface Props {
  productKind: PackageVersionProductKind
  packageId: string
  pluginKind?: PluginKind
  latestVersion?: string
  pinnedVersion?: string
  updatePolicy?: 'pinned' | 'notify' | 'auto_minor'
  mode: 'owner' | 'subscriber'
  onPinVersion?: (version: string, updatePolicy?: 'pinned' | 'notify' | 'auto_minor') => void
  busy?: boolean
}

async function fetchVersions(
  productKind: PackageVersionProductKind,
  packageId: string,
  pluginKind?: PluginKind,
): Promise<VersionRow[]> {
  if (productKind === 'logic_block') {
    const res = await api.listLogicBlockVersions(packageId)
    return res.versions.map((v) => ({ version: v.version, createdAt: v.createdAt }))
  }
  if (productKind === 'sort_pack') {
    const res = await api.listSortPackVersions(packageId)
    return res.versions.map((v) => ({ version: v.version, createdAt: v.createdAt }))
  }
  const res = await api.listPluginVersions(packageId)
  return res.versions.map((v) => ({ version: v.version, createdAt: v.createdAt }))
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function PackageVersionHistory({
  productKind,
  packageId,
  pluginKind,
  latestVersion,
  pinnedVersion,
  updatePolicy = 'pinned',
  mode,
  onPinVersion,
  busy,
}: Props) {
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pick, setPick] = useState(pinnedVersion ?? latestVersion ?? '')

  useEffect(() => {
    setLoading(true)
    void fetchVersions(productKind, packageId, pluginKind)
      .then(setVersions)
      .catch(() => setVersions([]))
      .finally(() => setLoading(false))
  }, [productKind, packageId, pluginKind])

  useEffect(() => {
    setPick(pinnedVersion ?? latestVersion ?? versions[0]?.version ?? '')
  }, [pinnedVersion, latestVersion, versions])

  const latest = useMemo(() => {
    if (latestVersion) return latestVersion
    if (versions.length === 0) return null
    return [...versions].sort((a, b) => compareSemver(b.version, a.version))[0]?.version ?? null
  }, [latestVersion, versions])

  const newerAvailable =
    pinnedVersion != null && latest != null && compareSemver(latest, pinnedVersion) > 0

  if (loading) return <p className="card-hint">Loading version history…</p>
  if (versions.length === 0) return <p className="card-hint">No saved versions yet.</p>

  return (
    <div className="package-version-history">
      <p className="package-version-history-title">Version history</p>
      <ul className="package-version-history-list">
        {versions.map((v) => {
          const isLatest = latest === v.version
          const isPinned = pinnedVersion === v.version
          return (
            <li
              key={v.version}
              className={`package-version-history-item${isPinned ? ' is-pinned' : ''}`}
            >
              <span className="package-version-history-ver">v{v.version}</span>
              <span className="package-version-history-when">{formatWhen(v.createdAt)}</span>
              {isLatest ? <span className="package-version-history-tag">Latest</span> : null}
              {isPinned ? <span className="package-version-history-tag">Pinned</span> : null}
            </li>
          )
        })}
      </ul>

      {mode === 'subscriber' && onPinVersion ? (
        <div className="package-version-history-actions">
          <label className="l2-inspector-field">
            Installed version
            <select value={pick} disabled={busy} onChange={(e) => setPick(e.target.value)}>
              {versions.map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version}
                  {v.version === latest ? ' (latest)' : ''}
                </option>
              ))}
            </select>
          </label>
          {pick !== pinnedVersion ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy || !pick}
              onClick={() => onPinVersion(pick, updatePolicy)}
            >
              {compareSemver(pick, pinnedVersion ?? '') < 0 ? 'Revert to' : 'Switch to'} v{pick}
            </button>
          ) : null}
          {newerAvailable && latest ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => onPinVersion(latest, updatePolicy)}
            >
              Update to v{latest}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="card-hint">
          Logic or code edits create a new semver snapshot. Subscribers choose which version to pin.
        </p>
      )}
    </div>
  )
}
