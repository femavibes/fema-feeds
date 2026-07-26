import type { FeedConfig, NormalizedPost, ProjectL1Config, ScoutDiscoveryConfig, ScoutInteractionType } from '@cfb/core-types'
import { scoutSourceEnabled } from '@cfb/core-types'
import { ScoutSignalCounter, type ScoutPersistence, type ScoutTrigger, loadAuthorListDids } from '@cfb/l2-worker'
import {
  getIngestedPost,
  deriveScoutDids,
  ensureScoutSignalsTables,
  upsertScoutSignal,
  loadScoutSignals,
  deleteScoutSignals,
  sweepScoutSignals,
  ensureEngagementEventsTable,
  insertEngagementEvent,
  pruneEngagementEvents,
  isPostInPool,
} from '@cfb/storage-postgres'
import { resolveActorsToDids, isActorDid } from '@cfb/profile-enrich'
import type pg from 'pg'

export interface ScoutHandlerStats {
  signals: number
  triggers: number
  fetched: number
  evalPass: number
  evalFail: number
  errors: number
}

export interface ScoutHandlerOptions {
  /** Fetch a post from Bluesky API (shared with substitution). */
  fetchPost: (uri: string) => Promise<NormalizedPost | null>
  /** Persist + evaluate a discovered post through L1/L2. */
  onDiscovered: (post: NormalizedPost, projectId: string) => Promise<boolean>
  /** Feed configs — scout nodes in feeds contribute to the project's scout set. */
  feeds?: FeedConfig[]
  /** Track engagement events in DB for top_engagers auto-derive. */
  trackEngagementEvents?: boolean
}

export interface ScoutHandler {
  /** Process an engagement event — call for every like/repost from Jetstream. */
  handleEngagement: (actorDid: string, subjectUri: string, interaction: ScoutInteractionType) => void
  /** Update configs (called on reload). */
  reload: (projects: ProjectL1Config[]) => void
  /** Run periodic sweep of stale signals. */
  sweep: () => number
  /** Refresh auto-derived scout sets from DB. */
  refreshAutoDerived: () => Promise<void>
  stats: ScoutHandlerStats
}

/**
 * Creates a scout handler that listens to engagement events and triggers
 * discovery when co-occurrence threshold is met.
 */
