import type { Hono } from 'hono'
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { existsSync } from 'node:fs'
import { loadFeed } from '@cfb/feed-config'
import { assertFeedAccess, getUserDid } from './request-user.js'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_SIZE = 1_000_000 // 1MB

function avatarsDir(feedsDir: string): string {
  return resolve(feedsDir, 'avatars')
}

function avatarFilename(feedsDir: string, feedId: string): string | null {
  const dir = avatarsDir(feedsDir)
  for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
    const p = resolve(dir, `${feedId}${ext}`)
    if (existsSync(p)) return p
  }
  return null
}

function mimeForExt(ext: string): string {
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  return 'image/jpeg'
}

export function avatarPublicUrl(feedId: string): string {
  return `/api/feeds/${feedId}/avatar`
}

/** Read avatar bytes for a feed (used during Bluesky publish). */
export async function readFeedAvatarBytes(feedsDir: string, feedId: string): Promise<{ data: Uint8Array; mime: string } | null> {
  const path = avatarFilename(feedsDir, feedId)
  if (!path) return null
  const data = await readFile(path)
  const ext = extname(path).toLowerCase()
  return { data: new Uint8Array(data), mime: mimeForExt(ext) }
}

export function registerFeedAvatarRoutes(app: Hono, options: { feedsDir: string }) {
  const { feedsDir } = options

  // Serve avatar (public)
  app.get('/api/feeds/:id/avatar', async (c) => {
    const path = avatarFilename(feedsDir, c.req.param('id'))
    if (!path) return c.body(null, 404)
    const data = await readFile(path)
    const ext = extname(path).toLowerCase()
    c.header('Content-Type', mimeForExt(ext))
    c.header('Cache-Control', 'public, max-age=3600')
    return c.body(data)
  })

  // Upload avatar (authenticated)
  app.post('/api/feeds/:id/avatar', async (c) => {
    const id = c.req.param('id')
    let feed
    try {
      feed = await loadFeed(feedsDir, id)
    } catch {
      return c.json({ error: 'not found' }, 404)
    }
    const access = assertFeedAccess(feed, getUserDid(c))
    if (!access.ok) return c.json({ error: 'not found' }, access.status)

    const body = await c.req.parseBody()
    const file = body['file']
    if (!file || typeof file === 'string') {
      return c.json({ error: 'file field required (multipart)' }, 400)
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return c.json({ error: `Unsupported type: ${file.type}. Use PNG, JPEG, or WebP.` }, 400)
    }
    if (file.size > MAX_SIZE) {
      return c.json({ error: 'Image too large (max 1MB)' }, 400)
    }

    const ext = file.type === 'image/png' ? '.png' : file.type === 'image/webp' ? '.webp' : '.jpg'
    const dir = avatarsDir(feedsDir)
    await mkdir(dir, { recursive: true })

    // Remove old avatar if different extension
    for (const oldExt of ['.png', '.jpg', '.jpeg', '.webp']) {
      if (oldExt === ext) continue
      const old = resolve(dir, `${id}${oldExt}`)
      if (existsSync(old)) await unlink(old)
    }

    const buf = Buffer.from(await file.arrayBuffer())
    await writeFile(resolve(dir, `${id}${ext}`), buf)

    return c.json({ avatarUrl: avatarPublicUrl(id) })
  })

  // Delete avatar
  app.delete('/api/feeds/:id/avatar', async (c) => {
    const id = c.req.param('id')
    let feed
    try {
      feed = await loadFeed(feedsDir, id)
    } catch {
      return c.json({ error: 'not found' }, 404)
    }
    const access = assertFeedAccess(feed, getUserDid(c))
    if (!access.ok) return c.json({ error: 'not found' }, access.status)

    const path = avatarFilename(feedsDir, id)
    if (path) await unlink(path)
    return c.json({ ok: true })
  })
}
