import { useEffect, useMemo, useState } from 'react'
import { api, type BlueskyGeneratorEntry } from '../../api/client'
import { feedUriToBskyUrl } from '../../lib/bsky-url'
import { ConfirmModal } from '../ConfirmModal'

interface Props {
  onClose: () => void
}

const KNOWN_SERVICES: { key: string; label: string; didPrefixes: string[]; didSuffix?: string }[] = [
  { key: 'graze', label: 'Graze', didPrefixes: ['did:web:graze.social', 'did:web:api.graze.social', 'did:web:beta.graze.social'] },
  { key: 'skyfeed', label: 'Skyfeed', didPrefixes: ['did:web:skyfeed.app', 'did:web:skyfeed.me'] },
  { key: 'attie', label: 'Attie', didPrefixes: ['did:web:attie.ai'] },
  { key: 'opentrough', label: 'OpenTrough', didPrefixes: [], didSuffix: '.opentrough.com' },
  { key: 'blueskyfeeds', label: 'BlueSky Feeds', didPrefixes: ['did:web:blueskyfeeds.com'] },
]

type TabKey = 'graze' | 'skyfeed' | 'attie' | 'opentrough' | 'blueskyfeeds' | 'external' | 'deployment' | 'more'

export function BlueskyFeedsModal({ onClose }: Props) {
  const [generators, setGenerators] = useState<BlueskyGeneratorEntry[]>([])
  const [serviceDid, setServiceDid] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BlueskyGeneratorEntry | null>(null)
  const [deleteConfirmStep, setDeleteConfirmStep] = useState<1 | 2>(1)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    api.listBlueskyGenerators()
      .then((res) => {
        setGenerators(res.generators)
        setServiceDid(res.serviceDid)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const grouped = useMemo(() => {
    const result: Record<TabKey, BlueskyGeneratorEntry[]> = {
      graze: [],
      skyfeed: [],
      attie: [],
      opentrough: [],
      blueskyfeeds: [],
      external: [],
      deployment: [],
      more: [],
    }
    for (const g of generators) {
      if (g.isOwnDeployment) {
        result.deployment.push(g)
      } else if (g.isOwnService) {
        result.more.push(g)
      } else {
        const known = KNOWN_SERVICES.find((s) =>
          s.didPrefixes.includes(g.did) ||
          (s.didSuffix && g.did.startsWith('did:web:') && g.did.slice(8).endsWith(s.didSuffix))
        )
        if (known) {
          result[known.key as TabKey].push(g)
        } else {
          result.external.push(g)
        }
      }
    }
    return result
  }, [generators])

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'graze', label: 'Graze' },
    { key: 'skyfeed', label: 'Skyfeed' },
    { key: 'attie', label: 'Attie' },
    { key: 'opentrough', label: 'OpenTrough' },
    { key: 'blueskyfeeds', label: 'BlueSky Feeds' },
    { key: 'external', label: 'External' },
    { key: 'deployment', label: 'This Deployment' },
    { key: 'more', label: 'More' },
  ]

  // Auto-select first non-empty tab
  const visibleTabs = tabs.filter((t) => grouped[t.key].length > 0)
  const selectedTab = activeTab && grouped[activeTab]?.length ? activeTab : visibleTabs[0]?.key ?? 'deployment'
  const currentList = grouped[selectedTab] ?? []

  function startDelete(g: BlueskyGeneratorEntry) {
    setDeleteTarget(g)
    setDeleteConfirmStep(1)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.deleteBlueskyGenerator(deleteTarget.rkey)
      setGenerators((prev) => prev.filter((g) => g.rkey !== deleteTarget.rkey))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog bluesky-feeds-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Bluesky Feed Generators</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="modal-body">
          <p className="card-hint">
            All feed generator records published under your DID.
            {serviceDid && (
              <> Service DID: <code className="bluesky-feeds-service-did">{serviceDid}</code></>
            )}
          </p>

          {loading && <p className="card-hint">Loading…</p>}
          {error && <p className="field-error">{error}</p>}

          {!loading && !error && generators.length === 0 && (
            <p className="card-hint">No feed generators found under your DID.</p>
          )}

          {!loading && generators.length > 0 && (
            <>
              <div className="bluesky-feeds-tabs">
                {tabs.map((t) => {
                  const count = grouped[t.key].length
                  if (count === 0) return null
                  return (
                    <button
                      key={t.key}
                      type="button"
                      className={`bluesky-feeds-tab ${selectedTab === t.key ? 'active' : ''}`}
                      onClick={() => setActiveTab(t.key)}
                    >
                      {t.label} <span className="bluesky-feeds-tab-count">{count}</span>
                    </button>
                  )
                })}
              </div>

              {currentList.length === 0 ? (
                <p className="card-hint">No feeds in this category.</p>
              ) : (
                <ul className="bluesky-feeds-list">
                  {currentList.map((g) => {
                    const bskyUrl = feedUriToBskyUrl(g.uri)
                    return (
                      <li key={g.rkey} className="bluesky-feeds-item">
                        <div className="bluesky-feeds-item-main">
                          <span className="bluesky-feeds-item-name">{g.displayName}</span>
                          <code className="bluesky-feeds-item-rkey">{g.rkey}</code>
                        </div>
                        <div className="bluesky-feeds-item-meta">
                          {selectedTab === 'more' && (
                            <span className="badge badge-muted" title="Points to your service DID but not managed by this deployment">
                              Unmanaged
                            </span>
                          )}
                          {selectedTab === 'external' && g.did && (
                            <span className="bluesky-feeds-item-service" title={g.did}>
                              {g.did.length > 30 ? `${g.did.slice(0, 28)}…` : g.did}
                            </span>
                          )}
                          {bskyUrl && (
                            <a
                              href={bskyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bluesky-feeds-item-link"
                            >
                              View ↗
                            </a>
                          )}
                        </div>
                        {g.description && (
                          <p className="bluesky-feeds-item-desc">{g.description}</p>
                        )}
                        <div className="bluesky-feeds-item-actions">
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => startDelete(g)}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        {deleteTarget && deleteConfirmStep === 1 && (
          <ConfirmModal
            title="Delete Feed Generator"
            message={
              <>
                <p>Delete <strong>{deleteTarget.displayName}</strong> (<code>{deleteTarget.rkey}</code>) from your Bluesky account?</p>
                <p>This removes the feed generator record permanently. Anyone subscribed to this feed will lose access.</p>
              </>
            }
            confirmLabel="Continue"
            confirmDanger
            onConfirm={() => setDeleteConfirmStep(2)}
            onCancel={() => setDeleteTarget(null)}
          />
        )}

        {deleteTarget && deleteConfirmStep === 2 && (
          <ConfirmModal
            title="Are you absolutely sure?"
            message={
              <>
                <p>This action <strong>cannot be undone</strong>. The record for <code>{deleteTarget.rkey}</code> will be permanently deleted from your AT Protocol repo.</p>
                {deleteTarget.did && deleteTarget.did !== serviceDid && (
                  <p style={{ color: 'var(--color-warning, #e6a700)' }}>
                    ⚠️ This feed points to an external service (<code>{deleteTarget.did}</code>). You may not be able to recreate it.
                  </p>
                )}
              </>
            }
            confirmLabel={deleting ? 'Deleting…' : 'Yes, delete permanently'}
            confirmDanger
            onConfirm={confirmDelete}
            onCancel={() => setDeleteTarget(null)}
          />
        )}

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
