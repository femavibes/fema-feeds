import { useCallback, useMemo, useRef, useState } from 'react'

import type { FeedConfig, ProjectL1Config } from '@cfb/core-types'

import { api } from '../../api/client'

import { prepareFeedDraftPayload } from '../../lib/feed-draft'
import { FeedRebuildProgress } from './FeedRebuildProgress'

type VersionFilter = 'all' | 'named' | 'live'

type VersionRow = {
  version: number
  createdAt: string
  createdByDid: string | null
  label: string | null
  kind: 'live' | 'milestone'
}

interface Props {
  feedDraft: FeedConfig
  liveFeed: FeedConfig | null
  hasUnpublishedDraft: boolean
  busy: boolean
  onBusyChange: (busy: boolean) => void
  onFeedChange: (next: FeedConfig) => void
  onLiveUpdated: (live: FeedConfig, hasUnpublishedDraft: boolean, project?: ProjectL1Config) => void
  onNotify: (message: string | null, error: string | null) => void
  layout?: 'bar' | 'sidebar'
}

export function FeedActionsBar({
  feedDraft,
  liveFeed,
  hasUnpublishedDraft,
  busy,
  onBusyChange,
  onFeedChange,
  onLiveUpdated,
  onNotify,
  layout = 'bar',
}: Props) {
  const [versionBusy, setVersionBusy] = useState(false)
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [showVersions, setShowVersions] = useState(false)
  const [versionFilter, setVersionFilter] = useState<VersionFilter>('all')
  const [versionHelpOpen, setVersionHelpOpen] = useState(false)
  const [namingVersion, setNamingVersion] = useState<number | null>(null)
  const [namingLabel, setNamingLabel] = useState('')
  const [localBusy, setLocalBusy] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  const updateLiveRef = useRef(false)

  const handleRebuildComplete = useCallback((matched: number) => {
    setRebuilding(false)
    onNotify(`Rebuild complete — ${matched} post${matched !== 1 ? 's' : ''} match feed rules`, null)
  }, [onNotify])

  const namedCount = useMemo(() => versions.filter((v) => v.label).length, [versions])
  const liveCount = useMemo(() => versions.filter((v) => v.kind === 'live').length, [versions])

  const filteredVersions = useMemo(() => {
    if (versionFilter === 'named') return versions.filter((v) => v.label)
    if (versionFilter === 'live') return versions.filter((v) => v.kind === 'live')
    return versions
  }, [versionFilter, versions])

  const refreshVersions = async () => {
    const res = await api.listFeedVersions(feedDraft.feedId)
    setVersions(res.versions)
    return res.versions
  }

  const updateLive = () => {
    if (updateLiveRef.current) return
    updateLiveRef.current = true
    setLocalBusy(true)
    onBusyChange(true)
    onNotify(null, null)
    api.updateFeed(prepareFeedDraftPayload(feedDraft)).then(
      async (res) => {
        onFeedChange(structuredClone(res.feed))
        onLiveUpdated(res.live, res.hasUnpublishedDraft, res.project)
        onNotify('Live rules updated — rebuilding candidates…', null)
        setRebuilding(true)
        if (showVersions) await refreshVersions()
        updateLiveRef.current = false
        setLocalBusy(false)
        onBusyChange(false)
      },
      (e) => {
        onNotify(null, e instanceof Error ? e.message : 'Update failed')
        updateLiveRef.current = false
        setLocalBusy(false)
        onBusyChange(false)
      },
    )
  }

  const loadVersions = async (filter: VersionFilter = versionFilter) => {
    setVersionBusy(true)
    try {
      await refreshVersions()
      setVersionFilter(filter)
      setShowVersions(true)
    } catch (e) {
      onNotify(null, e instanceof Error ? e.message : 'Failed to load versions')
    } finally {
      setVersionBusy(false)
    }
  }

  const restoreVersion = async (version: number) => {
    setVersionBusy(true)
    onNotify(null, null)
    try {
      const res = await api.restoreFeedVersion(feedDraft.feedId, version)
      onFeedChange(structuredClone(res.feed))
      onLiveUpdated(res.live, res.hasUnpublishedDraft)
      onNotify(`Restored v${version} into draft — click Update Live to publish`, null)
    } catch (e) {
      onNotify(null, e instanceof Error ? e.message : 'Restore failed')
    } finally {
      setVersionBusy(false)
    }
  }

  const bookmarkDraft = async () => {
    setVersionBusy(true)
    onNotify(null, null)
    try {
      const res = await api.saveFeedMilestone(feedDraft.feedId)
      await refreshVersions()
      setShowVersions(true)
      onNotify(`Bookmarked draft as v${res.version} — add a name when you are ready`, null)
    } catch (e) {
      onNotify(null, e instanceof Error ? e.message : 'Failed to bookmark draft')
    } finally {
      setVersionBusy(false)
    }
  }

  const startNaming = (v: VersionRow) => {
    setNamingVersion(v.version)
    setNamingLabel(v.label ?? '')
  }

  const cancelNaming = () => {
    setNamingVersion(null)
    setNamingLabel('')
  }

  const saveName = async () => {
    if (namingVersion == null) return
    const label = namingLabel.trim()
    if (!label) {
      onNotify(null, 'Enter a name')
      return
    }
    setVersionBusy(true)
    onNotify(null, null)
    try {
      await api.labelFeedVersion(feedDraft.feedId, namingVersion, label)
      await refreshVersions()
      cancelNaming()
      onNotify(`Named v${namingVersion} — “${label}”`, null)
    } catch (e) {
      onNotify(null, e instanceof Error ? e.message : 'Failed to name version')
    } finally {
      setVersionBusy(false)
    }
  }

  const versionTitle = (v: VersionRow) => {
    if (v.label) return v.label
    if (v.kind === 'live') return `Live snapshot v${v.version}`
    return `Draft bookmark v${v.version}`
  }

  const isLive = Boolean(liveFeed?.enabled)
  const isPublished = Boolean(liveFeed?.published)

  return (
    <div className={`feed-actions${layout === 'sidebar' ? ' feed-actions-sidebar' : ''}`}>
      <div className="feed-status-badges">
        {hasUnpublishedDraft && <span className="badge badge-warn">Draft changes</span>}
        {isLive ? (
          <span className="badge badge-on">Live rules</span>
        ) : (
          <span className="badge badge-off">Not live</span>
        )}
        {isPublished ? (
          <span className="badge badge-on">Published</span>
        ) : (
          <span className="badge badge-muted">Unpublished</span>
        )}
      </div>

      <div className="main-actions feed-actions-row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || localBusy}
          onClick={() => updateLive()}
          title="Make draft rules live and rebuild the candidate list from the L1 pool"
        >
          {busy || localBusy ? 'Updating…' : 'Update Live'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={versionBusy}
          onClick={() => void loadVersions('all')}
        >
          Version history
        </button>
      </div>

      {rebuilding ? (
        <FeedRebuildProgress
          feedId={feedDraft.feedId}
          onComplete={handleRebuildComplete}
        />
      ) : null}

      {showVersions && (
        <div className={`feed-versions card${layout === 'sidebar' ? ' feed-versions-sidebar' : ''}`}>
          <div className="feed-versions-head">
            <h4>Version history</h4>
            <button
              type="button"
              className="feed-versions-help-link"
              onClick={() => setVersionHelpOpen((open) => !open)}
              aria-expanded={versionHelpOpen}
            >
              {versionHelpOpen ? 'Hide' : 'How it works'}
            </button>
          </div>

          {versionHelpOpen ? (
            <div className="feed-versions-help">
              <p>
                <strong>Update Live</strong> adds a live snapshot. <strong>Bookmark draft</strong>{' '}
                saves your current draft without going live. Use <strong>Name</strong> on any entry to
                label it — named versions show under the Named tab.
              </p>
            </div>
          ) : null}

          <div className="feed-versions-toolbar">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={versionBusy}
              onClick={() => void bookmarkDraft()}
            >
              Bookmark draft
            </button>
          </div>

          <div className="feed-version-segment" role="tablist" aria-label="Version filters">
            <button
              type="button"
              role="tab"
              aria-selected={versionFilter === 'all'}
              className={`feed-version-segment-btn${versionFilter === 'all' ? ' active' : ''}`}
              onClick={() => setVersionFilter('all')}
            >
              <span className="feed-version-segment-label">All</span>
              <span className="feed-version-segment-count">{versions.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={versionFilter === 'named'}
              className={`feed-version-segment-btn${versionFilter === 'named' ? ' active' : ''}`}
              onClick={() => setVersionFilter('named')}
            >
              <span className="feed-version-segment-label">Named</span>
              <span className="feed-version-segment-count">{namedCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={versionFilter === 'live'}
              className={`feed-version-segment-btn${versionFilter === 'live' ? ' active' : ''}`}
              onClick={() => setVersionFilter('live')}
            >
              <span className="feed-version-segment-label">Live</span>
              <span className="feed-version-segment-count">{liveCount}</span>
            </button>
          </div>

          {filteredVersions.length === 0 ? (
            <p className="card-hint feed-versions-empty">
              {versionFilter === 'named'
                ? 'No named versions yet.'
                : versionFilter === 'live'
                  ? 'No live snapshots yet.'
                  : 'No versions yet.'}
            </p>
          ) : (
            <ul className="feed-version-list">
              {filteredVersions.map((v) => (
                <li key={v.version} className="feed-version-item">
                  {namingVersion === v.version ? (
                    <div className="feed-version-name-form">
                      <input
                        className="feed-milestone-input"
                        type="text"
                        value={namingLabel}
                        placeholder="Version name"
                        maxLength={120}
                        autoFocus
                        disabled={versionBusy}
                        onChange={(e) => setNamingLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void saveName()
                          if (e.key === 'Escape') cancelNaming()
                        }}
                      />
                      <div className="feed-version-item-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={versionBusy || !namingLabel.trim()}
                          onClick={() => void saveName()}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={versionBusy}
                          onClick={cancelNaming}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="feed-version-meta">
                        <span className="feed-version-title">{versionTitle(v)}</span>
                        <span className="feed-version-sub">
                          v{v.version} · {new Date(v.createdAt).toLocaleString()} ·{' '}
                          {v.kind === 'live' ? 'Live' : 'Draft'}
                        </span>
                      </div>
                      <div className="feed-version-item-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={versionBusy}
                          onClick={() => startNaming(v)}
                        >
                          {v.label ? 'Rename' : 'Name'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={versionBusy}
                          onClick={() => void restoreVersion(v.version)}
                        >
                          Restore
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowVersions(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  )
}