export function createScoutHandler(
  pool: pg.Pool,
  projects: ProjectL1Config[],
  options: ScoutHandlerOptions,
): ScoutHandler {
  const stats: ScoutHandlerStats = {
    signals: 0,
    triggers: 0,
    fetched: 0,
    evalPass: 0,
    evalFail: 0,
    errors: 0,
  }

  // Ensure tables exist (non-blocking)
  void ensureScoutSignalsTables(pool).catch(() => {})
  if (options.trackEngagementEvents !== false) {
    void ensureEngagementEventsTable(pool).catch(() => {})
  }

  // One counter per project with scout discovery enabled
  let counters = new Map<string, ScoutSignalCounter>()
  let lastConfigs = projects
  buildCounters(projects)

  interface ProjectScoutMerge {
    manual: Set<string>
    listIds: Set<string>
    autoDerive?: ScoutDiscoveryConfig['autoDerive']
  }

  function collectProjectScoutMerge(project: ProjectL1Config): ProjectScoutMerge {
    const manual = new Set<string>(project.scoutDiscovery?.scouts ?? [])
    const listIds = new Set<string>()
    if (project.scoutDiscovery?.listId) listIds.add(project.scoutDiscovery.listId)

    let autoDerive = project.scoutDiscovery?.autoDerive
    const projectFeeds = (options.feeds ?? []).filter(
      (f) => f.projectId === project.projectId && f.enabled,
    )
    for (const feed of projectFeeds) {
      const scoutSource = feed.sources?.scout
      if (!scoutSourceEnabled(feed.sources) || !scoutSource) continue
      for (const did of scoutSource.scouts ?? []) manual.add(did)
      if (scoutSource.listId) listIds.add(scoutSource.listId)
      if (!autoDerive && scoutSource.autoDerive) autoDerive = scoutSource.autoDerive
    }
    return { manual, listIds, autoDerive }
  }

  async function resolveScoutDidSet(merge: ProjectScoutMerge): Promise<string[]> {
    const manual = [...merge.manual]
    const resolvedDids = manual.filter((s) => isActorDid(s))
    const unresolved = manual.filter((s) => !isActorDid(s))
    const [handleDids, listDids] = await Promise.all([
      unresolved.length > 0 ? resolveActorsToDids(unresolved) : Promise.resolve([] as string[]),
      merge.listIds.size > 0 ? loadAuthorListDids(pool, [...merge.listIds]) : Promise.resolve([] as string[]),
    ])
    return [...new Set([...resolvedDids, ...handleDids.filter(Boolean), ...listDids])]
  }

  function applyScoutSet(counter: ScoutSignalCounter, merge: ProjectScoutMerge): void {
    void resolveScoutDidSet(merge).then((dids) => {
      if (dids.length > 0) counter.updateScouts(dids)
    }).catch(() => {})
  }

  function buildCounters(configs: ProjectL1Config[]): void {
    const next = new Map<string, ScoutSignalCounter>()
    for (const project of configs) {
      if (!project.enabled) continue

      let threshold = project.scoutDiscovery?.threshold
      let maxPostAgeHours = project.scoutDiscovery?.maxPostAgeHours
      let maxPendingSignals = project.scoutDiscovery?.maxPendingSignals
      const merge = collectProjectScoutMerge(project)

      const projectFeeds = (options.feeds ?? []).filter(
        (f) => f.projectId === project.projectId && f.enabled,
      )
      for (const feed of projectFeeds) {
        const scoutSource = feed.sources?.scout
        if (scoutSourceEnabled(feed.sources) && scoutSource) {
          if (!threshold) threshold = scoutSource.threshold
          if (!maxPostAgeHours && scoutSource.maxPostAgeHours) {
            maxPostAgeHours = scoutSource.maxPostAgeHours
          }
        }
      }

      if (!threshold) continue
      if (merge.manual.size === 0 && merge.listIds.size === 0 && !merge.autoDerive) continue

      const cfg: ScoutDiscoveryConfig = {
        enabled: true,
        scouts: [...merge.manual],
        listId: merge.listIds.size === 1 ? [...merge.listIds][0] : undefined,
        autoDerive: merge.autoDerive,
        threshold,
        maxPostAgeHours,
        maxPendingSignals,
      }

      const projectId = project.projectId

      const persistence: ScoutPersistence = {
        onSignal: (targetUri, scoutDid, interaction) => {
          void upsertScoutSignal(pool, projectId, targetUri, scoutDid, interaction).catch(() => {})
        },
        onTrigger: (targetUri) => {
          void deleteScoutSignals(pool, projectId, targetUri).catch(() => {})
        },
        onSweep: (targetUris) => {
          for (const uri of targetUris) {
            void deleteScoutSignals(pool, projectId, uri).catch(() => {})
          }
        },
      }

      const initialDids = cfg.scouts!.filter((s) => isActorDid(s))
      const counter = new ScoutSignalCounter(cfg, initialDids, () => false, persistence)
      next.set(projectId, counter)

      void loadScoutSignals(pool, projectId).then((signals) => {
        counter.loadSignals(signals)
      }).catch(() => {})

      applyScoutSet(counter, merge)
    }
    counters = next
  }

  function handleEngagement(
    actorDid: string,
    subjectUri: string,
    interaction: ScoutInteractionType,
  ): void {
    // Record engagement event for top_engagers (async, fire-and-forget)
    if (options.trackEngagementEvents !== false) {
      const collection = interaction === 'like' ? 'app.bsky.feed.like' : 'app.bsky.feed.repost'
      void isPostInPool(pool, subjectUri).then((inPool) => {
        if (inPool) void insertEngagementEvent(pool, subjectUri, actorDid, collection).catch(() => {})
      }).catch(() => {})
    }

    for (const [projectId, counter] of counters) {
      const trigger = counter.recordSignal(actorDid, subjectUri, interaction)
      if (trigger) {
        stats.triggers++
        void processTrigger(projectId, trigger)
      }
    }
    stats.signals++
  }

  async function processTrigger(projectId: string, trigger: ScoutTrigger): Promise<void> {
    try {
      // Check if already in pool (async check at trigger time)
      const existing = await getIngestedPost(pool, trigger.targetUri)
      if (existing) return

      const post = await options.fetchPost(trigger.targetUri)
      if (!post) return
      stats.fetched++

      const passed = await options.onDiscovered(post, projectId)
      if (passed) {
        stats.evalPass++
      } else {
        stats.evalFail++
      }
    } catch {
      stats.errors++
    }
  }

  function reload(newProjects: ProjectL1Config[]): void {
    lastConfigs = newProjects
    buildCounters(newProjects)
  }

  function sweep(): number {
    let total = 0
    for (const [projectId, counter] of counters) {
      const evicted = counter.sweep()
      total += evicted
      // DB sweep (async)
      if (evicted > 0) {
        const maxAge = (lastConfigs.find(c => c.projectId === projectId)?.scoutDiscovery?.maxPostAgeHours ?? 48) * 3600_000
        void sweepScoutSignals(pool, projectId, maxAge).catch(() => {})
      }
    }
    // Prune old engagement events (keep 7 days)
    void pruneEngagementEvents(pool, 168).catch(() => {})
    return total
  }

  async function refreshAutoDerived(): Promise<void> {
    for (const project of lastConfigs) {
      if (!project.enabled) continue
      const counter = counters.get(project.projectId)
      if (!counter) continue

      const merge = collectProjectScoutMerge(project)
      let dids = await resolveScoutDidSet(merge)
      if (merge.autoDerive) {
        const derived = await deriveScoutDids(
          pool,
          project.projectId,
          merge.autoDerive.source,
          merge.autoDerive.count,
        )
        if (derived.length > 0) {
          dids = [...new Set([...dids, ...derived])]
        }
      }
      if (dids.length > 0) counter.updateScouts(dids)
    }
  }

  return { handleEngagement, reload, stats, sweep, refreshAutoDerived }
}
