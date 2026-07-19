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
import { matchedProjectIdsFromL1, processPostForFeeds, processSubstitution, resolveTargetPost, reevalPostInPool, seedFollowRingsFromFeeds, seedFollowRingsFromProjects, loadL1FollowRingsForProjects, loadIngestGateExtrasForProjects, hydrateRepostSubject } from '@cfb/l2-worker'
import { createScoutHandler, type ScoutHandler, type ScoutHandlerStats } from './scout-handler.js'
import { startFollowRingDiscoverPoll, type DiscoverPollStats } from './discover-poll.js'
import { FeedIntelligence } from '@cfb/feed-intelligence'
import { getIntelligenceSettings, getProjectIntelligenceDisabled } from '@cfb/feed-intelligence'

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
  scout: {
    signals: number
    triggers: number
    fetched: number
    evalPass: number
    evalFail: number
    errors: number
  } | null
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
  flushIntelligence: () => Promise<{ poolFlushed: number; feedFlushed: number; firehoseFlushed: number } | null>
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
  let scoutHandler: ScoutHandler | null = null
  let stopScoutSweep: (() => void) | null = null
  let stopDiscoverPoll: (() => void) | null = null
  let feedIntelligence: FeedIntelligence | null = null
  let backfillOk = 0
  let backfillErr = 0
  let getLabelStreamStats: (() => import('@cfb/label-stream').LabelStreamStats) | null = null
  let l2Evaluated = 0
  let l2Matched = 0
  let l2Written = 0
  let l2Errors = 0
  let lastSession: IngestLastSession | null = null
  /** Cap concurrent firehose handlers so the CT does not thrash (see CFB_INGEST_MAX_IN_FLIGHT). */
  let postInFlight = 0
  let postDropped = 0
  const maxPostInFlight = Math.max(
    8,
    Number(process.env.CFB_INGEST_MAX_IN_FLIGHT ?? 48) || 48,
  )

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
    { followRingDids: Record<string, string[] | ReadonlySet<string>>; authorListDids: Record<string, Set<string>>; mentionDids?: Record<string, Set<string>> }
  > = {}
  let globalPrefilterGate: CompiledIngestGate | null = null
  let globalPrefilterReject = 0
  let strictGateState: import('./strict-gate.js').StrictGateState = { gates: new Map() }

  /** Fetch a post from Bluesky API for substitution resolution. */
  async function fetchPostFromApi(uri: string): Promise<import('@cfb/core-types').NormalizedPost | null> {
    try {
      const res = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0&parentHeight=0`,
      )
      if (!res.ok) return null
      const data = await res.json() as { thread?: { post?: { uri: string; cid: string; author?: { did: string }; record?: Record<string, unknown>; indexedAt?: string } } }
      const post = data.thread?.post
      if (!post?.record) return null
      const { normalizeJetstreamPost } = await import('@cfb/post-normalize')
      return normalizeJetstreamPost({
        uri: post.uri,
        cid: post.cid,
        author: post.author?.did ?? '',
        record: post.record as import('@cfb/post-normalize').JetstreamPostEvent['record'],
        time: post.indexedAt,
      })
    } catch {
      return null
    }
  }

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
    // Reload scout handler with updated configs
    scoutHandler?.reload(configs)
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
      scout: scoutHandler ? { ...scoutHandler.stats } : null,
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
        // Bound concurrent firehose work — unbounded void/async grew RSS to ~1–2GB on a 4GB CT.
        if (postInFlight >= maxPostInFlight) {
          postDropped++
          if (postDropped === 1 || postDropped % 5_000 === 0) {
            console.error(
              `[ingest] post backpressure: dropped=${postDropped} inFlight=${postInFlight} max=${maxPostInFlight}`,
            )
          }
          return
        }
        postInFlight++
        void handlePost(post).finally(() => {
          postInFlight--
        })
        // Persist cursor periodically for reconnection resilience
        if (pool && seen % 1000 === 0) {
          const cursorUs = Date.now() * 1000
          void import('@cfb/storage-postgres').then(m => m.saveJetstreamCursor(pool, cursorUs)).catch(() => {})
        }
      },
    })

    async function handlePost(post: import('@cfb/core-types').NormalizedPost) {
      seen++
      // Feed intelligence: sample firehose (in-memory, non-blocking)
      feedIntelligence?.maybeSampleFirehose(post)
      // Global prefilter — reject before any per-project evaluation
      if (globalPrefilterGate && !evaluateIngestGate(globalPrefilterGate, post)) {
        globalPrefilterReject++
        return
      }
      // Split configs by mode
      const manualConfigs = configs.filter((c) => c.prefilterMode !== 'strict')
      const strictConfigs = configs.filter((c) => c.prefilterMode === 'strict')

      // Manual mode projects: standard L1 evaluation
      // Reposts arrive URI-only from Jetstream — eval the bare shell first (author / postKind /
      // follow_ring). Do NOT hydrate every firehose repost for keyword matching.
      const result = evaluateMergedL1(post, manualConfigs, {
        accountFollowRings,
        ingestGateExtrasByProject,
      })
      const manualMatched = getMatchedProjects(result)

      // Strict mode projects: only strict gate (no manual prefilter L1)
      const strictMatched = strictConfigs
        .filter((c) =>
          c.enabled &&
          postPassesStrictGate(
            post,
            c,
            strictGateState,
            ingestGateExtrasByProject[c.projectId],
          ),
        )
        .map((c) => ({ projectId: c.projectId, matched: true, matchedVia: 'jetstream' as const, trace: [] }))

      const matched = [...manualMatched, ...strictMatched]
      if (matched.length > 0) {
        l1Pass++
        // Only after a cheap L1 hit: fetch subject so Matches/L2 see the reshared post body.
        if (post.postKind === 'repost') {
          post = await hydrateRepostSubject(pool, post, fetchPostFromApi)
        }
        let resolved = post
        if (pool && enrichmentSettings && post.postKind !== 'repost') {
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
        // Feed intelligence: record pool signals (in-memory, non-blocking)
        feedIntelligence?.recordPoolPost(resolved, matched.map((m) => m.projectId))
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
                    if (r.matchedFeedIds.length > 0) {
                      feedIntelligence?.recordFeedPost(resolved, r.matchedFeedIds)
                    }
                  },
                  () => { l2Errors++ },
                )
                // Substitution: record votes and process ready targets
                void processSubstitution(
                  pool,
                  resolved,
                  matchedProjectIdsFromL1(matched),
                  feeds,
                ).then(
                  (sub) => {
                    if (sub.resolvedTargets.length === 0) return
                    for (const targetUri of sub.resolvedTargets) {
                      void resolveTargetPost(pool, targetUri, fetchPostFromApi).then(
                        (target) => {
                          if (!target) return
                          void persistL1Matches(pool, {
                            post: target,
                            matches: matched.map((m) => ({ ...m, matchedVia: 'jetstream' as const })),
                          }).then(
                            () => {
                              void processPostForFeeds(
                                pool,
                                target,
                                matchedProjectIdsFromL1(matched),
                                feeds,
                                { skipDiscovery: true },
                              ).then(
                                (r) => {
                                  l2Evaluated += r.evaluated
                                  l2Matched += r.matched
                                  l2Written += r.written
                                },
                                () => { l2Errors++ },
                              )
                            },
                            () => { saveErrors++ },
                          )
                        },
                        () => { /* target resolution failed — skip */ },
                      )
                    }
                  },
                  () => { /* substitution error — non-fatal */ },
                )
              }
            },
            () => { saveErrors++ },
          )
        }
      }
    }

    // Startup catch-up: refresh stale engagement for active feed candidates
    if (pool && enrichmentSettings?.enabled && enrichmentSettings.trackEngagement && feeds.length > 0) {
      const { catchUpFeedEngagement } = await import('./engagement-backfill.js')
      const activeFeedIds = feeds.filter((f) => f.enabled).map((f) => f.feedId)
      if (activeFeedIds.length > 0) {
        void catchUpFeedEngagement(pool, activeFeedIds).then(
          (r) => console.error(`[ingest] engagement catch-up: refreshed=${r.postsRefreshed} batches=${r.batches} errors=${r.errors}`),
          (e) => console.error('[ingest] engagement catch-up failed:', e),
        )
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
          onScoutSignal: (actorDid, subjectUri, collection) => {
            if (!scoutHandler) return
            const interaction = collection === 'app.bsky.feed.like' ? 'like' as const : 'repost' as const
            scoutHandler.handleEngagement(actorDid, subjectUri, interaction)
          },
        },
      )
      stopEngagement = engagement?.stop ?? null

      const refreshIntervalMs = Number(process.env.ENGAGEMENT_REFRESH_INTERVAL_SEC ?? 60) * 1000
      const refreshMaxAge = Number(process.env.ENGAGEMENT_REFRESH_MAX_AGE_HOURS ?? 48)
      const refresh = startEngagementRefresh(pool, refreshIntervalMs, refreshMaxAge, (postUri) => {
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
      })
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

    // Scout discovery handler
    if (pool && (configs.some((c) => c.scoutDiscovery?.enabled) || feeds.some((f) => f.enabled))) {
      scoutHandler = createScoutHandler(pool, configs, {
        feeds,
        fetchPost: fetchPostFromApi,
        onDiscovered: async (post, projectId) => {
          const projectMatches = [{ projectId, matched: true, matchedVia: 'jetstream' as const, trace: [] }]
          await persistL1Matches(pool, { post, matches: projectMatches })
          if (feeds.length === 0) return true
          const r = await processPostForFeeds(pool, post, [projectId], feeds)
          l2Evaluated += r.evaluated
          l2Matched += r.matched
          l2Written += r.written
          return r.matched > 0
        },
      })
      // Sweep stale signals every 10 minutes
      const sweepTimer = setInterval(() => scoutHandler?.sweep(), 10 * 60_000)
      // Refresh auto-derived scouts every 6 hours
      const deriveTimer = setInterval(() => { void scoutHandler?.refreshAutoDerived() }, 6 * 3600_000)
      // Initial auto-derive on startup
      void scoutHandler.refreshAutoDerived()
      stopScoutSweep = () => { clearInterval(sweepTimer); clearInterval(deriveTimer) }
    }

    // Feed intelligence
    if (pool) {
      const intConfig = await getIntelligenceSettings(pool).catch(() => null)
      const intDisabled = await getProjectIntelligenceDisabled(pool).catch(() => new Set<string>())
      feedIntelligence = new FeedIntelligence({ pool, config: intConfig ?? undefined })
      for (const pid of intDisabled) feedIntelligence.disableProject(pid)
      await feedIntelligence.start()
    }

    // Follow ring discover mode polling (pulls posts from ring members)
    if (pool) {
      const hasDiscoverRings = configs.some((c) => c.followRing?.role === 'discover') ||
        feeds.some((f) => f.enabled && JSON.stringify(f.match).includes('"discover"'))
      if (hasDiscoverRings) {
        const discoverPoll = startFollowRingDiscoverPoll(
          pool, configs, feeds,
          30 * 60_000, // poll every 30 minutes
          {
            onDiscovered: async (post, projectId) => {
              if (feeds.length === 0) return true
              const r = await processPostForFeeds(pool, post, [projectId], feeds)
              l2Evaluated += r.evaluated
              l2Matched += r.matched
              l2Written += r.written
              return r.matched > 0
            },
          },
        )
        stopDiscoverPoll = discoverPoll.stop
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
    stopScoutSweep?.()
    stopScoutSweep = null
    scoutHandler = null
    stopDiscoverPoll?.()
    stopDiscoverPoll = null
    if (feedIntelligence) {
      await feedIntelligence.stop()
      feedIntelligence = null
    }
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

  async function flushIntelligence() {
    if (!feedIntelligence) return null
    return feedIntelligence.flush()
  }

  return { start, stop, getStatus, flushIntelligence }
}
