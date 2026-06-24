import type { PluginKind, PluginManifest } from '@cfb/core-types'
import type { Pool } from '@cfb/storage-postgres'
import { createPluginPackage, listPluginCatalog } from '@cfb/storage-postgres'
import { isGlobalMarketplaceOperatorInstance } from './global-marketplace.js'

export const DEMO_STATIC_INJECTOR_SLUG = 'static-uri-injector'
export const DEMO_PINNED_RANKER_SLUG = 'pinned-uri-ranker'

export function demoPinnedRankerManifest(): PluginManifest {
  return {
    id: DEMO_PINNED_RANKER_SLUG,
    version: '1.0.0',
    kind: 'ranker',
    runtime: 'native',
    hooks: ['onSort'],
    permissions: [],
    configSchema: {
      type: 'object',
      properties: {
        pinnedUris: {
          type: 'array',
          items: { type: 'string', description: 'at:// post URIs to pin to the top' },
          description: 'Posts to prioritize at the front of each skeleton page',
        },
      },
    },
  }
}

export function demoStaticInjectorManifest(): PluginManifest {
  return {
    id: DEMO_STATIC_INJECTOR_SLUG,
    version: '1.0.0',
    kind: 'injector',
    runtime: 'native',
    hooks: ['onInject'],
    permissions: [],
    disclosure: 'This feed may include promoted posts configured by the publisher.',
    configSchema: {
      type: 'object',
      properties: {
        uris: {
          type: 'array',
          items: { type: 'string', description: 'at:// post URIs to inject' },
          description: 'Post URIs to rotate into injected slots',
        },
      },
    },
  }
}

/** Seed a native static-URI injector on operator instances for dev/demo. */
export async function ensureDemoInjectorPackage(pool: Pool): Promise<void> {
  if (!isGlobalMarketplaceOperatorInstance()) return

  const existing = await listPluginCatalog(pool, 'injector', 'deployment')
  if (existing.some((p) => p.slug === DEMO_STATIC_INJECTOR_SLUG)) return

  const masterRes = await pool.query<{ did: string }>(
    `SELECT did FROM users ORDER BY created_at ASC LIMIT 1`,
  )
  const ownerDid = process.env.CFB_MASTER_DID?.trim() || masterRes.rows[0]?.did
  if (!ownerDid) return

  await createPluginPackage(pool, {
    ownerDid,
    slug: DEMO_STATIC_INJECTOR_SLUG,
    name: 'Static URI injector (demo)',
    description:
      'Native demo injector — supply at:// URIs in feed config. Slot rules are enforced by CFB.',
    kind: 'injector',
    runtime: 'native',
    manifest: demoStaticInjectorManifest(),
    visibility: 'deployment',
  })
}

/** Seed a native pinned-URI ranker on operator instances for dev/demo. */
export async function ensureDemoRankerPackage(pool: Pool): Promise<void> {
  if (!isGlobalMarketplaceOperatorInstance()) return

  const existing = await listPluginCatalog(pool, 'ranker', 'deployment')
  if (existing.some((p) => p.slug === DEMO_PINNED_RANKER_SLUG)) return

  const masterRes = await pool.query<{ did: string }>(
    `SELECT did FROM users ORDER BY created_at ASC LIMIT 1`,
  )
  const ownerDid = process.env.CFB_MASTER_DID?.trim() || masterRes.rows[0]?.did
  if (!ownerDid) return

  await createPluginPackage(pool, {
    ownerDid,
    slug: DEMO_PINNED_RANKER_SLUG,
    name: 'Pinned URI ranker (demo)',
    description:
      'Native demo ranker — pin at:// URIs to the top of each skeleton page at serve time.',
    kind: 'ranker',
    runtime: 'native',
    manifest: demoPinnedRankerManifest(),
    visibility: 'deployment',
  })
}

export function parsePluginKind(raw: string | undefined): PluginKind | null {
  if (raw === 'injector' || raw === 'ranker') return raw
  return null
}
