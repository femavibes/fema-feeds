import { AtpAgent } from '@atproto/api'

import { normalizeBlueskyHandle } from './auth/app-password.js'

const BSKY_SERVICE = process.env.BSKY_SERVICE_URL?.trim() || 'https://bsky.social'

export interface ResolvedBlueskyActor {
  did: string
  handle: string
  displayName?: string
}

export async function resolveBlueskyHandle(handle: string): Promise<ResolvedBlueskyActor> {
  const normalized = normalizeBlueskyHandle(handle)
  if (!normalized) {
    throw new Error('Handle required')
  }

  const agent = new AtpAgent({ service: BSKY_SERVICE })
  const resolved = await agent.resolveHandle({ handle: normalized })
  const did = resolved.data.did
  if (!did?.startsWith('did:')) {
    throw new Error('Could not resolve handle')
  }

  try {
    const profile = await agent.getProfile({ actor: did })
    return {
      did,
      handle: profile.data.handle ?? normalized,
      displayName: profile.data.displayName,
    }
  } catch {
    return { did, handle: normalized }
  }
}
