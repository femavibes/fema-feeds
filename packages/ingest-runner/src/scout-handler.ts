import type { FeedConfig, NormalizedPost, ProjectL1Config, ScoutDiscoveryConfig, ScoutInteractionType, L2RuleNode } from '@cfb/core-types'
import { scoutSourceEnabled } from '@cfb/core-types'
import { ScoutSignalCounter, type ScoutPersistence, type ScoutTrigger } from '@cfb/l2-worker'
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

/** Walk all nodes in a rule tree. */
function walkNodes(node: L2RuleNode): L2RuleNode[] {
  const out: L2RuleNode[] = [node]
  if (node.type === 'group') {
    for (const child of node.children) out.push(...walkNodes(child))
  }
  return out
}

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

  function buildCounters(configs: ProjectL1Config[]): void {
    const next = new Map<string, ScoutSignalCounter>()
    for (const project of configs) {
      if (!project.enabled) continue
      // Merge scouts from project config + feed-level scout nodes
      const allScouts = new Set<string>(project.scoutDiscovery?.scouts ?? [])
      let threshold = project.scoutDiscovery?.threshold
      let maxPostAgeHours = project.scoutDiscovery?.maxPostAgeHours
      let maxPendingSignals = project.scoutDiscovery?.maxPendingSignals

      let autoDerive = project.scoutDiscovery?.autoDerive

      // Collect scouts from feed sources + legacy match-tree scout nodes
      const projectFeeds = (options.feeds ?? []).filter((f) => f.projectId === project.projectId && f.enabled)
      for (const feed of projectFeeds) {
        const scoutSource = feed.sources?.scout
        if (scoutSourceEnabled(feed.sources)) {
          for (const did of scoutSource!.scouts ?? []) allScouts.add(did)
          if (!threshold) threshold = scoutSource!.threshold
          if (!maxPostAgeHours && scoutSource!.maxPostAgeHours) maxPostAgeHours = scoutSource!.maxPostAgeHours
          if (!autoDerive && scoutSource!.autoDerive) autoDerive = scoutSource!.autoDerive
        }
        for (const node of walkNodes(feed.match)) {
          if (node.type === 'scout') {
            for (const did of node.scouts ?? []) allScouts.add(did)
            if (!threshold) threshold = node.threshold
            if (!maxPostAgeHours && node.maxPostAgeHours) maxPostAgeHours = node.maxPostAgeHours
          }
        }
      }

      if (!threshold) continue
      if (allScouts.size === 0 && !autoDerive) continue

      const cfg: ScoutDiscoveryConfig = {
        enabled: true,
        scouts: [...allScouts],
        autoDerive,
        threshold,
        maxPostAgeHours,
        maxPendingSignals,
      }

      const projectId = project.projectId

      // Persistence callbacks
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

      // Filter to only resolved DIDs for the counter; resolve handles async after
      const resolvedDids = cfg.scouts!.filter((s) => isActorDid(s))
      const counter = new ScoutSignalCounter(cfg, resolvedDids, () => false, persistence)
      next.set(projectId, counter)

      // Load persisted signals from DB (non-blocking)
      void loadScoutSignals(pool, projectId).then((signals) => {
        counter.loadSignals(signals)
      }).catch(() => {})

      // Resolve handles in background
      const unresolved = cfg.scouts!.filter((s) => !isActorDid(s))
      if (unresolved.length > 0) {
        void resolveActorsToDids(unresolved).then((dids) => {
          const merged = [...new Set([...resolvedDids, ...dids.filter(Boolean)])]
          counter.updateScouts(merged)
        }).catch(() => {})
      }
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

      let autoDerive = project.scoutDiscovery?.autoDerive
      const manual = new Set(project.scoutDiscovery?.scouts ?? [])
      for (const feed of options.feeds ?? []) {
        if (feed.projectId !== project.projectId || !feed.enabled) continue
        const scoutSource = feed.sources?.scout
        if (scoutSourceEnabled(feed.sources) && scoutSource?.autoDerive) {
          autoDerive = autoDerive ?? scoutSource.autoDerive
          for (const did of scoutSource.scouts ?? []) manual.add(did)
        }
      }
      if (!autoDerive) continue
      const derived = await deriveScoutDids(pool, project.projectId, autoDerive.source, autoDerive.count)
      if (derived.length > 0) {
        const merged = [...new Set([...manual, ...derived])]
        counter.updateScouts(merged)
      }
    }
  }

  return { handleEngagement, reload, stats, sweep, refreshAutoDerived }
}
