import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { registerStaticServing } from './static-serve.js'
import { config as loadEnv } from 'dotenv'
import type { ProjectL1Config, NormalizedPost } from '@cfb/core-types'
import { compileAllProjects, finalizeProjectForSave, emptyPrefilter } from '@cfb/l1-compile'
import { evaluateProjectL1 } from '@cfb/l1-eval'
import {
  loadAllProjects,
  loadProject,
  saveProject,
  deleteProject,
} from '@cfb/project-config'
import { loadFeedsForProject, loadAllFeeds, deleteFeed } from '@cfb/feed-config'
import {
  getAllAuthorListCache,
  getAuthorListCache,
  getIngestStats,
  createPool,
  deleteProjectData,
  deleteFeedCandidatesForFeeds,
  getEnrichmentSettings,
  saveEnrichmentSettings,
  getFeedgenSettings,
  saveFeedgenSettings,
  resolveFeedgenSettings,
  feedgenSettingsFromEnv,
  getUserFeedgenSettings,
  saveUserFeedgenSettings,
  resolveUserFeedgenSettings,
  getUser,
  listUsersWithDuckDns,
  listLabelerSources,
  upsertLabelerSource,
  setLabelerEnabled,
  deleteLabelerSource,
  listEnabledLabelerDids,
  type Pool,
} from '@cfb/storage-postgres'
import {
  pollDueAuthorLists,
  prepareProjectsForIngest,
  refreshAuthorListToCache,
  hydrateProjectsWithCache,
  cacheMapFromRows,
} from '@cfb/list-cache'
import { refreshAllProjectAuthorLists } from '@cfb/list-sources'
import { createIngestRunner, runProjectDryRun, isDryRunInProgress, runIngestSmokeTest, isIngestSmokeTestInProgress, getLastIngestSmokeTestResult, runIngestStressTest, isIngestStressTestInProgress, getLastIngestStressTestResult, type IngestRunner } from '@cfb/ingest-runner'
import {
  getLatestIngestSmokeTest,
  getLatestIngestStressTest,
  getIngestStressTest,
  insertIngestSmokeTest,
  insertIngestStressTest,
  listIngestSmokeTests,
  listIngestStressTests,
  purgeIngestStressTest,
} from '@cfb/storage-postgres'
import { pollDueFollowRings } from '@cfb/l2-worker'
import { resolveLabelerLabelsForPost } from '@cfb/label-resolve'
import { normalizeJetstreamPost, type JetstreamPostEvent } from '@cfb/post-normalize'
import { registerFeedRoutes } from './feeds.js'
import { registerFeedgenRoutes } from './feedgen.js'
import { registerAuthRoutes, createAuthMiddleware } from './auth/routes.js'
import { registerLogicBlockRoutes } from './logic-blocks.js'
import { registerSortPackRoutes } from './sort-packs.js'
import { registerPluginRoutes } from './plugins.js'
import { ensureDemoInjectorPackage, ensureDemoRankerPackage } from './plugin-bootstrap.js'
import { registerMarketplaceVerificationRoutes } from './marketplace-verification.js'
import { registerMarketplaceModerationRoutes } from './marketplace-moderation.js'
import { feedgenEnvFromProcess } from './feedgen-env.js'
import { requireMaster, requireMasterIfMultiUser } from './require-master.js'
import {
  bootstrapDeploymentFromEnv,
  bootstrapMasterFromEnv,
} from '@cfb/storage-postgres'
import {
  filterProjectsForUser,
  getUserDid,
  assertProjectAccess,
  stampProjectForSave,
} from './request-user.js'
import { isDuckDnsConfigured, duckdnsPublicUrl, inferFeedgenPublishMode, publicHostForSlug } from '@cfb/core-types'
import {
  applyDuckDnsSync,
  maskFeedgenSettings,
  mergeFeedgenSettings,
} from './duckdns.js'
import { applyCloudflareCheck } from './cloudflare.js'
import {
  cloudflareTunnelEnvFromProcess,
  isHostedHostnameAvailable,
  pickAvailableHostedSlug,
  provisionHomeTunnelHostname,
  slugFromHandle,
} from './cloudflare-tunnel.js'
import {
  deploymentDnsEnvFromProcess,
  dnsRecordNameForSlug,
  upsertCloudflareARecord,
  type DeploymentRegisterBody,
} from './deployment-register.js'
import { seedFollowRingsFromProjects } from '@cfb/l2-worker'
import { resolvePostInput } from '@cfb/post-resolve'
import { resolveListMemberProfiles, resolveActorProfiles } from './list-members.js'

async function hydrateProjectDraft(
  project: ProjectL1Config,
  pool: Pool | null,
): Promise<ProjectL1Config> {
  if (pool) {
    const rows = await getAllAuthorListCache(pool)
    const map = cacheMapFromRows(rows.map((r) => ({ listId: r.listId, dids: r.dids })))
    return hydrateProjectsWithCache([project], map)[0] ?? project
  }
  const [refreshed] = await refreshAllProjectAuthorLists([project])
  return refreshed ?? project
}

const root = resolve(import.meta.dirname, '../../..')
loadEnv({ path: resolve(root, '.env') })

const projectsDir = resolve(root, 'config/projects')
const feedsDir = resolve(root, 'config/feeds')
const defaultFixture = resolve(root, 'fixtures/post-with-video.json')

