import { AtpAgent } from '@atproto/api'

const BSKY_SERVICE = process.env.BSKY_SERVICE_URL?.trim() || 'https://bsky.social'

export function normalizeBlueskyHandle(handle: string): string {
  const trimmed = handle.trim()
  if (!trimmed) return trimmed
  const bare = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
  return bare.includes('.') ? bare : `${bare}.bsky.social`
}

export interface VerifiedAppPasswordSession {
  did: string
  handle: string
  displayName?: string
  avatar?: string
}

export interface AppPasswordLoginResult extends VerifiedAppPasswordSession {
  atprotoSession: {
    did: string
    handle?: string
    email?: string
    accessJwt: string
    refreshJwt: string
    active?: boolean
  }
}

export async function verifyAppPasswordLogin(
  handle: string,
  appPassword: string,
): Promise<AppPasswordLoginResult> {
  const agent = new AtpAgent({ service: BSKY_SERVICE })
  try {
    const res = await agent.login({
      identifier: normalizeBlueskyHandle(handle),
      password: appPassword.trim(),
    })
    const profile = await agent.getProfile({ actor: res.data.did })
    if (!agent.session) throw new Error('Login succeeded but no session was created')
    return {
      did: res.data.did,
      handle: profile.data.handle ?? res.data.handle,
      displayName: profile.data.displayName,
      avatar: profile.data.avatar,
      atprotoSession: agent.session,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (
      message.includes('Invalid identifier') ||
      message.includes('InvalidCredentials') ||
      message.includes('AuthenticationRequired')
    ) {
      throw new Error('Invalid handle or app password')
    }
    throw err instanceof Error ? err : new Error('Login failed')
  }
}
