import type { Hono } from 'hono'
import type { PluginKind, PluginManifest, PluginRuntime, PluginTrustTier, PluginVisibility } from '@cfb/core-types'
import type { Pool } from '@cfb/storage-postgres'
import {
  createPluginPackage,
  getPluginPackageById,
  getPublisherVerificationStatus,
  listPluginCatalog,
  listPluginCollection,
  listPluginPackageVersions,
  listPluginSubscriptions,
  setPluginVisibility,
  setPluginWasmArtifact,
  subscribePlugin,
  unsubscribePlugin,
  setPackageListingMeta,
  updatePluginPackage,
} from '@cfb/storage-postgres'
import { evictWasmCache, MAX_WASM_BYTES } from '@cfb/plugin-wasm'
import {
  globalMarketplaceMode,
  globalMarketplaceRegistryRole,
  isCanonicalGlobalRegistryHost,
  isRequestGlobalVerifier,
} from './global-marketplace.js'
import { resolvePluginCatalog } from './marketplace-catalog-resolve.js'
import { parsePluginKind } from './plugin-bootstrap.js'
import { getUserDid } from './request-user.js'
import { rejectOwnerGlobalVisibility } from './marketplace-visibility.js'
import { isRequestMaster } from './require-master.js'

function parseCatalogScope(raw: string | undefined): 'deployment' | 'global' | 'all' {
  if (raw === 'deployment' || raw === 'global' || raw === 'all') return raw
  return 'all'
}

export function registerGlobalPluginRegistryRoutes(app: Hono, pool: Pool | null, kind: PluginKind): void {
  const base = kind === 'injector' ? '/api/global-marketplace/injectors' : '/api/global-marketplace/rankers'

  app.get(`${base}/catalog`, async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    if (!isCanonicalGlobalRegistryHost()) {
      return c.json({ error: 'global marketplace registry not enabled on this host' }, 503)
    }
    const packages = await listPluginCatalog(pool, kind, 'global')
    return c.json({
      packages: packages.map((p) => ({
        id: p.id,
        ownerDid: p.ownerDid,
        slug: p.slug,
        version: p.version,
        name: p.name,
        description: p.description,
        kind: p.kind,
        runtime: p.runtime,
        visibility: 'global' as const,
        trustTier: p.trustTier,
        updatedAt: p.updatedAt,
      })),
    })
  })

  app.get(`${base}/catalog/:id`, async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    if (!isCanonicalGlobalRegistryHost()) {
      return c.json({ error: 'global marketplace registry not enabled on this host' }, 503)
    }
    const versionPin = c.req.query('version')?.trim()
    const pkg = await getPluginPackageById(pool, c.req.param('id'), versionPin)
    if (!pkg || pkg.visibility !== 'global' || pkg.kind !== kind) {
      return c.json({ error: 'not found' }, 404)
    }
    return c.json({ package: pkg })
  })
}

async function resolvePluginForSubscribe(pool: Pool, packageId: string, versionPin: string) {
  const local = await getPluginPackageById(pool, packageId, versionPin)
  if (local) return local
  return null
}

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function buildPluginManifest(slug: string, kind: PluginKind, runtime: PluginRuntime): PluginManifest {
  const hooks = kind === 'injector' ? ['onInject'] : ['onSort']
  const base: PluginManifest = {
    id: slug,
    version: '1.0.0',
    kind,
    runtime,
    hooks,
    permissions: [],
  }
  if (kind === 'injector') {
    base.disclosure = 'This feed may include promoted posts configured by the publisher.'
    base.configSchema = {
      type: 'object',
      properties: {
        uris: {
          type: 'array',
          items: { type: 'string' },
          description: 'at:// post URIs to inject (configured per feed)',
        },
      },
    }
  } else {
    base.configSchema = {
      type: 'object',
      properties: {
        pinnedUris: {
          type: 'array',
          items: { type: 'string' },
          description: 'at:// post URIs to pin to the top (configured per feed)',
        },
      },
    }
  }
  if (runtime === 'remote') {
    base.configSchema = {
      type: 'object',
      properties: {
        ...(base.configSchema as { properties?: Record<string, unknown> }).properties,
        note: { type: 'string', description: 'Remote plugins receive feed context via HTTPS POST.' },
      },
    }
  }
  return base
}

async function requireVerifiedPublisher(pool: Pool, userDid: string) {
  const status = await getPublisherVerificationStatus(pool, userDid)
  if (!status.deploymentVerified && !status.globalVerified) {
    return { ok: false as const, status }
  }
  return { ok: true as const, status }
}

