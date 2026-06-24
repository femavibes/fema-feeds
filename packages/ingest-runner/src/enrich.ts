import type { EnrichmentSettings, NormalizedPost } from '@cfb/core-types'
import { fetchAuthorProfile } from '@cfb/profile-enrich'
import { resolveLabelerLabelsForPost } from '@cfb/label-resolve'
import { createLabelStreamManager, type LabelStreamStats } from '@cfb/label-stream'
import type pg from 'pg'
import {
  bumpEngagementIfInPool,
  getEnrichmentSettings,
  isAuthorProfileFresh,
  listEnabledLabelerDids,
  upsertAuthorProfile,
} from '@cfb/storage-postgres'
import {
  engagementCounterForCollection,
  engagementDelta,
  startEngagementJetstream,
  type EngagementEvent,
} from '@cfb/ingest-jetstream'

const pendingAuthorFetches = new Set<string>()

export async function maybeResolveLabelerLabels(
  pool: pg.Pool,
  post: NormalizedPost,
  settings: EnrichmentSettings,
): Promise<NormalizedPost> {
  if (!settings.enabled || !settings.resolveLabelerLabels) return post
  const labelerDids = await listEnabledLabelerDids(pool)
  if (labelerDids.length === 0) return post
  try {
    return await resolveLabelerLabelsForPost(post, { labelerDids })
  } catch {
    return post
  }
}

export async function maybeEnrichAuthor(
  pool: pg.Pool,
  did: string,
  settings: EnrichmentSettings,
): Promise<'skipped' | 'fresh' | 'queued' | 'ok' | 'error'> {
  if (!settings.enabled || !settings.enrichAuthors) return 'skipped'
  if (await isAuthorProfileFresh(pool, did)) return 'fresh'
  if (pendingAuthorFetches.has(did)) return 'queued'

  pendingAuthorFetches.add(did)
  try {
    const profile = await fetchAuthorProfile(did)
    await upsertAuthorProfile(pool, profile, settings.authorProfileTtlHours)
    return 'ok'
  } catch {
    return 'error'
  } finally {
    pendingAuthorFetches.delete(did)
  }
}

export async function loadEnrichmentSettings(pool: pg.Pool): Promise<EnrichmentSettings> {
  return getEnrichmentSettings(pool)
}

export interface EngagementHandlerStats {
  bumps: number
  ignored: number
  errors: number
}

export interface EngagementHandlerOptions {
  /** Called when engagement was bumped on a pooled post. */
  onBumped?: (postUri: string) => void | Promise<void>
}

export function createEngagementHandler(
  pool: pg.Pool,
  stats: EngagementHandlerStats,
  options?: EngagementHandlerOptions,
): (event: EngagementEvent) => Promise<void> {
  return async (event) => {
    try {
      const counter = engagementCounterForCollection(event.collection)
      const delta = engagementDelta(event.operation)
      if (delta === 0) return
      const bumped = await bumpEngagementIfInPool(pool, event.subjectUri, counter, delta)
      if (bumped) {
        stats.bumps++
        await options?.onBumped?.(event.subjectUri)
      } else {
        stats.ignored++
      }
    } catch {
      stats.errors++
    }
  }
}

export async function startEngagementIfEnabled(
  pool: pg.Pool,
  settings: EnrichmentSettings,
  jetstreamUrl: string,
  stats: EngagementHandlerStats,
  options?: EngagementHandlerOptions,
): Promise<{ stop: () => void } | null> {
  if (!settings.enabled || !settings.trackEngagement || !settings.engagementJetstream) {
    return null
  }
  return startEngagementJetstream({
    jetstreamUrl,
    onEngagement: createEngagementHandler(pool, stats, options),
  })
}

export interface LabelStreamRunnerOptions {
  projectsDir: string
  feedsDir?: string
  onStats?: (stats: LabelStreamStats) => void
}

export async function startLabelStreamIfEnabled(
  pool: pg.Pool,
  settings: EnrichmentSettings,
  options: LabelStreamRunnerOptions,
): Promise<{ stop: () => void; getStats: () => LabelStreamStats } | null> {
  if (!settings.enabled || !settings.labelStreamEnabled) return null

  const manager = createLabelStreamManager({
    pool,
    projectsDir: options.projectsDir,
    feedsDir: options.feedsDir,
    getSettings: () => getEnrichmentSettings(pool),
  })
  await manager.start()
  return {
    stop: () => manager.stop(),
    getStats: () => manager.getStats(),
  }
}