export type ApiApplication = ReturnType<typeof createApp>

export function createApp(options?: {
  pool?: Pool | null
  projectsDir?: string
  feedsDir?: string
  ingest?: IngestRunner
  bootId?: string
}) {
  const bootId = options?.bootId ?? randomUUID()
  const startedAt = new Date().toISOString()
  const dir = options?.projectsDir ?? projectsDir
  const feedDir = options?.feedsDir ?? feedsDir
  const pool = options?.pool !== undefined ? options.pool : (process.env.DATABASE_URL ? createPool() : null)
  const ingest =
    options?.ingest ??
    createIngestRunner({ projectsDir: dir, feedsDir: feedDir, pool, ownsPool: false })
  const app = new Hono()

  const corsOrigins = [
    process.env.OAUTH_PUBLIC_URL?.trim().replace(/\/$/, ''),
    process.env.FEEDGEN_PUBLIC_URL?.trim().replace(/\/$/, ''),
    process.env.WEB_ORIGIN?.trim().replace(/\/$/, ''),
    'http://localhost:5173',
  ].filter(Boolean) as string[]

  app.use('/api/*', cors({
    origin: (origin) => {
      if (!origin) return corsOrigins[0] ?? 'http://localhost:5173'
      if (corsOrigins.includes(origin)) return origin
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return origin
      return corsOrigins[0] ?? origin
    },
    credentials: true,
  }))
  app.use('/xrpc/*', cors())

  app.onError((err, c) => {
    console.error('[api]', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return c.json({ error: message }, 500)
  })

  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      bootId,
      startedAt,
      capabilities: {
        feedDraftLifecycle: true,
        feedPublishUnpublish: true,
        feedVersionHistory: true,
      },
    }),
  )

  registerAuthRoutes(app, pool, root)
  app.use('/api/*', createAuthMiddleware(pool))
  registerLogicBlockRoutes(app, pool)
  registerSortPackRoutes(app, pool)
  registerPluginRoutes(app, pool)

  if (pool) {
    void ensureDemoInjectorPackage(pool)
    void ensureDemoRankerPackage(pool)
  }
  registerMarketplaceVerificationRoutes(app, pool)
  registerMarketplaceModerationRoutes(app, pool)

  if (pool) {
    void bootstrapDeploymentFromEnv(pool)
    void bootstrapMasterFromEnv(pool)
  }

  /** VPS provisioning: register slug + IP → stable https://slug.feeds.example.com (DNS broker, not HTTP proxy). */
  app.post('/api/cfb/deployments/register', async (c) => {
    const secret = process.env.CFB_DEPLOYMENT_REGISTRATION_SECRET?.trim()
    if (!secret) {
      return c.json({ error: 'Deployment registration not enabled on this host' }, 503)
    }
    const auth = c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    const body = (await c.req.json<DeploymentRegisterBody>().catch(() => null)) ?? {}
    const token = body.token ?? auth
    if (!token || token !== secret) {
      return c.json({ error: 'Invalid deployment token' }, 401)
    }

    const slug = body.slug?.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
    const publicIp = body.publicIp?.trim()
    if (!slug || slug.length < 3 || slug.length > 32) {
      return c.json({ error: 'slug must be 3–32 alphanumeric characters' }, 400)
    }
    if (!publicIp || !/^\d{1,3}(\.\d{1,3}){3}$/.test(publicIp)) {
      return c.json({ error: 'publicIp must be a valid IPv4 address' }, 400)
    }

    const dnsEnv = deploymentDnsEnvFromProcess()
    if (!dnsEnv) {
      return c.json({ error: 'DNS not configured (CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID)' }, 503)
    }

    const recordName = dnsRecordNameForSlug(slug, dnsEnv.dnsBase)
    const publicHost = publicHostForSlug(slug, dnsEnv.dnsBase)
    const proxied = Boolean(body.proxied)

    try {
      await upsertCloudflareARecord(dnsEnv, recordName, publicIp, proxied)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'DNS update failed'
      return c.json({ error: message }, 502)
    }

    return c.json({
      slug,
      publicHost,
      publicUrl: `https://${publicHost}`,
      publicIp,
      proxied,
    })
  })

  app.post('/api/dev/restart', async (c) => {
    const gate = await requireMasterIfMultiUser(c, pool)
    if (!('ok' in gate)) return gate

    const body = (await c.req.json<{ target?: string }>().catch(() => null)) ?? {}
    const target = body.target ?? 'all'
    if (target !== 'api' && target !== 'web' && target !== 'all') {
      return c.json({ error: 'target must be api, web, or all' }, 400)
    }

    await ingest.stop().catch(() => undefined)

    const script = resolve(root, 'scripts/restart-dev.ps1')
    spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Target', target],
      { detached: true, stdio: 'ignore', cwd: root },
    ).unref()

    const message =
      target === 'web'
        ? 'Restarting web dev server — reload this page in a few seconds.'
        : target === 'api'
          ? 'Restarting API — wait a few seconds, then refresh.'
          : 'Restarting API and web — wait a few seconds, then reload.'

    return c.json({ ok: true, target, message })
  })

  async function resolveLastSmokeTest() {
    if (pool) {
      try {
        const fromDb = await getLatestIngestSmokeTest(pool)
        if (fromDb) return fromDb
      } catch (err) {
        console.warn('[api] load latest smoke test failed', err)
      }
    }
    return getLastIngestSmokeTestResult()
  }

  async function resolveLastStressTest() {
    if (pool) {
      try {
        const fromDb = await getLatestIngestStressTest(pool)
        if (fromDb) return fromDb
      } catch (err) {
        console.warn('[api] load latest stress test failed', err)
      }
    }
    return getLastIngestStressTestResult()
  }

  app.get('/api/ingest/status', async (c) =>
    c.json({
      ...ingest.getStatus(),
      lastSmokeTest: await resolveLastSmokeTest(),
      lastStressTest: await resolveLastStressTest(),
    }),
  )

  app.get('/api/ingest/smoke-tests', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const limit = Number.parseInt(c.req.query('limit') ?? '10', 10)
    try {
      const tests = await listIngestSmokeTests(pool, limit)
      return c.json({ tests })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load smoke tests'
      return c.json({ error: message }, 500)
    }
  })

  app.post('/api/ingest/smoke-test', async (c) => {
    const gate = await requireMasterIfMultiUser(c, pool)
    if (!('ok' in gate)) return gate

    const body =
      (await c.req.json<{ durationSec?: number; ignorePrefilters?: boolean }>().catch(() => null)) ??
      {}
    const durationSec = body.durationSec ?? 60
    const ignorePrefilters = body.ignorePrefilters === true

    if (ingest.getStatus().running) {
      return c.json({ error: 'Stop live ingest before running a smoke test' }, 409)
    }
    if (isDryRunInProgress()) {
      return c.json({ error: 'Wait for the project dry run to finish' }, 409)
    }
    if (isIngestSmokeTestInProgress()) {
      return c.json({ error: 'A smoke test is already in progress' }, 409)
    }
    if (isIngestStressTestInProgress()) {
      return c.json({ error: 'Wait for the ingest stress test to finish' }, 409)
    }

    try {
      const result = await runIngestSmokeTest({
        projectsDir: dir,
        feedsDir: feedDir,
        durationSec,
        ignorePrefilters,
        pool,
        isIngestRunning: () => ingest.getStatus().running,
      })
      if (pool) {
        try {
          const saved = await insertIngestSmokeTest(pool, result)
          return c.json(saved)
        } catch (err) {
          console.error('[api] persist smoke test failed', err)
        }
      }
      return c.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Smoke test failed'
      const status = message.includes('already') || message.includes('Stop live') ? 409 : 500
      return c.json({ error: message }, status)
    }
  })

  app.get('/api/ingest/stress-tests', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const limit = Number.parseInt(c.req.query('limit') ?? '10', 10)
    try {
      const tests = await listIngestStressTests(pool, limit)
      return c.json({ tests })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load stress tests'
      return c.json({ error: message }, 500)
    }
  })

  app.post('/api/ingest/stress-test', async (c) => {
    const gate = await requireMasterIfMultiUser(c, pool)
    if (!('ok' in gate)) return gate

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    const body =
      (await c.req.json<{ durationSec?: number; ignorePrefilters?: boolean }>().catch(() => null)) ??
      {}
    const durationSec = body.durationSec ?? 60
    const ignorePrefilters = body.ignorePrefilters === true

    if (ingest.getStatus().running) {
      return c.json({ error: 'Stop live ingest before running a stress test' }, 409)
    }
    if (isDryRunInProgress()) {
      return c.json({ error: 'Wait for the project dry run to finish' }, 409)
    }
    if (isIngestSmokeTestInProgress()) {
      return c.json({ error: 'Wait for the ingest smoke test to finish' }, 409)
    }
    if (isIngestStressTestInProgress()) {
      return c.json({ error: 'A stress test is already in progress' }, 409)
    }

    try {
      const result = await runIngestStressTest({
        projectsDir: dir,
        feedsDir: feedDir,
        durationSec,
        ignorePrefilters,
        pool,
        isIngestRunning: () => ingest.getStatus().running,
      })
      try {
        const saved = await insertIngestStressTest(pool, {
          durationSec: result.durationSec,
          finishedAt: result.finishedAt,
          ignorePrefilters: result.ignorePrefilters,
          seen: result.seen,
          l1Pass: result.l1Pass,
          saved: result.saved,
          saveErrors: result.saveErrors,
          backlog: result.backlog,
          passRatePct: result.passRatePct,
          writeSuccessPct: result.writeSuccessPct,
          postsPerSec: result.postsPerSec,
          savesPerSec: result.savesPerSec,
          enabledProjects: result.enabledProjects,
          byProject: result.byProject,
          savedAssociations: result.savedAssociations,
          savedPostUris: result.savedPostUris,
        })
        return c.json(saved)
      } catch (err) {
        console.error('[api] persist stress test failed', err)
        return c.json(result)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Stress test failed'
      const status = message.includes('already') || message.includes('Stop live') ? 409 : 500
      return c.json({ error: message }, status)
    }
  })

  app.post('/api/ingest/stress-tests/:id/purge', async (c) => {
    const gate = await requireMasterIfMultiUser(c, pool)
    if (!('ok' in gate)) return gate

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    const id = Number.parseInt(c.req.param('id'), 10)
    if (!Number.isFinite(id)) return c.json({ error: 'Invalid stress test id' }, 400)

    if (ingest.getStatus().running) {
      return c.json({ error: 'Stop live ingest before purging stress test posts' }, 409)
    }
    if (isIngestStressTestInProgress()) {
      return c.json({ error: 'Wait for the ingest stress test to finish' }, 409)
    }

    try {
      const existing = await getIngestStressTest(pool, id)
      if (!existing) return c.json({ error: 'Stress test run not found' }, 404)

      const result = await purgeIngestStressTest(pool, id)
      return c.json({
        ...result,
        stressTest: await getIngestStressTest(pool, id),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to purge stress test posts'
      const status =
        message.includes('not found') ? 404
        : message.includes('already purged') || message.includes('no tracked posts') ? 409
        : 500
      return c.json({ error: message }, status)
    }
  })

  app.post('/api/ingest/start', async (c) => {
    const gate = await requireMasterIfMultiUser(c, pool)
    if (!('ok' in gate)) return gate

    if (isDryRunInProgress()) {
      return c.json({ error: 'Wait for dry run to finish before starting ingest' }, 409)
    }
    if (isIngestSmokeTestInProgress()) {
      return c.json({ error: 'Wait for the ingest smoke test to finish before starting ingest' }, 409)
    }
    if (isIngestStressTestInProgress()) {
      return c.json({ error: 'Wait for the ingest stress test to finish before starting ingest' }, 409)
    }
    try {
      const status = await ingest.start()
      return c.json({
        ...status,
        lastSmokeTest: await resolveLastSmokeTest(),
        lastStressTest: await resolveLastStressTest(),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start ingest'
      return c.json({ error: message }, 500)
    }
  })

  app.post('/api/ingest/stop', async (c) => {
    const gate = await requireMasterIfMultiUser(c, pool)
    if (!('ok' in gate)) return gate

    const status = await ingest.stop()
    return c.json({
      ...status,
      lastSmokeTest: await resolveLastSmokeTest(),
      lastStressTest: await resolveLastStressTest(),
    })
  })

  app.get('/api/projects', async (c) => {
    try {
      const projects = filterProjectsForUser(await loadAllProjects(dir), getUserDid(c))
      return c.json({ projects })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load projects'
      console.error('[api] GET /api/projects', err)
      return c.json({ error: message }, 500)
    }
  })

  app.post('/api/projects', async (c) => {
    const body = await c.req.json<ProjectL1Config>()
    if (!body.projectId?.trim()) {
      return c.json({ error: 'projectId is required' }, 400)
    }
    try {
      await loadProject(dir, body.projectId)
      return c.json({ error: 'project already exists' }, 409)
    } catch {
      // not found — ok to create
    }
    const project = stampProjectForSave(
      finalizeProjectForSave({
        ...body,
        projectId: body.projectId.trim(),
        name: body.name?.trim() || body.projectId,
        enabled: body.enabled ?? true,
        postKinds: body.postKinds ?? ['root', 'quote', 'reply'],
        prefilter: body.prefilter ?? emptyPrefilter(),
      }),
      getUserDid(c),
    )
    await saveProject(dir, project)
    if (pool) {
      const projects = await loadAllProjects(dir)
      const feeds = await loadAllFeeds(feedDir)
      await prepareProjectsForIngest(pool, projects, feeds)
      await seedFollowRingsFromProjects(pool, projects)
    }
    return c.json({ project }, 201)
  })

  // Feed routes before /api/projects/:id (more specific paths first).
  registerFeedRoutes(app, { feedsDir: feedDir, projectsDir: dir, pool })
  registerFeedgenRoutes(app, {
    feedsDir: feedDir,
    projectsDir: dir,
    pool,
  })

  app.get('/api/projects/:id', async (c) => {
    try {
      const project = await loadProject(dir, c.req.param('id'))
      const access = assertProjectAccess(project, getUserDid(c))
      if (!access.ok) return c.json({ error: 'not found' }, access.status)
      return c.json({ project })
    } catch {
      return c.json({ error: 'not found' }, 404)
    }
  })

  app.put('/api/projects/:id', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json<ProjectL1Config>()
    if (body.projectId !== id) {
      return c.json({ error: 'projectId must match URL' }, 400)
    }
    let existing: ProjectL1Config
    try {
      existing = await loadProject(dir, id)
    } catch {
      return c.json({ error: 'not found' }, 404)
    }
    const access = assertProjectAccess(existing, getUserDid(c))
    if (!access.ok) return c.json({ error: 'not found' }, access.status)
    const project = stampProjectForSave(
      finalizeProjectForSave(body, existing),
      getUserDid(c),
    )
    await saveProject(dir, project)
    if (pool) {
      const projects = await loadAllProjects(dir)
      const feeds = await loadAllFeeds(feedDir)
      try {
        await prepareProjectsForIngest(pool, projects, feeds)
        await seedFollowRingsFromProjects(pool, projects)
      } catch (err) {
        console.error('[api] PUT /api/projects list cache seed failed', err)
      }
    }
    return c.json({ project })
  })

  app.delete('/api/projects/:id', async (c) => {
    const id = c.req.param('id')
    let existing: ProjectL1Config
    try {
      existing = await loadProject(dir, id)
    } catch {
      return c.json({ error: 'not found' }, 404)
    }
    const access = assertProjectAccess(existing, getUserDid(c))
    if (!access.ok) return c.json({ error: 'not found' }, access.status)
    await deleteProject(dir, id)
    const projectFeeds = await loadFeedsForProject(feedDir, id)
    for (const feed of projectFeeds) {
      await deleteFeed(feedDir, feed.feedId)
    }
    if (pool) {
      await deleteFeedCandidatesForFeeds(
        pool,
        projectFeeds.map((f) => f.feedId),
      )
      await deleteProjectData(pool, id)
    }
    return c.json({ ok: true, projectId: id })
  })

  app.post('/api/projects/:id/preview', async (c) => {
    const id = c.req.param('id')

    const body = (await c.req.json<{
      post?: string
      fixturePath?: string
      event?: JetstreamPostEvent
      project?: ProjectL1Config
    }>().catch(() => null)) ?? {}

    let project: ProjectL1Config
    if (body.project?.projectId === id) {
      project = await hydrateProjectDraft(body.project, pool)
    } else {
      try {
        project = await loadProject(dir, id)
      } catch {
        return c.json({ error: 'not found' }, 404)
      }
    }

    let post: NormalizedPost
    try {
      if (body.post?.trim()) {
        post = await resolvePostInput(body.post.trim())
      } else if (body.event) {
        post = normalizeJetstreamPost(body.event)
      } else {
        const fixturePath = body.fixturePath
          ? resolve(body.fixturePath)
          : defaultFixture
        const raw = await readFile(fixturePath, 'utf8')
        post = normalizeJetstreamPost(JSON.parse(raw) as JetstreamPostEvent)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load post'
      return c.json({ error: message }, 400)
    }

    compileAllProjects([project])
    if (pool) {
      const labelerDids = await listEnabledLabelerDids(pool)
      if (labelerDids.length > 0) {
        post = await resolveLabelerLabelsForPost(post, { labelerDids }).catch(() => post)
      }
    }
    const result = evaluateProjectL1(post, project)
    return c.json({
      post: { uri: post.uri, authorDid: post.authorDid, text: post.text.slice(0, 200) },
      result,
    })
  })

  app.post('/api/projects/:id/dry-run', async (c) => {
    const id = c.req.param('id')
    const body = (await c.req.json<{ durationSec?: number; project?: ProjectL1Config }>().catch(
      () => null,
    )) ?? {}
    const durationSec = body.durationSec ?? 60

    if (ingest.getStatus().running) {
      return c.json({ error: 'Stop live ingest before running a dry run' }, 409)
    }
    if (isIngestSmokeTestInProgress()) {
      return c.json({ error: 'Wait for the ingest smoke test to finish' }, 409)
    }
    if (isIngestStressTestInProgress()) {
      return c.json({ error: 'Wait for the ingest stress test to finish' }, 409)
    }

    try {
      const result = await runProjectDryRun({
        projectsDir: dir,
        projectId: id,
        durationSec,
        pool,
        project: body.project?.projectId === id
          ? await hydrateProjectDraft(body.project, pool)
          : undefined,
        isIngestRunning: () => ingest.getStatus().running,
      })
      return c.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Dry run failed'
      const status = message.includes('already') ? 409 : 500
      return c.json({ error: message }, status)
    }
  })

  app.get('/api/stats', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    try {
      const stats = await getIngestStats(pool)
      return c.json(stats)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Database unavailable'
      console.error('[api] GET /api/stats', err)
      return c.json({ error: message }, 503)
    }
  })

  app.get('/api/lists/cache', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    try {
      const rows = await getAllAuthorListCache(pool)
      return c.json({
        lists: rows.map((r) => {
          const source = r.sourceJson as {
            sources?: Array<{ type: string; uri?: string }>
            feedOnly?: boolean
          }
          const remoteSource = source.sources?.find(
            (s) => s.type === 'bluesky_list' || s.type === 'bluesky_starter_pack',
          )
          return {
            listId: r.listId,
            projectId: r.projectId,
            memberCount: r.memberCount,
            graphName: r.graphName,
            refreshedAt: r.refreshedAt?.toISOString() ?? null,
            nextPollAt: r.nextPollAt?.toISOString() ?? null,
            remotePollKey: r.remotePollKey,
            graphUri: remoteSource && 'uri' in remoteSource ? remoteSource.uri : null,
            feedOnly: source.feedOnly === true,
          }
        }),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Database unavailable'
      console.error('[api] GET /api/lists/cache', err)
      return c.json({ error: message }, 503)
    }
  })

  app.get('/api/author-profiles', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const raw = c.req.query('actors') ?? c.req.query('dids') ?? ''
    const actors = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (actors.length === 0) return c.json({ members: [] })
    const members = await resolveActorProfiles(pool, actors)
    return c.json({ members })
  })

  app.get('/api/lists/:listId/members', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const listId = c.req.param('listId')
    const extraRaw = c.req.query('extraDids') ?? ''
    const extraDids = extraRaw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
    const row = await getAuthorListCache(pool, listId)
    if (!row) return c.json({ error: 'not found' }, 404)
    const didSet = new Set([...row.dids, ...extraDids])
    const dids = [...didSet]
    const members = await resolveListMemberProfiles(pool, dids)
    return c.json({
      listId: row.listId,
      graphName: row.graphName,
      memberCount: dids.length,
      refreshedAt: row.refreshedAt?.toISOString() ?? null,
      members,
    })
  })

  app.post('/api/lists/:listId/refresh', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const listId = c.req.param('listId')
    const row = await getAuthorListCache(pool, listId)
    if (!row) return c.json({ error: 'not found' }, 404)
    const refreshed = await refreshAuthorListToCache(
      pool,
      row.listId,
      row.projectId,
      row.sourceJson as Parameters<typeof refreshAuthorListToCache>[3],
    )
    return c.json({
      listId,
      memberCount: refreshed.dids?.length ?? 0,
      graphName: (await getAuthorListCache(pool, listId))?.graphName ?? null,
      refreshedAt: new Date().toISOString(),
    })
  })

  app.post('/api/lists/poll', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const count = await pollDueAuthorLists(pool)
    const rings = await pollDueFollowRings(pool)
    return c.json({ refreshed: count + rings })
  })

  app.get('/api/settings/enrichment', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const settings = await getEnrichmentSettings(pool)
    return c.json({ settings })
  })

  app.patch('/api/settings/enrichment', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const gate = await requireMaster(c, pool)
    if (!('ok' in gate)) return gate
    const body = (await c.req.json<Partial<import('@cfb/core-types').EnrichmentSettings>>().catch(
      () => null,
    )) ?? {}
    const current = await getEnrichmentSettings(pool)
    const settings = { ...current, ...body }
    await saveEnrichmentSettings(pool, settings)
    return c.json({ settings })
  })

  app.get('/api/settings/feedgen', async (c) => {
    const env = feedgenEnvFromProcess()
    const userDid = getUserDid(c)
    if (!pool) {
      return c.json({
        settings: maskFeedgenSettings(feedgenSettingsFromEnv(env)),
        writable: false,
        source: 'env',
        publisherDid: userDid,
      })
    }
    if (userDid) {
      const settings = await resolveUserFeedgenSettings(pool, userDid, env)
      const stored = await getUserFeedgenSettings(pool, userDid)
      const source =
        stored.publicBaseUrl ||
        stored.duckdnsSubdomain ||
        stored.cloudflarePublicUrl ||
        stored.generatorDid
          ? 'settings'
          : 'default'
      return c.json({
        settings: maskFeedgenSettings(settings),
        writable: true,
        source,
        publisherDid: userDid,
      })
    }
    const settings = await resolveFeedgenSettings(pool, env)
    const stored = await getFeedgenSettings(pool)
    const source =
      stored.generatorDid ||
      stored.publicBaseUrl ||
      stored.duckdnsSubdomain ||
      stored.cloudflarePublicUrl
        ? 'settings'
        : env.generatorDid || env.publicBaseUrl
          ? 'env'
          : 'default'
    return c.json({ settings: maskFeedgenSettings(settings), writable: true, source, publisherDid: null })
  })

  app.patch('/api/settings/feedgen', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    const body = (await c.req.json<Partial<import('@cfb/core-types').FeedgenSettings>>().catch(
      () => null,
    )) ?? {}
    if (userDid) {
      const current = await getUserFeedgenSettings(pool, userDid)
      let merged = mergeFeedgenSettings(current, body)
      if (!merged.generatorDid?.trim()) merged = { ...merged, generatorDid: userDid }
      const activeMode = inferFeedgenPublishMode(merged, {
        cloudflareTokenSet: Boolean(merged.cloudflareTunnelToken?.trim()),
        duckdnsTokenSet: Boolean(merged.duckdnsToken?.trim()),
      })
      if (activeMode === 'duckdns' && isDuckDnsConfigured(merged)) {
        merged = await applyDuckDnsSync(merged)
      } else if (activeMode === 'cloudflare' || activeMode === 'tailscale') {
        merged = await applyCloudflareCheck(merged)
      }
      await saveUserFeedgenSettings(pool, userDid, merged)
      const resolved = await resolveUserFeedgenSettings(pool, userDid, feedgenEnvFromProcess())
      return c.json({ settings: maskFeedgenSettings(resolved), publisherDid: userDid })
    }
    const current = await getFeedgenSettings(pool)
    let merged = mergeFeedgenSettings(current, body)
    const activeMode = inferFeedgenPublishMode(merged, {
      cloudflareTokenSet: Boolean(merged.cloudflareTunnelToken?.trim()),
      duckdnsTokenSet: Boolean(merged.duckdnsToken?.trim()),
    })
    if (activeMode === 'duckdns' && isDuckDnsConfigured(merged)) {
      merged = await applyDuckDnsSync(merged)
    } else if (activeMode === 'cloudflare' || activeMode === 'tailscale') {
      merged = await applyCloudflareCheck(merged)
    }
    await saveFeedgenSettings(pool, merged)
    const resolved = await resolveFeedgenSettings(pool, feedgenEnvFromProcess())
    return c.json({ settings: maskFeedgenSettings(resolved), publisherDid: null })
  })

  app.post('/api/settings/feedgen/duckdns/sync', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (userDid) {
      const current = await getUserFeedgenSettings(pool, userDid)
      if (!isDuckDnsConfigured(current)) {
        return c.json({ error: 'DuckDNS subdomain and token required' }, 400)
      }
      const updated = await applyDuckDnsSync(current)
      await saveUserFeedgenSettings(pool, userDid, updated)
      const resolved = await resolveUserFeedgenSettings(pool, userDid, feedgenEnvFromProcess())
      return c.json({ settings: maskFeedgenSettings(resolved), publisherDid: userDid })
    }
    const current = await getFeedgenSettings(pool)
    if (!isDuckDnsConfigured(current)) {
      return c.json({ error: 'DuckDNS subdomain and token required' }, 400)
    }
    const updated = await applyDuckDnsSync(current)
    await saveFeedgenSettings(pool, updated)
    const resolved = await resolveFeedgenSettings(pool, feedgenEnvFromProcess())
    return c.json({ settings: maskFeedgenSettings(resolved), publisherDid: null })
  })

  app.post('/api/settings/feedgen/cloudflare/check', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (userDid) {
      const current = await getUserFeedgenSettings(pool, userDid)
      const url = current.cloudflarePublicUrl?.trim() || current.publicBaseUrl?.trim()
      if (!url) {
        return c.json({ error: 'Cloudflare public URL required' }, 400)
      }
      const updated = await applyCloudflareCheck(current)
      await saveUserFeedgenSettings(pool, userDid, updated)
      const resolved = await resolveUserFeedgenSettings(pool, userDid, feedgenEnvFromProcess())
      return c.json({ settings: maskFeedgenSettings(resolved), publisherDid: userDid })
    }
    const current = await getFeedgenSettings(pool)
    const url = current.cloudflarePublicUrl?.trim() || current.publicBaseUrl?.trim()
    if (!url) {
      return c.json({ error: 'Cloudflare public URL required' }, 400)
    }
    const updated = await applyCloudflareCheck(current)
    await saveFeedgenSettings(pool, updated)
    const resolved = await resolveFeedgenSettings(pool, feedgenEnvFromProcess())
    return c.json({ settings: maskFeedgenSettings(resolved), publisherDid: null })
  })

  app.get('/api/settings/feedgen/hosted-hostname/status', async (c) => {
    const env = cloudflareTunnelEnvFromProcess()
    return c.json({
      available: isHostedHostnameAvailable(),
      dnsBase: env?.dnsBase ?? (process.env.CFB_DNS_BASE?.trim() || 'feeds.fema.monster'),
      exampleHost: env ? publicHostForSlug('yourname', env.dnsBase) : null,
    })
  })

  app.post('/api/settings/feedgen/hosted-hostname/claim', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const tunnelEnv = cloudflareTunnelEnvFromProcess()
    if (!tunnelEnv) {
      return c.json(
        {
          error:
            'Free hostnames are not enabled on this server. Use your own Cloudflare domain, or deploy on a VPS with DuckDNS.',
        },
        503,
      )
    }

    const current = await getUserFeedgenSettings(pool, userDid)
    if (current.hostedSlug?.trim() && current.cloudflarePublicUrl?.trim()) {
      const resolved = await resolveUserFeedgenSettings(pool, userDid, feedgenEnvFromProcess())
      return c.json({
        settings: maskFeedgenSettings(resolved),
        publisherDid: userDid,
        alreadyClaimed: true,
      })
    }

    const user = await getUser(pool, userDid)
    const preferred = slugFromHandle(user?.handle)
    const slug = await pickAvailableHostedSlug(pool, preferred, tunnelEnv.dnsBase)

    try {
      const localService =
        process.env.CFB_HOSTED_TUNNEL_SERVICE?.trim() || 'http://127.0.0.1:3000'
      const provisioned = await provisionHomeTunnelHostname(tunnelEnv, slug, { localService })

      let merged = mergeFeedgenSettings(current, {
        publishMode: 'cloudflare',
        cloudflarePublicUrl: provisioned.publicUrl,
        cloudflareTunnelToken: provisioned.tunnelToken,
        publicBaseUrl: provisioned.publicUrl,
        hostedSlug: provisioned.slug,
        hostedDnsBase: tunnelEnv.dnsBase,
      })
      merged = await applyCloudflareCheck(merged)
      await saveUserFeedgenSettings(pool, userDid, merged)

      const resolved = await resolveUserFeedgenSettings(pool, userDid, feedgenEnvFromProcess())
      return c.json({
        settings: maskFeedgenSettings(resolved),
        publisherDid: userDid,
        tunnelToken: provisioned.tunnelToken,
        message: `Claimed ${provisioned.publicUrl}. Run cloudflared with this token on your home PC (or set CLOUDFLARE_TUNNEL_TOKEN in .env for Docker).`,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to claim hostname'
      return c.json({ error: message }, 502)
    }
  })

  app.get('/api/labelers', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const rows = await listLabelerSources(pool)
    return c.json({
      labelers: rows.map((r) => ({
        did: r.did,
        name: r.name,
        enabled: r.enabled,
        isBuiltin: r.isBuiltin,
        createdAt: r.createdAt.toISOString(),
      })),
    })
  })

  app.post('/api/labelers', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const gate = await requireMaster(c, pool)
    if (!('ok' in gate)) return gate
    const body = (await c.req.json<{ did?: string; name?: string; enabled?: boolean }>().catch(
      () => null,
    )) ?? {}
    const did = body.did?.trim()
    const name = body.name?.trim()
    if (!did?.startsWith('did:')) return c.json({ error: 'did required (did:plc:…)' }, 400)
    if (!name) return c.json({ error: 'name required' }, 400)
    const row = await upsertLabelerSource(pool, { did, name, enabled: body.enabled })
    return c.json({
      did: row.did,
      name: row.name,
      enabled: row.enabled,
      isBuiltin: row.isBuiltin,
    })
  })

  app.patch('/api/labelers/:did', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const gate = await requireMaster(c, pool)
    if (!('ok' in gate)) return gate
    const did = decodeURIComponent(c.req.param('did'))
    const body = (await c.req.json<{ enabled?: boolean; name?: string }>().catch(() => null)) ?? {}
    if (body.enabled !== undefined) {
      const row = await setLabelerEnabled(pool, did, body.enabled)
      if (!row) return c.json({ error: 'not found' }, 404)
      return c.json({ did: row.did, name: row.name, enabled: row.enabled, isBuiltin: row.isBuiltin })
    }
    if (body.name?.trim()) {
      const existing = await listLabelerSources(pool)
      const found = existing.find((r) => r.did === did)
      if (!found) return c.json({ error: 'not found' }, 404)
      const row = await upsertLabelerSource(pool, {
        did,
        name: body.name.trim(),
        enabled: found.enabled,
        isBuiltin: found.isBuiltin,
      })
      return c.json({ did: row.did, name: row.name, enabled: row.enabled, isBuiltin: row.isBuiltin })
    }
    return c.json({ error: 'enabled or name required' }, 400)
  })

  app.delete('/api/labelers/:did', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const gate = await requireMaster(c, pool)
    if (!('ok' in gate)) return gate
    const did = decodeURIComponent(c.req.param('did'))
    const ok = await deleteLabelerSource(pool, did)
    if (!ok) return c.json({ error: 'not found or builtin labeler' }, 404)
    return c.json({ ok: true, did })
  })

  let duckdnsTimer: ReturnType<typeof setInterval> | undefined
  if (pool) {
    const bootstrapCloudflareFromEnv = async () => {
      const envToken = process.env.CLOUDFLARE_TUNNEL_TOKEN?.trim()
      const envUrl = process.env.FEEDGEN_PUBLIC_URL?.trim()
      if (!envToken || !envUrl) return
      try {
        const stored = await getFeedgenSettings(pool)
        if (stored.duckdnsSubdomain?.trim() && stored.publishMode !== 'cloudflare') return
        if (stored.cloudflarePublicUrl?.trim() && stored.cloudflareTunnelToken?.trim()) return
        let merged = mergeFeedgenSettings(stored, {
          publishMode: 'cloudflare',
          cloudflareTunnelToken: envToken,
          cloudflarePublicUrl: envUrl,
        })
        merged = await applyCloudflareCheck(merged)
        await saveFeedgenSettings(pool, merged)
        console.error(`[cloudflare] bootstrapped from env → ${merged.publicBaseUrl}`)
      } catch (err) {
        console.error('[cloudflare] env bootstrap failed', err)
      }
    }

    const bootstrapDuckDnsFromEnv = async () => {
      const envSub = process.env.DUCKDNS_SUBDOMAIN?.trim()
      const envToken = process.env.DUCKDNS_TOKEN?.trim()
      if (!envSub || !envToken) return
      try {
        const stored = await getFeedgenSettings(pool)
        if (stored.duckdnsSubdomain?.trim()) return
        let merged = mergeFeedgenSettings(stored, {
          publishMode: 'duckdns',
          duckdnsSubdomain: envSub,
          duckdnsToken: envToken,
          publicBaseUrl: duckdnsPublicUrl(envSub),
        })
        merged = await applyDuckDnsSync(merged)
        await saveFeedgenSettings(pool, merged)
        console.error(`[duckdns] bootstrapped from env → ${merged.publicBaseUrl}`)
      } catch (err) {
        console.error('[duckdns] env bootstrap failed', err)
      }
    }

    const syncStoredDuckDns = async () => {
      try {
        const tenants = await listUsersWithDuckDns(pool)
        for (const { ownerDid, settings } of tenants) {
          const updated = await applyDuckDnsSync(settings)
          await saveUserFeedgenSettings(pool, ownerDid, updated)
          if (updated.duckdnsLastOk) {
            console.error(
              `[duckdns] synced ${updated.duckdnsLastIp} → ${updated.duckdnsSubdomain}.duckdns.org (${ownerDid})`,
            )
          }
        }
        const legacy = await getFeedgenSettings(pool)
        if (isDuckDnsConfigured(legacy)) {
          const updated = await applyDuckDnsSync(legacy)
          await saveFeedgenSettings(pool, updated)
        }
      } catch (err) {
        console.error('[duckdns]', err)
      }
    }
    void bootstrapCloudflareFromEnv()
    void bootstrapDuckDnsFromEnv().then(() => syncStoredDuckDns())
    duckdnsTimer = setInterval(() => void syncStoredDuckDns(), 5 * 60 * 1000)
  }

  // In production (Docker), serve the web UI static files
  const webDistDir = resolve(import.meta.dirname, '../../web/dist')
  void registerStaticServing(app, webDistDir)

  return Object.assign(app, {
    ingest,
    stopDuckDnsPoller: () => {
      if (duckdnsTimer) clearInterval(duckdnsTimer)
    },
  })
}
