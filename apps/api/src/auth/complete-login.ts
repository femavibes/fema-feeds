import type { Context } from 'hono'
import type { Pool } from '@cfb/storage-postgres'
import {
  getDeploymentAccess,
  saveDeploymentAccess,
  upsertUser,
  type AuthUser,
} from '@cfb/storage-postgres'
import { canUserLogin } from '@cfb/core-types'
import { isGlobalVerifierUser } from '../global-marketplace.js'
import { startBrowserSession } from './middleware.js'

export interface LoginProfile {
  did: string
  handle?: string
  displayName?: string
  avatar?: string
}

export async function completeUserLogin(
  pool: Pool,
  c: Context,
  profile: LoginProfile,
): Promise<
  { user: AuthUser; isMaster: boolean; isGlobalVerifier: boolean } | { error: string; status: number }
> {
  const access = await getDeploymentAccess(pool)
  if (!canUserLogin(profile.did, access)) {
    return {
      error: 'Your account is not on the login whitelist for this deployment',
      status: 403,
    }
  }

  let nextAccess = access
  if (!access.masterDid) {
    nextAccess = { ...access, masterDid: profile.did }
    await saveDeploymentAccess(pool, nextAccess)
    console.error(`[auth] first login — deployment master set to ${profile.did}`)
  }

  const user = await upsertUser(pool, {
    did: profile.did,
    handle: profile.handle,
    displayName: profile.displayName,
    avatarUrl: profile.avatar,
  })

  await startBrowserSession(pool, c, profile.did)
  const isGlobalVerifier = await isGlobalVerifierUser(pool, user.did, profile.handle)
  return { user, isMaster: user.did === nextAccess.masterDid, isGlobalVerifier }
}
