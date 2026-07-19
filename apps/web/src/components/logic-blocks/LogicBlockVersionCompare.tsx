import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LogicBlockPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import { compareSemver } from './logic-block-labels'
import { diffLines, packageRootJson } from '../../lib/logic-block-json-diff'
import { LogicBlockReadonlyCanvas } from './LogicBlockReadonlyCanvas'

export type LogicBlockCompareTarget = {
  packageId: string
  fromVersion: string
  toVersion: string
  title?: string
  /** When set, shows Upgrade in the footer (upgrade-banner flow). */
  onUpgrade?: (toVersion: string) => void | Promise<void>
}

interface Props extends LogicBlockCompareTarget {
  onClose: () => void
}

type CompareView = 'visual' | 'json'

export function LogicBlockVersionCompare({
  packageId,
  fromVersion: fromVersionProp,
  toVersion: toVersionProp,
  title,
  onUpgrade,
  onClose,
}: Props) {
  const [versions, setVersions] = useState<string[]>([])
  const [fromVersion, setFromVersion] = useState(fromVersionProp)
  const [toVersion, setToVersion] = useState(toVersionProp)
  const [fromPkg, setFromPkg] = useState<LogicBlockPackage | null>(null)
  const [toPkg, setToPkg] = useState<LogicBlockPackage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<CompareView>('visual')
  const [upgradeBusy, setUpgradeBusy] = useState(false)

  useEffect(() => {
    setFromVersion(fromVersionProp)
    setToVersion(toVersionProp)
  }, [fromVersionProp, toVersionProp, packageId])

  useEffect(() => {
    void api
      .listLogicBlockVersions(packageId)
      .then((res) => {
        const list = res.versions.map((v) => v.version)
        list.sort((a, b) => compareSemver(b, a))
        setVersions(list)
      })
      .catch(() => setVersions([]))
  }, [packageId])

  useEffect(() => {
    if (versions.length === 0) return
    if (fromVersionProp !== toVersionProp) return
    const latest = versions[0]
    if (latest && latest !== fromVersion) setToVersion(latest)
  }, [versions, fromVersionProp, toVersionProp, fromVersion])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const [fromRes, toRes] = await Promise.all([
          api.getLogicBlock(packageId, fromVersion),
          api.getLogicBlock(packageId, toVersion),
        ])
        if (cancelled) return
        setFromPkg(fromRes.package)
        setToPkg(toRes.package)
      } catch (e) {
        if (cancelled) return
        setFromPkg(null)
        setToPkg(null)
        setError(e instanceof Error ? e.message : 'Failed to load versions')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [packageId, fromVersion, toVersion])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const fromJson = useMemo(() => (fromPkg ? packageRootJson(fromPkg) : ''), [fromPkg])
  const toJson = useMemo(() => (toPkg ? packageRootJson(toPkg) : ''), [toPkg])
  const lines = useMemo(
    () => (fromJson && toJson ? diffLines(fromJson, toJson) : []),
    [fromJson, toJson],
  )

  const label = title ?? fromPkg?.name ?? toPkg?.name ?? 'Logic block'
  const versionOptions = useMemo(() => {
    const set = new Set(versions)
    if (fromVersion) set.add(fromVersion)
    if (toVersion) set.add(toVersion)
    return [...set].sort((a, b) => compareSemver(b, a))
  }, [versions, fromVersion, toVersion])

  const handleUpgrade = useCallback(async () => {
    if (!onUpgrade) return
    setUpgradeBusy(true)
    try {
      await onUpgrade(toVersion)
      onClose()
    } finally {
      setUpgradeBusy(false)
    }
  }, [onClose, onUpgrade, toVersion])

  const swapVersions = () => {
    setFromVersion(toVersion)
    setToVersion(fromVersion)
  }

  return (
    <div
      className="l2-visual-fullscreen l2-visual-fullscreen--nested l2-logic-block-version-compare"
      role="dialog"
      aria-modal="true"
      aria-label={`Compare ${label}`}
    >
      <header className="l2-visual-toolbar">
        <div className="l2-visual-toolbar-left">
          <h2>{label}</h2>
          <span className="l2-visual-toolbar-sub">Compare versions · read-only</span>
          <div className="l2-logic-block-compare-pickers">
            <label className="l2-logic-block-compare-picker">
              From
              <select
                value={fromVersion}
                disabled={loading}
                onChange={(e) => setFromVersion(e.target.value)}
              >
                {versionOptions.map((v) => (
                  <option key={`from-${v}`} value={v}>
                    v{v}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-sm l2-logic-block-compare-swap"
              title="Swap versions"
              onClick={swapVersions}
            >
              ⇄
            </button>
            <label className="l2-logic-block-compare-picker">
              To
              <select
                value={toVersion}
                disabled={loading}
                onChange={(e) => setToVersion(e.target.value)}
              >
                {versionOptions.map((v) => (
                  <option key={`to-${v}`} value={v}>
                    v{v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="l2-logic-block-preview-view-toggle" role="tablist" aria-label="Compare view">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'visual'}
              className={`l2-logic-block-preview-view-btn${view === 'visual' ? ' is-active' : ''}`}
              onClick={() => setView('visual')}
            >
              Visual
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'json'}
              className={`l2-logic-block-preview-view-btn${view === 'json' ? ' is-active' : ''}`}
              onClick={() => setView('json')}
            >
              JSON
            </button>
          </div>
        </div>
        <div className="l2-visual-toolbar-actions">
          {onUpgrade ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={upgradeBusy || loading || fromVersion === toVersion}
              onClick={() => void handleUpgrade()}
            >
              {upgradeBusy ? 'Upgrading…' : `Upgrade to v${toVersion}`}
            </button>
          ) : null}
          <span className="l2-visual-hint" title="Keyboard shortcuts">
            Esc
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </header>

      <p className="l2-visual-canvas-hint" aria-hidden="true">
        {view === 'visual'
          ? `Side-by-side visual logic · v${fromVersion} (left) vs v${toVersion} (right)`
          : `JSON diff of packaged root · removed = from v${fromVersion}, added = to v${toVersion}`}
      </p>

      <main className="l2-visual-main l2-logic-block-compare-main">
        {error ? (
          <p className="field-error l2-logic-block-inner-preview-status">{error}</p>
        ) : loading || !fromPkg || !toPkg ? (
          <p className="l2-logic-block-inner-preview-status">Loading versions…</p>
        ) : view === 'visual' ? (
          <div className="l2-logic-block-compare-visual">
            <section className="l2-logic-block-compare-pane">
              <header className="l2-logic-block-compare-pane-head">v{fromPkg.version}</header>
              <LogicBlockReadonlyCanvas
                pkg={fromPkg}
                instanceId={`compare-from-${fromPkg.id}-${fromPkg.version}`}
                className="l2-logic-block-compare-canvas"
              />
            </section>
            <section className="l2-logic-block-compare-pane">
              <header className="l2-logic-block-compare-pane-head">v{toPkg.version}</header>
              <LogicBlockReadonlyCanvas
                pkg={toPkg}
                instanceId={`compare-to-${toPkg.id}-${toPkg.version}`}
                className="l2-logic-block-compare-canvas"
              />
            </section>
          </div>
        ) : (
          <div className="l2-logic-block-compare-json">
            <div className="l2-logic-block-compare-json-legend" aria-hidden="true">
              <span className="l2-logic-block-diff-line is-remove">− removed (from)</span>
              <span className="l2-logic-block-diff-line is-add">+ added (to)</span>
            </div>
            <pre className="l2-logic-block-compare-json-pre mono" tabIndex={0}>
              {lines.map((line, idx) => (
                <div
                  key={`${line.kind}-${idx}`}
                  className={`l2-logic-block-diff-line is-${line.kind}`}
                >
                  <span className="l2-logic-block-diff-gutter">
                    {line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '}
                  </span>
                  <span className="l2-logic-block-diff-text">{line.text}</span>
                </div>
              ))}
            </pre>
          </div>
        )}
      </main>

      <div className="l2-visual-mobile-bar">
        <button
          type="button"
          className={view === 'visual' ? 'active' : undefined}
          onClick={() => setView('visual')}
        >
          Visual
        </button>
        <button
          type="button"
          className={view === 'json' ? 'active' : undefined}
          onClick={() => setView('json')}
        >
          JSON
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
