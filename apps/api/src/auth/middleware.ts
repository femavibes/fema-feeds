import { randomUUID } from 'node:crypto'
import type { Context, Next } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Pool } from '@cfb/storage-postgres'
import {
  createBrowserSession,
  deleteBrowserSession,
  getBrowserSessionUserDid,
  getUser,
  type AuthUser,
} from '@cfb/storage-postgres'
import { isLoginRequired } from './oauth.js'
import { buildSkeletonLoginRequiredHtml } from '../html-page-shell.js'

export const SESSION_COOKIE = 'cfb_session'
const SESSION_DAYS = 30

export type AuthVariables = {
  user: AuthUser | null
  userDid: string | null
}

const PUBLIC_API_PREFIXES = [
  '/api/health',
  '/api/auth/',
  '/oauth/',
  '/xrpc/',
  '/api/cfb/deployments/register',
  '/api/global-marketplace/catalog',
  '/api/global-marketplace/status',
  '/api/global-marketplace/ingress/',
  '/api/global-marketplace/sort-packs/catalog',
  '/api/global-marketplace/injectors/catalog',
  '/api/global-marketplace/rankers/catalog',
]

function isPublicApiPath(path: string): boolean {
  return PUBLIC_API_PREFIXES.some((p) => path === p || path.startsWith(p))
}

export async function resolveSessionUser(
  pool: Pool | null,
  sessionId: string | undefined,
): Promise<AuthUser | null> {
  if (!pool || !sessionId) return null
  const did = await getBrowserSessionUserDid(pool, sessionId)
  if (!did) return null
  return getUser(pool, did)
}

export function createAuthMiddleware(pool: Pool | null) {
  return async (c: Context, next: Next) => {
    const sessionId = getCookie(c, SESSION_COOKIE)
    const user = await resolveSessionUser(pool, sessionId)
    c.set('user', user)
    c.set('userDid', user?.did ?? null)

    if (!isLoginRequired() || isPublicApiPath(c.req.path)) {
      return next()
    }

    if (!user) {
      if (c.req.path.endsWith('/skeleton-preview')) {
        return c.html(buildSkeletonLoginRequiredHtml(), 401)
      }
      return c.json({ error: 'login_required' }, 401)
    }

    return next()
  }
}

export async function startBrowserSession(
  pool: Pool,
  c: Context,
  userDid: string,
): Promise<void> {
  const sessionId = randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await createBrowserSession(pool, sessionId, userDid, expiresAt)
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: false,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
}

export async function clearBrowserSession(pool: Pool, c: Context): Promise<void> {
  const sessionId = getCookie(c, SESSION_COOKIE)
  if (sessionId) await deleteBrowserSession(pool, sessionId)
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}
