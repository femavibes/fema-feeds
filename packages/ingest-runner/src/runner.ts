import type { ProjectL1Config, CompiledIngestGate } from '@cfb/core-types'
import { resolve } from 'node:path'
import { startJetstreamIngest } from '@cfb/ingest-jetstream'
import { compileAllProjects, compileProjectPrefilter } from '@cfb/l1-compile'
import { evaluateMergedL1, getMatchedProjects } from '@cfb/l1-eval'
import { evaluateIngestGate } from '@cfb/l1-filters'
import { buildStrictGates, postPassesStrictGate } from './strict-gate.js'
import { refreshAllProjectAuthorLists } from '@cfb/list-sources'
import { loadAllFeeds } from '@cfb/feed-config'
import {
  loadHydratedProjects,
  seedAuthorListsFromFeeds,
  seedAuthorListsFromProjects,
} from '@cfb/list-cache'
import { loadAllProjects } from '@cfb/project-config'
import { createPool, persistL1Matches, getGlobalPrefilter, getGlobalPurgeSettings, runPurgeSweep, listDeploymentCatalog, type Pool } from '@cfb/storage-postgres'
import {
  loadEnrichmentSettings,
  maybeEnrichAuthor,
  maybeResolveLabelerLabels,
  startEngagementIfEnabled,
  startLabelStreamIfEnabled,
  type EngagementHandlerStats,
} from './enrich.js'
import { backfillPostEngagement, startEngagementRefresh, type EngagementRefreshStats } from './engagement-backfill.js'
import type { EnrichmentSettings, FeedConfig } from '@cfb/core-types'
import { matchedProjectIdsFromL1, processPostForFeeds, reevalPostInPool, seedFollowRingsFromFeeds, seedFollowRingsFromProjects, loadL1FollowRingsForProjects, loadIngestGateExtrasForProjects } from '@cfb/l2-worker'

const DEFAULT_JETSTREAM_URL = 'wss://jetstream1.us-east.bsky.network/subscribe'

export interface IngestLastSession {
  startedAt: string
  stoppedAt: string
  jetstreamUrl: string
  seen: number
  l1Pass: number
  saved: number
  saveErrors: number
  l2: {
    evaluated: number
    matched: number
    written: number
    errors: number
  }
}

export interface IngestRunnerStatus {
  running: boolean
  startedAt: string | null
  jetstreamUrl: string | null
  lastSession: IngestLastSession | null
  seen: number
  l1Pass: number
  saved: number
  saveErrors: number
  enrichment: {
    enabled: boolean
    profileFetches: number
    profileErrors: number
    labelResolves: number
    labelResolveErrors: number
    engagementBumps: number
    engagementIgnored: number
    engagementErrors: number
    labelStream: {
      connections: number
      events: number
      labelsProcessed: number
      postsChanged: number
      errors: number
    }
  }
  l2: {
    evaluated: number
    matched: number
    written: number
    errors: number
  }
}

export interface IngestRunnerOptions {
  projectsDir: string
  feedsDir?: string
  jetstreamUrl?: string
  configReloadMs?: number
  /** Shared pool (API). If omitted, runner creates one when DATABASE_URL is set. */
  pool?: Pool | null
  /** When true, runner owns the pool and closes it on stop. */
  ownsPool?: boolean
}

export interface IngestRunner {
  start: () => Promise<IngestRunnerStatus>
  stop: () => Promise<IngestRunnerStatus>
  getStatus: () => IngestRunnerStatus
}

