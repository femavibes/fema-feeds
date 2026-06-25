import { useState, type CSSProperties } from 'react'
import type {
  PoolMatchMediaPreview,
  PoolMatchQuotePreview,
  PoolMatchSample,
} from '../../api/client'
import { normalizePoolMatchSample } from '../../lib/pool-match-sample'
import { formatTraceHighlight, L2TraceList } from './L2TraceList'
import type { TraceSelectHandler } from './visual/L2PreviewRail'

function postBskyUrl(uri: string): string {
  const m = uri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/)
  if (!m) return uri
  return `https://bsky.app/profile/${m[1]}/post/${m[2]}`
}

function profileUrl(author: PoolMatchSample['author']): string {
  const actor = author.handle ?? author.did
  return `https://bsky.app/profile/${encodeURIComponent(actor)}`
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso
}

function authorPrimaryLabel(author: PoolMatchSample['author']): string {
  if (author.displayName?.trim()) return author.displayName.trim()
  if (author.handle?.trim()) return `@${author.handle}`
  return author.did
}

function authorSecondaryLabel(author: PoolMatchSample['author']): string | null {
  if (author.displayName?.trim() && author.handle) return `@${author.handle}`
  if (author.handle) return author.did
  return null
}

function avatarInitial(author: PoolMatchSample['author']): string {
  const source = author.displayName?.trim() || author.handle || author.did
  return source.replace(/^@/, '').charAt(0).toUpperCase() || '?'
}

function postKindLabel(kind: string): string {
  switch (kind) {
    case 'reply':
      return 'Reply'
    case 'quote':
      return 'Quote'
    case 'repost':
      return 'Repost'
    default:
      return 'Post'
  }
}

function postKindTitle(kind: string): string | undefined {
  switch (kind) {
    case 'reply':
      return 'This post is a reply in a thread, not a top-level post'
    case 'quote':
      return 'This post quotes another post'
    case 'repost':
      return 'This is a repost'
    default:
      return undefined
  }
}

function mediaAspectStyle(item: PoolMatchMediaPreview): CSSProperties | undefined {
  const ar = item.aspectRatio
  if (!ar?.width || !ar?.height) return undefined
  return { aspectRatio: `${ar.width} / ${ar.height}` }
}

function MatchMediaGrid({ media, postUrl }: { media: PoolMatchMediaPreview[]; postUrl: string }) {
  if (media.length === 0) return null

  return (
    <div className={`l2-match-media-grid l2-match-media-grid-${Math.min(media.length, 4)}`}>
      {media.map((item, i) => {
        const target = item.kind === 'link' && item.href ? item.href : postUrl
        const label =
          item.kind === 'image'
            ? item.alt || 'Image'
            : item.kind === 'video'
              ? item.alt || 'Video'
              : item.title || item.alt || 'Link'

        return (
          <a
            key={`${item.kind}-${i}`}
            className={`l2-match-media-item l2-match-media-${item.kind}`}
            href={target}
            target="_blank"
            rel="noopener noreferrer"
            title={label}
            style={mediaAspectStyle(item)}
          >
            {item.thumbUrl ? (
              <img src={item.thumbUrl} alt={item.alt ?? ''} loading="lazy" referrerPolicy="no-referrer" />
            ) : (
              <span className="l2-match-media-placeholder">{label}</span>
            )}
            {item.kind === 'video' ? <span className="l2-match-media-play" aria-hidden>▶</span> : null}
            {item.kind === 'link' && (item.title || item.alt) ? (
              <span className="l2-match-media-link-caption">
                {item.title || item.alt}
              </span>
            ) : null}
          </a>
        )
      })}
    </div>
  )
}

