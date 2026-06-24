import { AtpAgent } from '@atproto/api'
import type { Context } from 'hono'
import type { Pool } from '@cfb/storage-postgres'
import { getUser } from '@cfb/storage-postgres'
import { normalizeBlueskyHandle } from './auth/app-password.js'
import { getUserDid } from './request-user.js'

/** Platform operator account — not configurable per deployment. */
export const GLOBAL_MARKETPLACE_OPERATOR_HANDLE = 'fema.monster'

const BSKY_SERVICE = process.env.BSKY_SERVICE_URL?.trim() || 'https://bsky.social'

export type GlobalMarketplaceMode = 'local' | 'remote'

/** How this instance relates to the global marketplace registry. */
export type GlobalMarketplaceRegistryRole = 'operator' | 'consumer' | 'embedded'

/**
 * True only on the operator-hosted global marketplace registry instance.
 * Individual Docker deployments must leave this unset — they browse global
 * listings read-only; verification is applied on the external registry.
 */
export function isGlobalMarketplaceOperatorInstance(): boolean {
  const raw = process.env.CFB_GLOBAL_MARKETPLACE_OPERATOR?.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

export function globalMarketplaceOperatorDid(): string | null {
  const did = process.env.CFB_GLOBAL_MARKETPLACE_OPERATOR_DID?.trim()
  return did || null
}

/** Local DB until CFB_GLOBAL_MARKETPLACE_URL points at the central registry. */
export function globalMarketplaceMode(): GlobalMarketplaceMode {
  return process.env.CFB_GLOBAL_MARKETPLACE_URL?.trim() ? 'remote' : 'local'
}

export function globalMarketplaceRemoteUrl(): string | null {
  return process.env.CFB_GLOBAL_MARKETPLACE_URL?.trim() || null
}

/**
 * operator — hosts the registry (global listings in this DB; public catalog API).
 * consumer — browses/subscribes via CFB_GLOBAL_MARKETPLACE_URL.
 * embedded — dev default: global listings live in this DB until operator or remote URL is set.
 */
export function globalMarketplaceRegistryRole(): GlobalMarketplaceRegistryRole {
  if (globalMarketplaceRemoteUrl()) return 'consumer'
  if (isGlobalMarketplaceOperatorInstance()) return 'operator'
  return 'embedded'
}

export function globalMarketplaceStatusHint(role: GlobalMarketplaceRegistryRole): string {
  switch (role) {
    case 'operator':
      return 'This instance is the global marketplace registry. Global listings and fema.monster verification are managed here.'
    case 'consumer':
      return 'Global marketplace catalog is fetched from the configured registry URL.'
    case 'embedded':
      return 'Dev stub: global listings are stored in this database. Set CFB_GLOBAL_MARKETPLACE_OPERATOR=true to expose the public registry API, or CFB_GLOBAL_MARKETPLACE_URL to consume a remote registry.'
  }
}

function operatorHandleMatches(handle: string): boolean {
  const expected = normalizeBlueskyHandle(GLOBAL_MARKETPLACE_OPERATOR_HANDLE)
  return normalizeBlueskyHandle(handle) === expected
}

async function resolveHandleForDid(did: string): Promise<string | null> {
  try {
    const agent = new AtpAgent({ service: BSKY_SERVICE })
    const profile = await agent.getProfile({ actor: did })
    return profile.data.handle ?? null
  } catch {
    return null
  }
}

export async function isGlobalVerifierUser(
  pool: Pool | null,
  did: string,
  sessionHandle?: string | null,
): Promise<boolean> {
  const pinnedDid = globalMarketplaceOperatorDid()
  if (pinnedDid) return did === pinnedDid

  const handles: string[] = []
  if (sessionHandle?.trim()) handles.push(sessionHandle)
  if (pool) {
    const user = await getUser(pool, did)
    if (user?.handle) handles.push(user.handle)
  }
  const liveHandle = await resolveHandleForDid(did)
  if (liveHandle) handles.push(liveHandle)

  return handles.some((h) => operatorHandleMatches(h))
}

export async function isRequestGlobalVerifier(c: Context, pool: Pool | null): Promise<boolean> {
  const did = getUserDid(c)
  if (!did) return false
  const user = c.get('user') as { handle?: string | null } | null | undefined
  return isGlobalVerifierUser(pool, did, user?.handle)
}
