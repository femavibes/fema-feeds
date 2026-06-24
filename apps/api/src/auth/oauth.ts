import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { NodeOAuthClient, type NodeSavedSession, type NodeSavedState } from '@atproto/oauth-client-node'
import { JoseKey } from '@atproto/jwk-jose'
import type { Pool } from '@cfb/storage-postgres'
import {
  deleteOAuthState,
  getOAuthSessionJson,
  getOAuthState,
  saveOAuthSession,
  setOAuthState,
  deleteOAuthSession,
} from '@cfb/storage-postgres'
import { isValidOAuthPublicUrl, oauthSetupError, resolveOAuthPublicUrl } from '../deployment-url.js'

const STATE_TTL_MS = 60 * 60 * 1000

export type CfbOAuthClient = NodeOAuthClient

let cachedClient: CfbOAuthClient | null | undefined
let cachedPublicUrl: string | null | undefined

export { isValidOAuthPublicUrl, oauthSetupError }

/** Login is required whenever the app uses Postgres (multi-user + publishing identity). */
export function isLoginRequired(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim())
}

export async function isOAuthConfigured(pool: Pool | null, rootDir: string): Promise<boolean> {
  return isLoginRequired() && Boolean(await resolveOAuthPublicUrl(pool, rootDir))
}

export async function webOrigin(pool: Pool | null, rootDir: string): Promise<string> {
  return (
    (await resolveOAuthPublicUrl(pool, rootDir)) ||
    process.env.WEB_ORIGIN?.trim().replace(/\/$/, '') ||
    'http://localhost:5173'
  )
}

async function loadKeyset(keysPath: string): Promise<JoseKey[]> {
  try {
    const raw = await readFile(keysPath, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown> | Record<string, unknown>[]
    const items = Array.isArray(parsed) ? parsed : [parsed]
    return Promise.all(items.map((j, i) => JoseKey.fromJWK(j, `cfb-key-${i + 1}`)))
  } catch {
    const key = await JoseKey.generate(['ES256'], 'cfb-key-1')
    await mkdir(dirname(keysPath), { recursive: true })
    await writeFile(keysPath, `${JSON.stringify(key.jwk, null, 2)}\n`, 'utf8')
    return [key]
  }
}

function createStateStore(pool: Pool) {
  return {
    async set(key: string, value: NodeSavedState) {
      await setOAuthState(pool, key, value, STATE_TTL_MS)
    },
    async get(key: string): Promise<NodeSavedState | undefined> {
      return (await getOAuthState(pool, key)) as NodeSavedState | undefined
    },
    async del(key: string) {
      await deleteOAuthState(pool, key)
    },
  }
}

function createSessionStore(pool: Pool) {
  return {
    async set(sub: string, value: NodeSavedSession) {
      await saveOAuthSession(pool, sub, value)
    },
    async get(sub: string): Promise<NodeSavedSession | undefined> {
      return (await getOAuthSessionJson(pool, sub)) as NodeSavedSession | undefined
    },
    async del(sub: string) {
      await deleteOAuthSession(pool, sub)
    },
  }
}

export async function getOAuthClient(
  pool: Pool | null,
  rootDir: string,
): Promise<CfbOAuthClient | null> {
  if (!pool || !isLoginRequired()) return null

  const publicUrl = await resolveOAuthPublicUrl(pool, rootDir)
  if (!publicUrl) return null

  if (cachedClient !== undefined && cachedPublicUrl === publicUrl) return cachedClient

  const keysPath = resolve(rootDir, 'config/oauth/jwk.json')
  const keyset = await loadKeyset(keysPath)

  cachedClient = new NodeOAuthClient({
    clientMetadata: {
      client_id: `${publicUrl}/oauth/client-metadata.json`,
      client_name: 'Custom Feed Builder',
      client_uri: publicUrl,
      redirect_uris: [`${publicUrl}/api/auth/callback`],
      grant_types: ['authorization_code', 'refresh_token'],
      scope: 'atproto transition:generic',
      response_types: ['code'],
      application_type: 'web',
      token_endpoint_auth_method: 'private_key_jwt',
      token_endpoint_auth_signing_alg: 'ES256',
      dpop_bound_access_tokens: true,
      jwks_uri: `${publicUrl}/oauth/jwks.json`,
    },
    keyset,
    stateStore: createStateStore(pool),
    sessionStore: createSessionStore(pool),
  })
  cachedPublicUrl = publicUrl

  return cachedClient
}

export function resetOAuthClientCache(): void {
  cachedClient = undefined
  cachedPublicUrl = undefined
}
