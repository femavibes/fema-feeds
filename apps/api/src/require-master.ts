import type { Context } from 'hono'
import type { Pool } from '@cfb/storage-postgres'
import { getDeploymentAccess } from '@cfb/storage-postgres'
import { isDeploymentMaster } from '@cfb/core-types'
import { getUserDid } from './request-user.js'
import { isLoginRequired } from './auth/oauth.js'

export async function isRequestMaster(c: Context, pool: Pool | null): Promise<boolean> {
  if (!pool) return false
  const did = getUserDid(c)
  if (!did) return false
  const access = await getDeploymentAccess(pool)
  return isDeploymentMaster(did, access)
}

/** Enforce master only when this deployment runs multi-user auth (Postgres + login). */
export async function requireMasterIfMultiUser(
  c: Context,
  pool: Pool | null,
): Promise<{ ok: true } | Response> {
  if (!pool || !isLoginRequired()) return { ok: true }
  return requireMaster(c, pool)
}

export async function requireMaster(
  c: Context,
  pool: Pool | null,
): Promise<{ ok: true } | Response> {
  if (!(await isRequestMaster(c, pool))) {
    return c.json({ error: 'deployment master account required' }, 403)
  }
  return { ok: true }
}
