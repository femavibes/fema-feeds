import { useCallback, useEffect, useState } from 'react'
import type { FeedConfig, LogicBlockUpgradeHint } from '@cfb/core-types'

import { api } from '../../api/client'

interface Props {
  feedId: string
  onUpgraded: (result: {
    feed: FeedConfig
    live: FeedConfig
    hasUnpublishedDraft: boolean
  }) => void
  onNotify?: (message: string | null, error: string | null) => void
}

function policyHint(policy: LogicBlockUpgradeHint['updatePolicy'], patchUpgrade: boolean) {
  if (policy === 'auto_minor' && patchUpgrade) {
    return 'Eval already uses the latest patch (auto minor). Upgrade the feed pin to match.'
  }
  if (policy === 'notify') return 'Notify policy — upgrade when you are ready.'
  return 'Pinned — upgrade to use the newer version in this feed.'
}

export function FeedLogicBlockUpgradesPanel({ feedId, onUpgraded, onNotify }: Props) {
  const [upgrades, setUpgrades] = useState<LogicBlockUpgradeHint[]>([])
  const [loading, setLoading] = useState(true)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())

  const load = useCallback(() => {
    setLoading(true)
    void api
      .listFeedLogicBlockUpgrades(feedId)
      .then((res) => setUpgrades(res.upgrades))
      .catch(() => setUpgrades([]))
      .finally(() => setLoading(false))
  }, [feedId])

  useEffect(() => {
    load()
  }, [load])

  const applyOne = async (hint: LogicBlockUpgradeHint) => {
    setBusyIds((prev) => new Set(prev).add(hint.nodeId))
    onNotify?.(null, null)
    try {
      const res = await api.applyFeedLogicBlockUpgrades(feedId, [hint.nodeId])
      onUpgraded({
        feed: res.feed,
        live: res.live,
        hasUnpublishedDraft: res.hasUnpublishedDraft,
      })
      setUpgrades((prev) => prev.filter((u) => u.nodeId !== hint.nodeId))
      onNotify?.(
        `Updated ${hint.packageName} to v${hint.latestVersion} in feed rules`,
        null,
      )
    } catch (e) {
      onNotify?.(null, e instanceof Error ? e.message : 'Upgrade failed')
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(hint.nodeId)
        return next
      })
    }
  }

  const applyAll = async () => {
    if (upgrades.length === 0) return
    const ids = upgrades.map((u) => u.nodeId)
    setBusyIds(new Set(ids))
    onNotify?.(null, null)
    try {
      const res = await api.applyFeedLogicBlockUpgrades(feedId, ids)
      onUpgraded({
        feed: res.feed,
        live: res.live,
        hasUnpublishedDraft: res.hasUnpublishedDraft,
      })
      setUpgrades([])
      onNotify?.(`Updated ${res.applied.length} logic block pin(s) in feed rules`, null)
    } catch (e) {
      onNotify?.(null, e instanceof Error ? e.message : 'Upgrade failed')
      load()
    } finally {
      setBusyIds(new Set())
    }
  }

  if (loading || upgrades.length === 0) return null

  return (
    <section className="feed-logic-upgrades" aria-label="Logic block updates">
      <div className="feed-logic-upgrades-head">
        <h3>Logic block updates available</h3>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busyIds.size > 0}
          onClick={() => void applyAll()}
        >
          Upgrade all ({upgrades.length})
        </button>
      </div>
      <ul className="feed-logic-upgrades-list">
        {upgrades.map((hint) => {
          const label = hint.label ?? hint.packageName
          const busy = busyIds.has(hint.nodeId)
          return (
            <li key={hint.nodeId} className="feed-logic-upgrades-item">
              <div className="feed-logic-upgrades-meta">
                <span className="feed-logic-upgrades-name">{label}</span>
                <span className="feed-logic-upgrades-sub">
                  v{hint.pinnedVersion} → v{hint.latestVersion} · {hint.updatePolicy}
                </span>
                <span className="card-hint">{policyHint(hint.updatePolicy, hint.patchUpgrade)}</span>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() => void applyOne(hint)}
              >
                {busy ? 'Upgrading…' : `Upgrade to v${hint.latestVersion}`}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
