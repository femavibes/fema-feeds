import { buildCfbHtmlPage } from './html-page-shell.js'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function profileActorForBskyPath(actor: string): string {
  if (actor.startsWith('did:')) return actor
  return encodeURIComponent(actor)
}

function postAtUriToBskyUrl(atUri: string): string | null {
  const m = atUri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/i)
  if (!m?.[1] || !m[2]) return null
  return `https://bsky.app/profile/${profileActorForBskyPath(m[1])}/post/${m[2]}`
}

export interface SkeletonPreviewItem {
  post: string
  feedContext?: string
}

export function buildSkeletonPreviewHtml(options: {
  feedName: string
  feedId: string
  candidateCount: number
  items: SkeletonPreviewItem[]
  cursor?: string
  publicSkeletonUrl?: string | null
}): string {
  const { feedName, feedId, candidateCount, items, cursor, publicSkeletonUrl } = options
  const rows =
    items.length > 0
      ? items
          .map((item) => {
            const bsky = postAtUriToBskyUrl(item.post)
            const label = bsky
              ? `<a href="${escapeHtml(bsky)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.post)}</a>`
              : `<code>${escapeHtml(item.post)}</code>`
            return `    <li>${label}</li>`
          })
          .join('\n')
      : '    <li class="empty">No posts in this skeleton page.</li>'

  const publicLink = publicSkeletonUrl
    ? `    <p class="meta">Public feedgen JSON: <a href="${escapeHtml(publicSkeletonUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(publicSkeletonUrl)}</a></p>`
    : ''

  const mainHtml = `    <h1>${escapeHtml(feedName)}</h1>
    <p class="meta">Feed <code>${escapeHtml(feedId)}</code> · ${items.length} post${items.length === 1 ? '' : 's'} on this page · ${candidateCount.toLocaleString()} candidates in pool${cursor ? ` · cursor <code>${escapeHtml(cursor)}</code>` : ''}</p>
    <ol>
${rows}
    </ol>
${publicLink}`

  return buildCfbHtmlPage(`${escapeHtml(feedName)} — skeleton preview`, mainHtml)
}
