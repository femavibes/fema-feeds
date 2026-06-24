import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { api, type FeedPublishInfo } from '../../api/client'
import { feedUriToBskyUrl } from '../../lib/bsky-url'
import { SkeletonPreviewDialog } from './SkeletonPreviewDialog'

interface Props {
  feedId: string
  livePublished: boolean
  onOpenPublishingSettings?: () => void
  onPublishStateChange?: (published: boolean) => void
  layout?: 'panel' | 'sidebar'
}

function feedSlugFromUri(atUri: string): string | null {
  const m = atUri.match(/\/app\.bsky\.feed\.generator\/([^/]+)$/i)
  return m?.[1] ?? null
}

function statusHeadline(info: FeedPublishInfo): { text: string; tone: 'warn' | 'pending' } | null {
  if (info.blueskyLive) return null

  if (info.readyToPublish) {
    return {
      text: 'Ready to publish — click Publish feed above',
      tone: 'warn',
    }
  }

  if (info.published) {
    return {
      text: 'Marked published locally — finish the checklist, then Publish again for Bluesky',
      tone: 'warn',
    }
  }

  return { text: 'Complete the checklist below before publishing', tone: 'pending' }
}

function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M9.5 2.5H11.5V4.5M6.5 7.5L11 3M5.5 3H3.5C2.95 3 2.5 3.45 2.5 4V10.5C2.5 11.05 2.95 11.5 3.5 11.5H10C10.55 11.5 11 11.05 11 10.5V8.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2.5 4h9M2.5 7h9M2.5 10h6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

interface PublishLinkRowProps {
  href: string
  icon: ReactNode
  label: string
  detail?: string
  title?: string
}

function PublishLinkRow({ href, icon, label, detail, title }: PublishLinkRowProps) {
  return (
    <a
      className="l2-publish-link-row"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title ?? href}
    >
      <span className="l2-publish-link-icon">{icon}</span>
      <span className="l2-publish-link-body">
        <span className="l2-publish-link-label">{label}</span>
        {detail ? <span className="l2-publish-link-detail">{detail}</span> : null}
      </span>
      <span className="l2-publish-link-chevron" aria-hidden>
        ↗
      </span>
    </a>
  )
}

interface PublishActionRowProps {
  onClick: () => void
  icon: ReactNode
  label: string
  detail?: string
  title?: string
}

function PublishActionRow({ onClick, icon, label, detail, title }: PublishActionRowProps) {
  return (
    <button
      type="button"
      className="l2-publish-link-row"
      onClick={onClick}
      title={title}
    >
      <span className="l2-publish-link-icon">{icon}</span>
      <span className="l2-publish-link-body">
        <span className="l2-publish-link-label">{label}</span>
        {detail ? <span className="l2-publish-link-detail">{detail}</span> : null}
      </span>
      <span className="l2-publish-link-chevron" aria-hidden>
        ›
      </span>
    </button>
  )
}

