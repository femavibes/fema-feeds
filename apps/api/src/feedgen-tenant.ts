import { loadAllFeeds } from '@cfb/feed-config'
import { parseGeneratorUri } from '@cfb/feedgen'
import type { FeedgenSettings } from '@cfb/core-types'
import {
  findOwnerDidByDuckdnsHost,
  findOwnerDidByPublicHost,
  resolveFeedgenSettings,
  resolveUserFeedgenSettings,
  type Pool,
} from '@cfb/storage-postgres'
import { feedgenEnvFromProcess } from './feedgen-env.js'

export interface FeedgenTenant {
  ownerDid: string
  settings: FeedgenSettings
}

export async function resolveFeedgenTenantFromHost(
  pool: Pool | null,
  host: string | undefined,
): Promise<FeedgenTenant | null> {
  if (!pool || !host) return null
  const ownerDid = await findOwnerDidByPublicHost(pool, host)
  if (!ownerDid) return null
  const settings = await resolveUserFeedgenSettings(pool, ownerDid, feedgenEnvFromProcess())
  return { ownerDid, settings }
}

export async function resolveFeedgenTenantFromFeedUri(
  pool: Pool | null,
  feedUri: string | undefined,
): Promise<FeedgenTenant | null> {
  if (!pool || !feedUri) return null
  const parsed = parseGeneratorUri(feedUri)
  if (!parsed?.did) return null
  const settings = await resolveUserFeedgenSettings(pool, parsed.did, feedgenEnvFromProcess())
  return { ownerDid: parsed.did, settings: { ...settings, generatorDid: parsed.did } }
}

/** Resolve tenant for Bluesky XRPC: Host header first, then feed URI DID, then legacy deployment settings. */
export async function resolveFeedgenTenant(
  pool: Pool | null,
  opts: { host?: string; feedUri?: string },
): Promise<FeedgenTenant> {
  const env = feedgenEnvFromProcess()
  const fromHost = await resolveFeedgenTenantFromHost(pool, opts.host)
  if (fromHost) return fromHost

  const fromFeed = await resolveFeedgenTenantFromFeedUri(pool, opts.feedUri)
  if (fromFeed) return fromFeed

  const legacy = await resolveFeedgenSettings(pool, env)
  return {
    ownerDid: legacy.generatorDid || 'deployment',
    settings: legacy,
  }
}

export async function loadTenantFeeds(
  feedsDir: string,
  ownerDid: string,
): Promise<Awaited<ReturnType<typeof loadAllFeeds>>> {
  const all = await loadAllFeeds(feedsDir)
  if (ownerDid === 'deployment') return all
  return all.filter((f) => !f.ownerDid || f.ownerDid === ownerDid)
}
