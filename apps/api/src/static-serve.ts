import { readFile, stat } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import type { Hono } from 'hono'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

/**
 * Serve static files from webDir. Falls back to index.html for SPA routing.
 * Only registers if webDir exists on disk.
 */
export async function registerStaticServing(app: Hono, webDir: string): Promise<boolean> {
  try {
    const s = await stat(webDir)
    if (!s.isDirectory()) return false
  } catch {
    return false
  }

  const indexPath = resolve(webDir, 'index.html')

  app.get('*', async (c) => {
    const url = new URL(c.req.url)
    const pathname = decodeURIComponent(url.pathname)

    // Skip API routes
    if (pathname.startsWith('/api/') || pathname.startsWith('/xrpc/') || pathname.startsWith('/.well-known/')) {
      return c.notFound()
    }

    // Try serving the exact file
    const filePath = resolve(webDir, pathname.replace(/^\//, ''))
    if (!filePath.startsWith(webDir)) return c.notFound()

    try {
      const s = await stat(filePath)
      if (s.isFile()) {
        const ext = extname(filePath)
        const mime = MIME[ext] ?? 'application/octet-stream'
        const body = await readFile(filePath)
        const headers: Record<string, string> = { 'content-type': mime }
        // Cache assets with hashed filenames indefinitely
        if (pathname.startsWith('/assets/')) {
          headers['cache-control'] = 'public, max-age=31536000, immutable'
        }
        return c.body(body, 200, headers)
      }
    } catch { /* fall through */ }

    // SPA fallback: serve index.html
    try {
      const body = await readFile(indexPath)
      return c.body(body, 200, { 'content-type': 'text/html; charset=utf-8' })
    } catch {
      return c.notFound()
    }
  })

  return true
}