export function FeedPublishPanel({
  feedId,
  livePublished,
  onOpenPublishingSettings,
  onPublishStateChange,
  layout = 'panel',
}: Props) {
  const [info, setInfo] = useState<FeedPublishInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [appPassword, setAppPassword] = useState('')
  const [needsAppPassword, setNeedsAppPassword] = useState(false)
  const [skeletonPreviewOpen, setSkeletonPreviewOpen] = useState(false)

  const refresh = useCallback(() => {
    setError(null)
    return api
      .feedPublishInfo(feedId)
      .then((res) => {
        setInfo(res)
        setNeedsAppPassword(
          Boolean(res.readyToPublish && !res.blueskyLive && !res.blueskySessionReady),
        )
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load publish info')
      })
  }, [feedId])

  useEffect(() => {
    void refresh()
  }, [refresh, livePublished])

  const publish = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.publishFeed(feedId, appPassword.trim() ? { appPassword: appPassword.trim() } : undefined)
      onPublishStateChange?.(true)
      setAppPassword('')
      await refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Publish failed'
      setError(msg)
      if (msg.includes('app password') || msg.includes('session')) {
        setNeedsAppPassword(true)
      }
    } finally {
      setBusy(false)
    }
  }

  const unpublish = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.unpublishFeed(feedId, appPassword.trim() ? { appPassword: appPassword.trim() } : undefined)
      onPublishStateChange?.(false)
      setAppPassword('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unpublish failed')
    } finally {
      setBusy(false)
    }
  }

  const published = info?.published ?? livePublished
  const headline = info ? statusHeadline(info) : null
  const showChecklist = info && !info.blueskyLive && !published
  const bskyFeedUrl = info?.feedUri ? feedUriToBskyUrl(info.feedUri) : null
  const feedSlug = info?.feedUri ? feedSlugFromUri(info.feedUri) : null
  const showPublishedLinks = info && published && (bskyFeedUrl || info.skeletonUrl)

  return (
    <section
      className={layout === 'sidebar' ? 'l2-publish-sidebar' : 'card l2-publish'}
    >
      {layout === 'panel' && <h3>Publish</h3>}
      {layout === 'panel' && (
        <p className="card-hint">
          <strong>Update live</strong> applies rules and rebuilds candidates. <strong>Publish</strong>{' '}
          turns on your feedgen service <em>and</em> creates/updates the{' '}
          <code>app.bsky.feed.generator</code> record on Bluesky so the feed appears at{' '}
          <code>bsky.app/profile/your-handle/feed/…</code>.
        </p>
      )}

      {needsAppPassword && (
        <label className="l2-publish-app-password">
          App password (for Bluesky record)
          <input
            type="password"
            value={appPassword}
            disabled={busy}
            onChange={(e) => setAppPassword(e.target.value)}
            placeholder="Only needed if your Bluesky session expired"
            autoComplete="current-password"
          />
        </label>
      )}

      <div className="l2-publish-action-stack">
        {!published ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || (info != null && !info.readyToPublish)}
            onClick={() => void publish()}
            title={
              info && !info.readyToPublish
                ? 'Complete the checklist below first'
                : 'Publish generator record on Bluesky'
            }
          >
            {busy ? 'Publishing…' : 'Publish feed'}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => void unpublish()}
          >
            {busy ? 'Unpublishing…' : 'Unpublish feed'}
          </button>
        )}

        {published && !info?.blueskyLive ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => void publish()}
          >
            {busy ? 'Publishing…' : 'Publish to Bluesky'}
          </button>
        ) : null}

        {onOpenPublishingSettings ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onOpenPublishingSettings}
          >
            Open publishing settings
          </button>
        ) : null}
      </div>

      {error && <p className="field-error">{error}</p>}
      {info && (
        <>
          {headline ? (
            <p
              className={
                headline.tone === 'warn' ? 'l2-publish-warn l2-publish-status' : 'field-error l2-publish-status'
              }
            >
              {headline.text}
            </p>
          ) : null}

          {showChecklist ? (
            <ul className="l2-publish-checklist">
              {info.checklist.map((item) => (
                <li key={item.id} className={item.ok ? 'ok' : 'pending'}>
                  <span>{item.ok ? '✓' : '○'}</span>
                  <span>{item.label}</span>
                  {!item.ok && item.hint ? <span className="hint">{item.hint}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}

          {showPublishedLinks ? (
            <div className="l2-publish-links">
              {bskyFeedUrl ? (
                <PublishLinkRow
                  href={bskyFeedUrl}
                  icon={<ExternalLinkIcon />}
                  label="View feed on Bluesky"
                  detail={feedSlug ?? undefined}
                  title={info.feedUri ?? undefined}
                />
              ) : null}
              {info.skeletonUrl ? (
                <PublishActionRow
                  onClick={() => setSkeletonPreviewOpen(true)}
                  icon={<ListIcon />}
                  label="Test feed skeleton"
                  detail={
                    info.candidateCount != null
                      ? `${info.candidateCount.toLocaleString()} candidates`
                      : 'Preview skeleton posts'
                  }
                  title={`Preview skeleton posts (public JSON: ${info.skeletonUrl})`}
                />
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {skeletonPreviewOpen ? (
        <SkeletonPreviewDialog
          feedId={feedId}
          feedName={info?.name}
          publicSkeletonUrl={info?.skeletonUrl}
          onClose={() => setSkeletonPreviewOpen(false)}
        />
      ) : null}
    </section>
  )
}
