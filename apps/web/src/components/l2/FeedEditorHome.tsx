import { useCallback, useEffect, useState } from 'react'

import type { FeedConfig } from '@cfb/core-types'
import { countImportableConditions, enumeratePathsStartToEnd } from '@cfb/l2-graph'

import { api, type FeedPublishInfo } from '../../api/client'
import { copyFeedLogicJson, downloadFeedLogicJson } from '../../lib/feed-graph-exchange'

interface Props {
  draft: FeedConfig
}

async function fetchBlueskySaves(feedUri: string | null): Promise<number | null> {
  if (!feedUri) return null
  try {
    const res = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getFeedGenerator?feed=${encodeURIComponent(feedUri)}`,
    )
    if (!res.ok) return null
    const data = (await res.json()) as { view?: { likeCount?: number } }
    return data.view?.likeCount ?? null
  } catch {
    return null
  }
}

function formatCount(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString()
}

function publishStatusLabel(info: FeedPublishInfo | null): string {
  if (!info) return '—'
  if (info.blueskyLive) return 'Live on Bluesky'
  if (info.readyToPublish) return 'Ready to publish'
  if (info.published) return 'Published locally'
  return 'Draft'
}

export function FeedEditorHome({ draft }: Props) {
  const edges = draft.visualLayout?.edges ?? []
  const filterCount = countImportableConditions(draft.match)
  const routeCount =
    edges.length > 0
      ? enumeratePathsStartToEnd(edges.map((e) => ({ source: e.source, target: e.target }))).filter(
          (path) => path.length > 0,
        ).length
      : 0
  const hasRules = filterCount > 0 && routeCount > 0

  const [publishInfo, setPublishInfo] = useState<FeedPublishInfo | null>(null)
  const [saves, setSaves] = useState<number | null>(null)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [exportMsg, setExportMsg] = useState<string | null>(null)

  const refreshStats = useCallback(() => {
    setStatsError(null)
    return api
      .feedPublishInfo(draft.feedId)
      .then(async (info) => {
        setPublishInfo(info)
        setSaves(await fetchBlueskySaves(info.feedUri))
      })
      .catch((e) => {
        setStatsError(e instanceof Error ? e.message : 'Failed to load feed stats')
      })
  }, [draft.feedId])

  useEffect(() => {
    void refreshStats()
  }, [refreshStats, filterCount, routeCount])

  const flashExport = (msg: string) => {
    setExportMsg(msg)
    window.setTimeout(() => setExportMsg(null), 2200)
  }

  const handleExportGraph = async () => {
    const result = await copyFeedLogicJson(draft)
    flashExport(result === 'ok' ? 'Graph copied to clipboard' : 'Could not copy — try Download graph')
  }

  const handleDownloadGraph = () => {
    downloadFeedLogicJson(draft, draft.feedId)
    flashExport('Graph downloaded')
  }

  return (
    <div className="feed-editor-home workspace-page">
      <header className="workspace-context-head">
        <div className="workspace-context-head-row">
          <h2>Overview</h2>
          {hasRules ? (
            <span className="badge badge-on">
              {filterCount} filters · {routeCount} routes
            </span>
          ) : (
            <span className="badge badge-muted">No rules yet</span>
          )}
        </div>
        <p className="card-hint">
          <strong>{draft.name}</strong> — posts from your ingestion pool that match your rules.
          Use the workspace menu for editors and sorting; use <strong>Update</strong> to go live.
        </p>
      </header>

      <section className="feed-editor-section">
        <div className="feed-editor-section-head">
          <h3 className="feed-editor-section-title">Stats</h3>
          <div className="feed-editor-section-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void handleExportGraph()}
            >
              Copy graph JSON
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleDownloadGraph}>
              Download graph
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void refreshStats()}>
              Refresh
            </button>
          </div>
        </div>
        {exportMsg ? <p className="feed-editor-export-msg">{exportMsg}</p> : null}

        <div className="feed-overview-stats">
          <div className="feed-overview-stat-card">
            <span className="feed-overview-stat-value">{formatCount(publishInfo?.candidateCount)}</span>
            <span className="feed-overview-stat-label">Candidates</span>
            <span className="feed-overview-stat-hint">Posts matching your rules</span>
          </div>
          <div className="feed-overview-stat-card">
            <span className="feed-overview-stat-value">{formatCount(saves)}</span>
            <span className="feed-overview-stat-label">Saves on Bluesky</span>
            <span className="feed-overview-stat-hint">People who saved this feed</span>
          </div>
          <div
            className="feed-overview-stat-card"
            title="Bluesky does not expose daily viewers for custom feeds"
          >
            <span className="feed-overview-stat-value feed-overview-stat-muted">—</span>
            <span className="feed-overview-stat-label">Daily viewers</span>
            <span className="feed-overview-stat-hint">Not reported by Bluesky</span>
          </div>
          <div className="feed-overview-stat-card">
            <span
              className={`feed-overview-stat-value feed-overview-stat-status${
                publishInfo?.blueskyLive ? ' is-live' : ''
              }`}
            >
              {publishStatusLabel(publishInfo)}
            </span>
            <span className="feed-overview-stat-label">Publish status</span>
            <span className="feed-overview-stat-hint">
              {publishInfo?.enabled === false ? 'Feed disabled' : 'From publish checklist'}
            </span>
          </div>
        </div>

        {statsError ? <p className="field-error feed-editor-stats-error">{statsError}</p> : null}
      </section>

      <details className="feed-rules-how">
        <summary>How filters and routes work</summary>
        <div className="feed-rules-how-body">
          <p>
            Every post in your ingestion pool is checked against your rules. A post lands in the feed
            when it matches <strong>any</strong> complete route to FEED.
          </p>
          <ul>
            <li>
              <strong>Filter</strong> — one condition (keyword, author, likes, label, etc.). All
              filters on the same path must pass.
            </li>
            <li>
              <strong>Route</strong> — a path from START through one or more filters to FEED. Filters
              on that path are <strong>AND</strong>.
            </li>
            <li>
              <strong>Multiple routes</strong> — <strong>OR</strong>. Match route A or route B and
              the post is in.
            </li>
          </ul>
          <p className="feed-rules-how-example">
            Example: Route 1 — keyword &ldquo;urbanism&rdquo; AND has image. Route 2 — author on your
            allowlist. A post matching either route is included.
          </p>
          <pre className="feed-rules-how-diagram" aria-hidden="true">
            {`START → [filter] → [filter] → FEED   ← one route (AND)
START → [filter] ─────────────→ FEED   ← another route (OR)`}
          </pre>
        </div>
      </details>

      {!hasRules && (
        <p className="card-hint feed-editor-empty">
          Open the <strong>Visual editor</strong> from the workspace menu to add filters and connect
          paths to FEED.
        </p>
      )}
    </div>
  )
}