export function registerPluginRoutes(app: Hono, pool: Pool | null): void {
  registerGlobalPluginRegistryRoutes(app, pool, 'injector')
  registerGlobalPluginRegistryRoutes(app, pool, 'ranker')

  app.get('/api/plugins/catalog', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const kind = parsePluginKind(c.req.query('kind'))
    if (!kind) return c.json({ error: 'kind=injector or kind=ranker required' }, 400)
    const scope = parseCatalogScope(c.req.query('scope'))
    try {
      const packages = await resolvePluginCatalog(pool, kind, scope)
      return c.json({ packages, scope, kind, mode: globalMarketplaceMode() })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'registry fetch failed'
      return c.json({ error: message }, 502)
    }
  })

  app.get('/api/plugins/collection', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const kind = parsePluginKind(c.req.query('kind'))
    const packages = await listPluginCollection(pool, userDid, kind ?? undefined)
    return c.json({ packages })
  })

  app.post('/api/plugins', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const verified = await requireVerifiedPublisher(pool, userDid)
    if (!verified.ok) {
      return c.json(
        {
          error: 'publisher_verification_required',
          message:
            'Custom code packages require publisher verification. Ask your deployment master or the global marketplace operator (fema.monster).',
          publisherVerification: verified.status,
        },
        403,
      )
    }

    const body =
      (await c.req
        .json<{
          kind?: PluginKind
          runtime?: PluginRuntime
          name?: string
          slug?: string
          description?: string
          remoteEndpoint?: string
        }>()
        .catch(() => null)) ?? {}

    const kind = body.kind === 'injector' || body.kind === 'ranker' ? body.kind : null
    const runtime =
      body.runtime === 'native' ||
      body.runtime === 'remote' ||
      body.runtime === 'wasm' ||
      body.runtime === 'worker'
        ? body.runtime
        : null
    const name = body.name?.trim()
    if (!kind || !runtime || !name) {
      return c.json(
        { error: 'kind, runtime (native|remote|wasm|worker), and name required' },
        400,
      )
    }
    if (runtime === 'remote' && !body.remoteEndpoint?.trim()) {
      return c.json({ error: 'remoteEndpoint required for remote runtime' }, 400)
    }

    const slug = slugify(body.slug?.trim() || name)
    if (!slug) return c.json({ error: 'valid slug required' }, 400)

    const pkg = await createPluginPackage(pool, {
      ownerDid: userDid,
      slug,
      name,
      description: body.description?.trim() || undefined,
      kind,
      runtime,
      manifest: buildPluginManifest(slug, kind, runtime),
      remoteEndpoint: body.remoteEndpoint?.trim(),
      visibility: 'collection',
    })
    return c.json({ package: pkg }, 201)
  })

  app.get('/api/plugins/subscriptions', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const kind = parsePluginKind(c.req.query('kind'))
    const subscriptions = await listPluginSubscriptions(pool, userDid, kind ?? undefined)
    return c.json({ subscriptions })
  })

  app.post('/api/plugins/:id/wasm-artifact', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const verified = await requireVerifiedPublisher(pool, userDid)
    if (!verified.ok) {
      return c.json({ error: 'publisher_verification_required' }, 403)
    }

    const body = (await c.req.json<{ wasmBase64?: string }>().catch(() => null)) ?? {}
    const raw = body.wasmBase64?.trim()
    if (!raw) return c.json({ error: 'wasmBase64 required' }, 400)

    let bytes: Buffer
    try {
      bytes = Buffer.from(raw, 'base64')
    } catch {
      return c.json({ error: 'invalid base64' }, 400)
    }
    if (bytes.byteLength > MAX_WASM_BYTES) {
      return c.json({ error: `wasm artifact exceeds ${MAX_WASM_BYTES} bytes` }, 400)
    }

    const existing = await getPluginPackageById(pool, c.req.param('id'))
    if (!existing || existing.ownerDid !== userDid) {
      return c.json({ error: 'not found or not owner' }, 404)
    }
    if (existing.runtime !== 'wasm' && existing.runtime !== 'worker') {
      return c.json({ error: 'package runtime is not wasm or worker' }, 400)
    }

    const pkg = await setPluginWasmArtifact(pool, c.req.param('id'), userDid, bytes)
    if (!pkg) return c.json({ error: 'artifact upload failed' }, 404)
    if (pkg.wasmSha256) evictWasmCache(pkg.wasmSha256)
    return c.json({ package: pkg })
  })

  app.get('/api/plugins/:id', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const version = c.req.query('version')
    const pkg = await getPluginPackageById(pool, c.req.param('id'), version || undefined)
    if (!pkg) return c.json({ error: 'not found' }, 404)
    return c.json({ package: pkg })
  })

  app.get('/api/plugins/:id/versions', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const versions = await listPluginPackageVersions(pool, c.req.param('id'))
    if (versions.length === 0) return c.json({ error: 'not found' }, 404)
    return c.json({ versions })
  })

  app.post('/api/plugins/:id/subscribe', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const body =
      (await c.req.json<{ versionPin?: string; updatePolicy?: 'pinned' | 'notify' | 'auto_minor' }>().catch(
        () => null,
      )) ?? {}
    const versionPin = body.versionPin?.trim()
    if (!versionPin) return c.json({ error: 'versionPin required' }, 400)
    const pkg = await resolvePluginForSubscribe(pool, c.req.param('id'), versionPin)
    if (!pkg) return c.json({ error: 'package version not found' }, 404)
    if (pkg.visibility === 'collection' && pkg.ownerDid !== userDid) {
      return c.json({ error: 'cannot subscribe to a private plugin you do not own' }, 403)
    }
    await subscribePlugin(pool, userDid, pkg.id, pkg.version, body.updatePolicy ?? 'pinned')
    return c.json({ ok: true })
  })

  app.delete('/api/plugins/:id/subscribe', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const ok = await unsubscribePlugin(pool, userDid, c.req.param('id'))
    if (!ok) return c.json({ error: 'not subscribed' }, 404)
    return c.json({ ok: true })
  })

  app.patch('/api/plugins/:id', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const body =
      (await c.req
        .json<{
          name?: string
          description?: string | null
          remoteEndpoint?: string | null
          listing?: import('@cfb/core-types').MarketplaceListingMeta | null
        }>()
        .catch(() => null)) ?? {}
    const hasMeta =
      body.name !== undefined || body.description !== undefined || body.remoteEndpoint !== undefined
    const hasListing = body.listing !== undefined
    if (!hasMeta && !hasListing) {
      return c.json({ error: 'provide name, description, remoteEndpoint, or listing' }, 400)
    }
    const packageId = c.req.param('id')
    let pkg: Awaited<ReturnType<typeof updatePluginPackage>> = null
    if (hasMeta) {
      pkg = await updatePluginPackage(pool, packageId, userDid, {
        name: body.name?.trim(),
        description: body.description,
        remoteEndpoint: body.remoteEndpoint,
      })
      if (!pkg) return c.json({ error: 'not found or not owner' }, 404)
    }
    if (hasListing) {
      const listingOk = await setPackageListingMeta(
        pool,
        'plugin_packages',
        packageId,
        userDid,
        body.listing ?? null,
      )
      if (!listingOk && !pkg) return c.json({ error: 'not found or not owner' }, 404)
    }
    const refreshed = await getPluginPackageById(pool, packageId, pkg?.version)
    if (!refreshed) return c.json({ error: 'not found or not owner' }, 404)
    return c.json({ package: refreshed })
  })

  app.patch('/api/plugins/:id/visibility', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const body = (await c.req.json<{ visibility?: PluginVisibility }>().catch(() => null)) ?? {}
    const visibility = body.visibility
    if (!visibility || !['collection', 'deployment', 'global'].includes(visibility)) {
      return c.json({ error: 'visibility required' }, 400)
    }
    const globalReject = rejectOwnerGlobalVisibility(visibility)
    if (globalReject) return c.json(globalReject, 400)
    if (visibility === 'deployment' || visibility === 'global') {
      const verified = await requireVerifiedPublisher(pool, userDid)
      if (!verified.ok) {
        return c.json({ error: 'publisher_verification_required' }, 403)
      }
      if (visibility === 'deployment' && !verified.status.deploymentVerified) {
        return c.json({ error: 'deployment publisher verification required' }, 403)
      }
      if (visibility === 'global' && !verified.status.globalVerified) {
        return c.json({ error: 'global publisher verification required' }, 403)
      }
      const existing = await getPluginPackageById(pool, c.req.param('id'))
      if (
        existing &&
        (existing.runtime === 'wasm' || existing.runtime === 'worker') &&
        !existing.wasmSha256
      ) {
        return c.json({ error: 'upload wasm artifact before publishing wasm/worker plugin' }, 400)
      }
    }
    const pkg = await setPluginVisibility(pool, c.req.param('id'), userDid, visibility)
    if (!pkg) return c.json({ error: 'not found or not owner' }, 404)
    return c.json({ package: pkg })
  })

  app.patch('/api/plugins/:id/trust', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const body = (await c.req.json<{ trustTier?: PluginTrustTier }>().catch(() => null)) ?? {}
    const trustTier = body.trustTier
    if (!trustTier || !['none', 'deployment_verified', 'global_verified'].includes(trustTier)) {
      return c.json({ error: 'trustTier required' }, 400)
    }
    const existing = await getPluginPackageById(pool, c.req.param('id'))
    if (!existing) return c.json({ error: 'not found' }, 404)
    if (trustTier === 'global_verified') {
      if (!(await isRequestGlobalVerifier(c, pool))) {
        return c.json({ error: 'global marketplace verifier required' }, 403)
      }
      if (existing.visibility !== 'global') {
        return c.json({ error: 'only global listings can receive global verification' }, 400)
      }
    } else if (trustTier === 'deployment_verified') {
      if (!(await isRequestMaster(c, pool))) {
        return c.json({ error: 'deployment master required' }, 403)
      }
      if (existing.visibility !== 'deployment') {
        return c.json({ error: 'only deployment listings can receive deployment verification' }, 400)
      }
    } else {
      return c.json({ error: 'trust revoke not implemented for plugins yet' }, 400)
    }
    await pool.query(
      `UPDATE plugin_packages SET trust_tier = $2, updated_at = NOW() WHERE id = $1`,
      [c.req.param('id'), trustTier],
    )
    const pkg = await getPluginPackageById(pool, c.req.param('id'))
    return c.json({ package: pkg })
  })
}
