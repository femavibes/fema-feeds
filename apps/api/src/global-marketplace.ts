import { AtpAgent } from '@atproto/api'

import type { Context } from 'hono'

import type { Pool } from '@cfb/storage-postgres'

import { getUser } from '@cfb/storage-postgres'

import { normalizeBlueskyHandle } from './auth/app-password.js'

import { getUserDid } from './request-user.js'



/** Platform operator account — not configurable per deployment. */

export const GLOBAL_MARKETPLACE_OPERATOR_HANDLE = 'fema.monster'



/** Canonical global registry hostname — only this host stores global listings. */

export const GLOBAL_MARKETPLACE_CANONICAL_HOST = 'marketplace.fema.monster'



/** Consumer VPS deployments always read the global catalog from here (override for dev). */

export const GLOBAL_MARKETPLACE_CANONICAL_URL = `https://${GLOBAL_MARKETPLACE_CANONICAL_HOST}`



const BSKY_SERVICE = process.env.BSKY_SERVICE_URL?.trim() || 'https://bsky.social'



export type GlobalMarketplaceMode = 'local' | 'remote'



/** How this instance relates to the global marketplace registry. */

export type GlobalMarketplaceRegistryRole = 'registry' | 'consumer' | 'embedded'



export type CfbAppProfile = 'feedbuilder' | 'registry'



/**

 * UI profile: full feed builder (default) or marketplace registry console only.

 * Registry profile is for marketplace.fema.monster — hides projects/ingest chrome.

 */

export function cfbAppProfile(): CfbAppProfile {

  const raw = process.env.CFB_APP_PROFILE?.trim().toLowerCase()

  return raw === 'registry' ? 'registry' : 'feedbuilder'

}



function parseHostname(raw: string): string | null {

  const trimmed = raw.trim()

  if (!trimmed) return null

  try {

    const host = trimmed.includes('://') ? new URL(trimmed).hostname : trimmed.split('/')[0]

    return host?.toLowerCase() ?? null

  } catch {

    return null

  }

}



/** Public hostname for this deployment (OAuth URL, site host, etc.). */

export function deploymentPublicHostname(): string | null {

  for (const value of [

    process.env.OAUTH_PUBLIC_URL,

    process.env.SITE_HOST,

    process.env.FEEDGEN_PUBLIC_URL,

  ]) {

    const host = value ? parseHostname(value) : null

    if (host) return host

  }

  return null

}



/**

 * True only on marketplace.fema.monster (or CFB_REGISTRY_DEV for local all-in-one testing).

 * Feed-builder VPS deployments are never the global registry — no env toggle for end users.

 */

export function isCanonicalGlobalRegistryHost(): boolean {

  const host = deploymentPublicHostname()

  if (host === GLOBAL_MARKETPLACE_CANONICAL_HOST) return true

  const dev = process.env.CFB_REGISTRY_DEV?.trim().toLowerCase()

  return dev === '1' || dev === 'true' || dev === 'yes'

}



/** @deprecated Use isCanonicalGlobalRegistryHost */

export function isGlobalMarketplaceOperatorInstance(): boolean {

  return isCanonicalGlobalRegistryHost()

}



export function globalMarketplaceOperatorDid(): string | null {

  const did = process.env.CFB_GLOBAL_MARKETPLACE_OPERATOR_DID?.trim()

  return did || null

}



function isEmbeddedMarketplaceStub(): boolean {

  const raw = process.env.CFB_GLOBAL_MARKETPLACE_EMBEDDED?.trim().toLowerCase()

  return raw === '1' || raw === 'true' || raw === 'yes'

}



/**

 * Remote registry URL for consumer (feed-builder) deployments.

 * The canonical registry host reads/writes its own DB instead.

 */

export function globalMarketplaceRemoteUrl(): string | null {

  if (isCanonicalGlobalRegistryHost()) return null

  if (isEmbeddedMarketplaceStub()) return null

  const explicit = process.env.CFB_GLOBAL_MARKETPLACE_URL?.trim()

  return explicit || GLOBAL_MARKETPLACE_CANONICAL_URL

}



export function globalMarketplaceMode(): GlobalMarketplaceMode {

  return globalMarketplaceRegistryRole() === 'consumer' ? 'remote' : 'local'

}



/**

 * registry — marketplace.fema.monster; global listings live in this DB.

 * consumer — every feed-builder VPS; global catalog fetched from canonical URL.

 * embedded — offline dev stub (CFB_GLOBAL_MARKETPLACE_EMBEDDED=true).

 */

export function globalMarketplaceRegistryRole(): GlobalMarketplaceRegistryRole {

  if (isCanonicalGlobalRegistryHost()) return 'registry'

  if (isEmbeddedMarketplaceStub()) return 'embedded'

  return 'consumer'

}



export function globalMarketplaceStatusHint(role: GlobalMarketplaceRegistryRole): string {

  switch (role) {

    case 'registry':

      return `This host is the global marketplace registry (${GLOBAL_MARKETPLACE_CANONICAL_HOST}). Global listings are managed here by ${GLOBAL_MARKETPLACE_OPERATOR_HANDLE}.`

    case 'consumer': {

      const url = globalMarketplaceRemoteUrl()

      return `Global marketplace catalog is fetched from ${url}. Publish to global from My collection — ${GLOBAL_MARKETPLACE_OPERATOR_HANDLE} reviews submissions on the registry.`

    }

    case 'embedded':

      return 'Offline dev stub: global listings are in this database only. Unset CFB_GLOBAL_MARKETPLACE_EMBEDDED to use the live global registry.'

  }

}



/** Owners cannot self-publish to global — submissions go through the registry review queue. */

export function isDirectGlobalPublishAllowed(): boolean {

  return false

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

