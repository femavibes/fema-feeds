import type { Hono } from 'hono'
import { mkdir, readFile, writeFile, unlink, readdir } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { existsSync } from 'node:fs'
import { getUserDid } from './request-user.js'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_SIZE = 2_000_000 // 2MB per image
const MAX_GALLERY = 8

const ASSETS_DIR = 'config/marketplace-assets'

function assetsRoot(): string {
  return resolve(import.meta.dirname, '../../..', ASSETS_DIR)
}

function packageDir(packageId: string): string {
  return resolve(assetsRoot(), packageId)
}

function findFile(dir: string, prefix: string): string | null {
  for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
    const p = resolve(dir, `${prefix}${ext}`)
    if (existsSync(p)) return p
  }
  return null
}

function mimeForExt(ext: string): string {
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  return 'image/jpeg'
}

function extForMime(mime: string): string {
  if (mime === 'image/png') return '.png'
  if (mime === 'image/webp') return '.webp'
  return '.jpg'
}

export function marketplaceAssetUrl(packageId: string, slot: string): string {
  return `/api/marketplace-assets/${packageId}/${slot}`
}

/** List all asset URLs for a package (icon, cover, gallery-N). */
export function listPackageAssetUrls(packageId: string): {
  iconUrl?: string
  coverUrl?: string
  galleryUrls: string[]
} {
  const dir = packageDir(packageId)
  const result: { iconUrl?: string; coverUrl?: string; galleryUrls: string[] } = { galleryUrls: [] }
  if (findFile(dir, 'icon')) result.iconUrl = marketplaceAssetUrl(packageId, 'icon')
  if (findFile(dir, 'cover')) result.coverUrl = marketplaceAssetUrl(packageId, 'cover')
  for (let i = 1; i <= MAX_GALLERY; i++) {
    if (findFile(dir, `gallery-${i}`)) {
      result.galleryUrls.push(marketplaceAssetUrl(packageId, `gallery-${i}`))
    }
  }
  return result
}

export function registerMarketplaceAssetRoutes(app: Hono) {
  // Serve asset (public)
  app.get('/api/marketplace-assets/:packageId/:slot', async (c) => {
    const { packageId, slot } = c.req.param()
    const dir = packageDir(packageId)
    const path = findFile(dir, slot)
    if (!path) return c.body(null, 404)
    const data = await readFile(path)
    const ext = extname(path).toLowerCase()
    c.header('Content-Type', mimeForExt(ext))
    c.header('Cache-Control', 'public, max-age=3600')
    return c.body(data)
  })

  // Upload asset
  app.post('/api/marketplace-assets/:packageId/:slot', async (c) => {
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const { packageId, slot } = c.req.param()
    const validSlots = ['icon', 'cover', ...Array.from({ length: MAX_GALLERY }, (_, i) => `gallery-${i + 1}`)]
    if (!validSlots.includes(slot)) {
      return c.json({ error: `Invalid slot: ${slot}` }, 400)
    }

    const body = await c.req.parseBody()
    const file = body['file']
    if (!file || typeof file === 'string') {
      return c.json({ error: 'file field required (multipart)' }, 400)
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return c.json({ error: `Unsupported type: ${file.type}. Use PNG, JPEG, or WebP.` }, 400)
    }
    if (file.size > MAX_SIZE) {
      return c.json({ error: 'Image too large (max 2MB)' }, 400)
    }

    const ext = extForMime(file.type)
    const dir = packageDir(packageId)
    await mkdir(dir, { recursive: true })

    // Remove old file with different extension
    for (const oldExt of ['.png', '.jpg', '.jpeg', '.webp']) {
      if (oldExt === ext) continue
      const old = resolve(dir, `${slot}${oldExt}`)
      if (existsSync(old)) await unlink(old)
    }

    const buf = Buffer.from(await file.arrayBuffer())
    await writeFile(resolve(dir, `${slot}${ext}`), buf)

    return c.json({ url: marketplaceAssetUrl(packageId, slot) })
  })

  // Delete asset
  app.delete('/api/marketplace-assets/:packageId/:slot', async (c) => {
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const { packageId, slot } = c.req.param()
    const dir = packageDir(packageId)
    const path = findFile(dir, slot)
    if (path) await unlink(path)
    return c.json({ ok: true })
  })

  // List all assets for a package
  app.get('/api/marketplace-assets/:packageId', async (c) => {
    const { packageId } = c.req.param()
    return c.json(listPackageAssetUrls(packageId))
  })
}
