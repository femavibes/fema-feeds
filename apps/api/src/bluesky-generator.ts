import { Agent, AtpAgent } from '@atproto/api'
import type { AtpSessionData } from '@atproto/api'
import { resolve } from 'node:path'
import type { FeedConfig } from '@cfb/core-types'
import type { Pool } from '@cfb/storage-postgres'
import { getOAuthSessionJson, saveOAuthSession } from '@cfb/storage-postgres'
import { buildPublishedFeedUri } from '@cfb/feedgen'
import { getOAuthClient } from './auth/oauth.js'
import {
  normalizeBlueskyHandle,
  verifyAppPasswordLogin,
  type AppPasswordLoginResult,
} from './auth/app-password.js'

const BSKY_SERVICE = process.env.BSKY_SERVICE_URL?.trim() || 'https://bsky.social'
const defaultRoot = resolve(import.meta.dirname, '../../..')

type AtprotoSession = NonNullable<AtpAgent['session']>
export type PublishingAgent = Agent

function isAtpSessionData(stored: unknown): stored is AtpSessionData {
  return Boolean(
    stored &&
      typeof stored === 'object' &&
      'accessJwt' in stored &&
      'refreshJwt' in stored &&
      'did' in stored,
  )
}

function createPersistingAtpAgent(pool: Pool): AtpAgent {
  return new AtpAgent({
    service: BSKY_SERVICE,
    persistSession: (_evt, session) => {
      if (session) void saveAtprotoSession(pool, session)
    },
  })
}

export async function saveAtprotoSession(
  pool: Pool,
  session: AtprotoSession | AppPasswordLoginResult['atprotoSession'],
): Promise<void> {
  await saveOAuthSession(pool, session.did, session)
}

async function resolveHandleForDid(pool: Pool, did: string): Promise<string | null> {
  const { getUser } = await import('@cfb/storage-postgres')
  const user = await getUser(pool, did)
  return user?.handle ?? null
}

async function getAgentFromOAuth(
  pool: Pool,
  userDid: string,
  rootDir = defaultRoot,
): Promise<Agent | null> {
  const client = await getOAuthClient(pool, rootDir)
  if (!client) return null
  try {
    const oauthSession = await client.restore(userDid)
    return new Agent(oauthSession)
  } catch {
    return null
  }
}

/** Bluesky agent for repo writes (publish/unpublish). Reuses stored session — no re-login needed. */
export async function getAtprotoAgent(
  pool: Pool,
  userDid: string,
  appPassword?: string,
  rootDir = defaultRoot,
): Promise<PublishingAgent | null> {
  if (appPassword?.trim()) {
    const handle = await resolveHandleForDid(pool, userDid)
    if (!handle) return null
    try {
      const verified = await verifyAppPasswordLogin(handle, appPassword)
      await saveAtprotoSession(pool, verified.atprotoSession)
      const agent = createPersistingAtpAgent(pool)
      await agent.resumeSession(verified.atprotoSession as AtprotoSession)
      return agent
    } catch {
      return null
    }
  }

  const stored = await getOAuthSessionJson(pool, userDid)
  if (stored && isAtpSessionData(stored)) {
    const agent = createPersistingAtpAgent(pool)
    try {
      await agent.resumeSession(stored)
      return agent
    } catch {
      // Stored app-password session expired or revoked — try OAuth format next.
    }
  }

  return getAgentFromOAuth(pool, userDid, rootDir)
}

export async function hasBlueskyPublishingSession(
  pool: Pool,
  userDid: string,
  rootDir = defaultRoot,
): Promise<boolean> {
  const agent = await getAtprotoAgent(pool, userDid, undefined, rootDir)
  return agent !== null
}

export interface BlueskyGeneratorRecordStatus {
  exists: boolean
  compatible: boolean
  uri: string | null
}

export async function getBlueskyGeneratorRecordStatus(
  agent: PublishingAgent,
  userDid: string,
  feed: FeedConfig,
  serviceDid: string,
): Promise<BlueskyGeneratorRecordStatus> {
  const rkey = feed.atprotoRkey ?? feed.feedId
  const uri = buildPublishedFeedUri(userDid, { ...feed, atprotoRkey: rkey })
  try {
    const res = await agent.com.atproto.repo.getRecord({
      repo: userDid,
      collection: 'app.bsky.feed.generator',
      rkey,
    })
    const record = res.data.value as { did?: string }
    const compatible = record.did === serviceDid
    return { exists: true, compatible, uri }
  } catch {
    return { exists: false, compatible: false, uri }
  }
}

export async function publishBlueskyGeneratorRecord(
  agent: PublishingAgent,
  userDid: string,
  feed: FeedConfig,
  serviceDid: string,
): Promise<{ uri: string; created: boolean }> {
  if (!serviceDid.trim()) {
    throw new Error('Generator service DID not configured (Settings → Feed publishing)')
  }

  const rkey = feed.atprotoRkey ?? feed.feedId
  const uri = buildPublishedFeedUri(userDid, { ...feed, atprotoRkey: rkey })
  const existing = await getBlueskyGeneratorRecordStatus(agent, userDid, feed, serviceDid)

  const record = {
    $type: 'app.bsky.feed.generator' as const,
    did: serviceDid,
    displayName: feed.name.trim().slice(0, 24) || rkey,
    description: feed.description?.trim().slice(0, 300) || undefined,
    createdAt: new Date().toISOString(),
  }

  await agent.com.atproto.repo.putRecord({
    repo: userDid,
    collection: 'app.bsky.feed.generator',
    rkey,
    record,
  })

  return { uri, created: !existing.exists }
}

export async function deleteBlueskyGeneratorRecord(
  agent: PublishingAgent,
  userDid: string,
  feed: FeedConfig,
): Promise<void> {
  const rkey = feed.atprotoRkey ?? feed.feedId
  try {
    await agent.com.atproto.repo.deleteRecord({
      repo: userDid,
      collection: 'app.bsky.feed.generator',
      rkey,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('RecordNotFound')) return
    throw err
  }
}

export function blueskySessionError(): string {
  return 'Bluesky publishing session unavailable — sign in again (app password or OAuth), or enter your app password below.'
}
