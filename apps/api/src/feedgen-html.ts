import type { Context } from 'hono'
import { buildCfbHtmlPage } from './html-page-shell.js'

/** Browser navigation / explicit preview — Bluesky clients still get JSON. */
export function wantsFeedSkeletonHtml(c: Context): boolean {
  const format = c.req.query('format')
  if (format === 'html') return true
  if (format === 'json') return false
  const accept = c.req.header('accept') ?? ''
  return accept.includes('text/html') && !accept.includes('application/json')
}

export function buildFeedgenSkeletonErrorHtml(message: string, status: number): string {
  return buildCfbHtmlPage(
    `Feed skeleton error (${status})`,
    `    <h1>Feed skeleton error</h1>
    <p class="meta">${escapeHtml(message)}</p>
    <p class="meta">Bluesky and API clients should request this URL without <code>format=html</code> and with <code>Accept: application/json</code>.</p>`,
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
