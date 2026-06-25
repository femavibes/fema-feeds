import type { LogicBlockPackage, PluginKind, PluginPackage, SortPackPackage } from '@cfb/core-types'
import type { Pool } from '@cfb/storage-postgres'
import { listLogicBlockCatalog, listPluginCatalog, listSortPackCatalog } from '@cfb/storage-postgres'
import { fetchRemoteGlobalCatalog } from './global-marketplace-registry.js'
import { fetchRemoteGlobalSortPackCatalog } from './global-sort-pack-registry.js'
import { globalMarketplaceRegistryRole, globalMarketplaceRemoteUrl } from './global-marketplace.js'

export type CatalogScope = 'deployment' | 'global' | 'all'

function mergeById<T extends { id: string }>(primary: T[], secondary: T[]): T[] {
  const byId = new Map<string, T>()
  for (const item of primary) byId.set(item.id, item)
  for (const item of secondary) byId.set(item.id, item)
  return [...byId.values()]
}

async function remoteOrLocalGlobalLogicBlocks(pool: Pool): Promise<LogicBlockPackage[]> {
  const url = globalMarketplaceRemoteUrl()
  if (!url) return listLogicBlockCatalog(pool, 'global')
  try {
    return await fetchRemoteGlobalCatalog(url)
  } catch {
    return listLogicBlockCatalog(pool, 'global')
  }
}

async function fetchRemotePluginCatalog(kind: PluginKind): Promise<PluginPackage[]> {
  const base = globalMarketplaceRemoteUrl()?.replace(/\/$/, '')
  if (!base) return []
  const path =
    kind === 'injector'
      ? '/api/global-marketplace/injectors/catalog'
      : '/api/global-marketplace/rankers/catalog'
  const res = await fetch(`${base}${path}`, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`registry ${kind} catalog fetch failed (${res.status})`)
  const body = (await res.json()) as {
    packages?: Array<
      Omit<PluginPackage, 'manifest' | 'createdAt'> & { manifest?: PluginPackage['manifest'] }
    >
  }
  return (body.packages ?? []).map((p) => ({
    ...p,
    visibility: 'global' as const,
    kind,
    manifest: p.manifest ?? {
      id: p.slug,
      version: p.version,
      kind,
      runtime: p.runtime,
      hooks: kind === 'injector' ? ['onInject'] : ['onSort'],
      permissions: [],
    },
    createdAt: p.updatedAt,
  }))
}

export async function resolveLogicBlockCatalog(
  pool: Pool,
  scope: CatalogScope,
): Promise<LogicBlockPackage[]> {
  if (globalMarketplaceRegistryRole() !== 'consumer') {
    return listLogicBlockCatalog(pool, scope)
  }
  if (scope === 'deployment') return listLogicBlockCatalog(pool, 'deployment')
  const remote = await remoteOrLocalGlobalLogicBlocks(pool)
  if (scope === 'global') return remote
  const local = await listLogicBlockCatalog(pool, 'deployment')
  return mergeById(remote, local)
}

export async function resolveSortPackCatalog(
  pool: Pool,
  scope: CatalogScope,
): Promise<SortPackPackage[]> {
  if (globalMarketplaceRegistryRole() !== 'consumer') {
    return listSortPackCatalog(pool, scope)
  }
  if (scope === 'deployment') return listSortPackCatalog(pool, 'deployment')
  let remote: SortPackPackage[]
  try {
    remote = await fetchRemoteGlobalSortPackCatalog()
  } catch {
    remote = await listSortPackCatalog(pool, 'global')
  }
  if (scope === 'global') return remote
  const local = await listSortPackCatalog(pool, 'deployment')
  return mergeById(remote, local)
}

export async function resolvePluginCatalog(
  pool: Pool,
  kind: PluginKind,
  scope: CatalogScope,
): Promise<PluginPackage[]> {
  if (globalMarketplaceRegistryRole() !== 'consumer') {
    return listPluginCatalog(pool, kind, scope)
  }
  if (scope === 'deployment') return listPluginCatalog(pool, kind, 'deployment')
  let remote: PluginPackage[]
  try {
    remote = await fetchRemotePluginCatalog(kind)
  } catch {
    remote = await listPluginCatalog(pool, kind, 'global')
  }
  if (scope === 'global') return remote
  const local = await listPluginCatalog(pool, kind, 'deployment')
  return mergeById(remote, local)
}