function QuotePreview({ quote }: { quote: PoolMatchQuotePreview }) {
  const quoteUrl = postBskyUrl(quote.uri)
  const author = quote.author ?? {
    did: '',
    handle: null,
    displayName: null,
    avatarUrl: null,
  }

  return (
    <a
      className="l2-match-quote"
      href={quoteUrl}
      target="_blank"
      rel="noopener noreferrer"
      title="Open quoted post on Bluesky"
    >
      <div className="l2-match-quote-author">
        {author.avatarUrl ? (
          <img
            className="l2-match-quote-avatar"
            src={author.avatarUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="l2-match-quote-avatar l2-match-quote-avatar-fallback">
            {avatarInitial(author)}
          </span>
        )}
        <span className="l2-match-quote-author-name">{authorPrimaryLabel(author)}</span>
      </div>
      <p className="l2-match-quote-text">{quote.text.trim() || '(no text)'}</p>
      {quote.thumbUrl ? (
        <img
          className="l2-match-quote-thumb"
          src={quote.thumbUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : null}
    </a>
  )
}

function TraceRulesIcon() {
  return (
    <svg className="l2-match-pool-trace-icon" width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <circle cx="2" cy="2" r="1.1" fill="currentColor" />
      <circle cx="2" cy="6" r="1.1" fill="currentColor" />
      <circle cx="2" cy="10" r="1.1" fill="currentColor" />
      <path
        d="M4.2 2h5.8M4.2 6h3.8M4.2 10h4.8"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  )
}

interface Props {
  sample: PoolMatchSample
  matched?: boolean
  sortKey?: number | null
  editorScore?: number
  onSelectNode?: TraceSelectHandler
}

export function PoolMatchSampleRow({ sample: rawSample, matched = false, sortKey, editorScore, onSelectNode }: Props) {
  const sample = normalizePoolMatchSample(rawSample)
  const selectTraceNode = onSelectNode
    ? (nodeId: string) => onSelectNode(nodeId, sample.trace)
    : undefined
  const [open, setOpen] = useState(false)
  const why = formatTraceHighlight(sample.trace, matched)
  const postUrl = postBskyUrl(sample.uri)
  const kindTitle = postKindTitle(sample.postKind)

  return (
    <li className={`l2-match-pool-item${matched ? ' l2-match-pool-item-match' : ' l2-match-pool-item-reject'}`}>
      <div className="l2-match-pool-card">
        <div className="l2-match-pool-author-row">
          <a
            className="l2-match-pool-author"
            href={profileUrl(sample.author)}
            target="_blank"
            rel="noopener noreferrer"
            title="Open author on Bluesky"
          >
            {sample.author.avatarUrl ? (
              <img
                className="l2-match-pool-avatar"
                src={sample.author.avatarUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="l2-match-pool-avatar l2-match-pool-avatar-fallback">
                {avatarInitial(sample.author)}
              </span>
            )}
            <span className="l2-match-pool-author-text">
              <span className="l2-match-pool-author-name">{authorPrimaryLabel(sample.author)}</span>
              {authorSecondaryLabel(sample.author) ? (
                <span className="l2-match-pool-author-sub mono">
                  {authorSecondaryLabel(sample.author)}
                </span>
              ) : null}
            </span>
          </a>
          {sample.postKind !== 'root' ? (
            <span className="l2-match-pool-kind-badge" title={kindTitle}>
              {postKindLabel(sample.postKind)}
            </span>
          ) : null}
        </div>

        <a
          className="l2-match-pool-link"
          href={postUrl}
          target="_blank"
          rel="noreferrer"
        >
          {sample.text.trim() || <span className="mono">(no text)</span>}
        </a>

        <MatchMediaGrid media={sample.media} postUrl={postUrl} />

        {sample.quote ? <QuotePreview quote={sample.quote} /> : null}

        {sample.facetTags.length > 0 ? (
          <div className="l2-match-tag-list">
            {sample.facetTags.map((tag) => (
              <span key={tag} className="l2-match-tag">
                #{tag.replace(/^#/, '')}
              </span>
            ))}
          </div>
        ) : null}

        <div className="l2-match-pool-meta-row">
          <span className="l2-match-pool-meta">
            {formatWhen(sample.indexedAt)}
            {sortKey != null && ` · sort ${Math.round(sortKey)}`}
          </span>
          {sample.trace.length > 0 ? (
            <button
              type="button"
              className={`l2-match-pool-trace-toggle${open ? ' l2-match-pool-trace-toggle-open' : ''}`}
              onClick={() => setOpen((v) => !v)}
              title={open ? 'Hide rule trace' : 'Show full rule trace'}
              aria-label={open ? 'Hide rule trace' : 'Show full rule trace'}
              aria-expanded={open}
            >
              <TraceRulesIcon />
            </button>
          ) : null}
          {editorScore != null && editorScore > 0 ? (
            <span className="l2-match-pool-score" title={`Editor score: ${editorScore}`}>
              +{editorScore}
            </span>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="l2-match-pool-trace-panel">
          {why ? (
            <p className={`l2-match-pool-why${matched ? ' l2-match-pool-why-pass' : ' l2-match-pool-why-fail'}`}>
              {why}
            </p>
          ) : null}
          <L2TraceList trace={sample.trace} onSelectNode={selectTraceNode} compact />
        </div>
      ) : null}
    </li>
  )
}