export function createIngestRunner(options: IngestRunnerOptions): IngestRunner {
  const jetstreamUrl = options.jetstreamUrl ?? process.env.JETSTREAM_URL ?? DEFAULT_JETSTREAM_URL
  const feedsDir =
    options.feedsDir ?? resolve(options.projectsDir, '../feeds')
  const configReloadMs = options.configReloadMs ?? Number(process.env.CONFIG_RELOAD_SEC ?? 60) * 1000

  let running = false
  let startedAt: string | null = null
  let stopJetstream: (() => void) | null = null
  let reloadTimer: ReturnType<typeof setInterval> | null = null
  let seen = 0
  let l1Pass = 0
  let saved = 0
  let saveErrors = 0
  let profileFetches = 0
  let profileErrors = 0
  let labelResolves = 0
  let labelResolveErrors = 0
  const engagementStats: EngagementHandlerStats = { bumps: 0, ignored: 0, errors: 0 }
  let enrichmentSettings: EnrichmentSettings | null = null
  let stopEngagement: (() => void) | null = null
  let stopEngagementRefresh: (() => void) | null = null
  let engagementRefreshStats: EngagementRefreshStats | null = null
  let stopLabelStream: (() => void) | null = null
  let stopPurgeSweep: (() => void) | null = null
  let backfillOk = 0
  let backfillErr = 0
  let getLabelStreamStats: (() => import('@cfb/label-stream').LabelStreamStats) | null = null
  let l2Evaluated = 0
  let l2Matched = 0
  let l2Written = 0
  let l2Errors = 0
  let lastSession: IngestLastSession | null = null

  const ownsPool = options.ownsPool ?? options.pool === undefined
  const pool: Pool | null =
    options.pool !== undefined
      ? options.pool
      : process.env.DATABASE_URL
        ? createPool()
        : null

  let configs: ProjectL1Config[] = []
  let feeds: FeedConfig[] = []
  let accountFollowRings: Record<string, string[]> = {}
  let ingestGateExtrasByProject: Record<
    string,
    { followRingDids: Record<string, string[]>; authorListDids: Record<string, string[]> }
  > = {}
  let globalPrefilterGate: CompiledIngestGate | null = null
  let globalPrefilterReject = 0
  let strictGateState: import('./strict-gate.js').StrictGateState = { gates: new Map() }

  async function reloadConfigs(): Promise<void> {
    const raw = await loadAllProjects(options.projectsDir)
    feeds = await loadAllFeeds(feedsDir)
    if (pool) {
      await seedAuthorListsFromProjects(pool, raw)
      await seedAuthorListsFromFeeds(pool, feeds)
      await seedFollowRingsFromFeeds(pool, feeds)
      await seedFollowRingsFromProjects(pool, raw)
      configs = await loadHydratedProjects(pool, raw)
      accountFollowRings = await loadL1FollowRingsForProjects(pool, configs)
      ingestGateExtrasByProject = await loadIngestGateExtrasForProjects(pool, configs, feeds)
      // Load global prefilter
      const gp = await getGlobalPrefilter(pool)
      if (gp?.match?.children?.length) {
        const compiled = compileProjectPrefilter('__global__', gp)
        globalPrefilterGate = compiled.ingestGate
      } else {
        globalPrefilterGate = null
      }
    } else {
      configs = await refreshAllProjectAuthorLists(raw)
      globalPrefilterGate = null
    }
    compileAllProjects(configs)
    const hasStrictProjects = configs.some((c) => c.prefilterMode === 'strict' && c.enabled)
    const logicBlockPkgs = hasStrictProjects && pool ? await listDeploymentCatalog(pool).catch(() => []) : []
    strictGateState = buildStrictGates(configs, feeds, logicBlockPkgs)
  }

  function resetSessionCounters(): void {
    seen = 0
    l1Pass = 0
    saved = 0
    saveErrors = 0
    profileFetches = 0
    profileErrors = 0
    labelResolves = 0
    labelResolveErrors = 0
    engagementStats.bumps = 0
    engagementStats.ignored = 0
    engagementStats.errors = 0
    l2Evaluated = 0
    l2Matched = 0
    l2Written = 0
    l2Errors = 0
  }

  function getStatus(): IngestRunnerStatus {
    return {
      running,
      startedAt,
      jetstreamUrl: running ? jetstreamUrl : null,
      lastSession,
      seen,
      l1Pass,
      saved,
      saveErrors,
      enrichment: {
        enabled: enrichmentSettings?.enabled ?? false,
        profileFetches,
        profileErrors,
        labelResolves,
        labelResolveErrors,
        engagementBumps: engagementStats.bumps,
        engagementIgnored: engagementStats.ignored,
        engagementErrors: engagementStats.errors,
        labelStream: (() => {
          const s = getLabelStreamStats?.()
          return {
            connections: s?.connections ?? 0,
            events: s?.events ?? 0,
            labelsProcessed: s?.labelsProcessed ?? 0,
            postsChanged: s?.postsChanged ?? 0,
            errors: s?.errors ?? 0,
          }
        })(),
      },
      l2: {
        evaluated: l2Evaluated,
        matched: l2Matched,
        written: l2Written,
        errors: l2Errors,
      },
    }
  }

  async function start(): Promise<IngestRunnerStatus> {
    if (running) return getStatus()

    resetSessionCounters()
    await reloadConfigs()

    if (pool) {
      reloadTimer = setInterval(() => {
        void reloadConfigs().catch(() => undefined)
      }, configReloadMs)
    }

    if (pool) {
      enrichmentSettings = await loadEnrichmentSettings(pool)
    }

    const { stop } = await startJetstreamIngest(jetstreamUrl, {
      onPost: (post) => {
        void handlePost(post)
      },
    })

    async function handlePost(post: import('@cfb/core-types').NormalizedPost) {
      seen++
      let resolved = post
      if (pool && enrichmentSettings) {
        resolved = await maybeResolveLabelerLabels(pool, post, enrichmentSettings).then(
          (p) => {
            if (p.labelerLabels.length > post.labelerLabels.length) labelResolves++
            return p
          },
          () => {
            labelResolveErrors++
            return post
          },
        )
      }
      // Global prefilter — reject before any per-project evaluation
      if (globalPrefilterGate && !evaluateIngestGate(globalPrefilterGate, resolved)) {
        globalPrefilterReject++
        return
      }
      // Split configs by mode
      const manualConfigs = configs.filter((c) => c.prefilterMode !== 'strict')
      const strictConfigs = configs.filter((c) => c.prefilterMode === 'strict')

      // Manual mode projects: standard L1 evaluation
      const result = evaluateMergedL1(resolved, manualConfigs, {
        accountFollowRings,
        ingestGateExtrasByProject,
      })
      const manualMatched = getMatchedProjects(result)

      // Strict mode projects: only strict gate (no manual prefilter L1)
      const strictMatched = strictConfigs
        .filter((c) => c.enabled && postPassesStrictGate(resolved, c, strictGateState))
        .map((c) => ({ projectId: c.projectId, matched: true, matchedVia: 'jetstream' as const, trace: [] }))

      const matched = [...manualMatched, ...strictMatched]
      if (matched.length > 0) {
        l1Pass++
        if (pool) {
          persistL1Matches(pool, { post: resolved, matches: matched }).then(
            () => {
              saved++
              if (enrichmentSettings?.enabled) {
                void backfillPostEngagement(pool, resolved.uri).then(
                  (ok) => { if (ok) backfillOk++; else backfillErr++ },
                  () => { backfillErr++ },
                )
                void maybeEnrichAuthor(pool, resolved.authorDid, enrichmentSettings).then((r) => {
                  if (r === 'ok') profileFetches++
                  if (r === 'error') profileErrors++
                })
              }
              if (feeds.length > 0) {
                void processPostForFeeds(
                  pool,
                  resolved,
                  matchedProjectIdsFromL1(matched),
                  feeds,
                ).then(
                  (r) => {
                    l2Evaluated += r.evaluated
                    l2Matched += r.matched
                    l2Written += r.written
                  },
                  () => { l2Errors++ },
                )
              }
            },
            () => { saveErrors++ },
          )
        }
      }
    }

    if (pool && enrichmentSettings) {
      const engagement = await startEngagementIfEnabled(
        pool,
        enrichmentSettings,
        jetstreamUrl,
        engagementStats,
        {
          onBumped: (postUri) => {
            if (feeds.length === 0) return
            void reevalPostInPool(pool, postUri, feeds).then(
              (r) => {
                if (!r) return
                l2Evaluated += r.evaluated
                l2Matched += r.matched
                l2Written += r.written
              },
              () => { l2Errors++ },
            )
          },
        },
      )
      stopEngagement = engagement?.stop ?? null

      const refreshIntervalMs = Number(process.env.ENGAGEMENT_REFRESH_INTERVAL_SEC ?? 60) * 1000
      const refreshMaxAge = Number(process.env.ENGAGEMENT_REFRESH_MAX_AGE_HOURS ?? 48)
      const refresh = startEngagementRefresh(pool, refreshIntervalMs, refreshMaxAge)
      stopEngagementRefresh = refresh.stop
      engagementRefreshStats = refresh.getStats()

      const labelStream = await startLabelStreamIfEnabled(pool, enrichmentSettings, {
        projectsDir: options.projectsDir,
        feedsDir,
      })
      stopLabelStream = labelStream?.stop ?? null
      getLabelStreamStats = labelStream?.getStats ?? null
    }

    // Start purge sweep timer (runs regardless of enrichment)
    if (pool) {
      const purgeSettings = await getGlobalPurgeSettings(pool)
      if (purgeSettings.enabled && purgeSettings.policy.rules.length > 0) {
        const purgeMs = purgeSettings.sweepIntervalMinutes * 60 * 1000
        const purgeTimer = setInterval(() => {
          void runPurgeSweep(pool).catch((e) =>
            console.error('[purge] sweep error', e),
          )
        }, purgeMs)
        stopPurgeSweep = () => clearInterval(purgeTimer)
      }
    }

    stopJetstream = stop
    running = true
    startedAt = new Date().toISOString()
    return getStatus()
  }

  async function stop(): Promise<IngestRunnerStatus> {
    if (!running) return getStatus()

    stopJetstream?.()
    stopJetstream = null
    stopEngagement?.()
    stopEngagement = null
    stopEngagementRefresh?.()
    stopEngagementRefresh = null
    stopLabelStream?.()
    stopLabelStream = null
    getLabelStreamStats = null
    stopPurgeSweep?.()
    stopPurgeSweep = null
    if (reloadTimer) {
      clearInterval(reloadTimer)
      reloadTimer = null
    }

    if (startedAt) {
      lastSession = {
        startedAt,
        stoppedAt: new Date().toISOString(),
        jetstreamUrl,
        seen,
        l1Pass,
        saved,
        saveErrors,
        l2: {
          evaluated: l2Evaluated,
          matched: l2Matched,
          written: l2Written,
          errors: l2Errors,
        },
      }
    }

    running = false
    startedAt = null

    if (ownsPool && pool) {
      await new Promise((r) => setTimeout(r, 300))
      await pool.end().catch(() => undefined)
    }

    return getStatus()
  }

  return { start, stop, getStatus }
}
