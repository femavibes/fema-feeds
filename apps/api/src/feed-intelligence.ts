import type { Hono } from 'hono'
import type { Pool } from '@cfb/storage-postgres'
import {
  computeSuggestions,
  buildAlreadyCapturedSet,
  dismissSignal,
  undismissSignal,
  ensureIntelligenceTables,
  getIntelligenceSettings,
  saveIntelligenceSettings,
  getProjectIntelligenceDisabled,
  saveProjectIntelligenceDisabled,
  backfillIntelligence,
  type SignalType,
  type IntelligenceConfig,
  DEFAULT_INTELLIGENCE_CONFIG,
} from '@cfb/feed-intelligence'
import { loadProject } from '@cfb/project-config'
import { assertProjectAccess, getUserDid } from './request-user.js'
import type { IngestRunner } from '@cfb/ingest-runner'

export function registerIntelligenceRoutes(
  app: Hono,
  opts: { pool: Pool | null; projectsDir: string; ingest?: IngestRunner },
) {
  const { pool, projectsDir } = opts

  // Ensure tables on first request
  let tablesReady = false
  async function ensureTables() {
    if (tablesReady || !pool) return
    await ensureIntelligenceTables(pool)
    tablesReady = true
  }

  app.get('/api/projects/:id/intelligence/suggestions', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const id = c.req.param('id')

    let project
    try {
      project = await loadProject(projectsDir, id)
    } catch {
      return c.json({ error: 'not found' }, 404)
    }
    const access = assertProjectAccess(project, getUserDid(c))
    if (!access.ok) return c.json({ error: 'not found' }, access.status)

    await ensureTables()

    const minConfidence = Number(c.req.query('minConfidence') ?? '0')
    const limit = Number(c.req.query('limit') ?? '50')
    const signalType = c.req.query('type') as SignalType | undefined
    const feedId = c.req.query('feedId')
    const minPoolCount = Number(c.req.query('minPoolCount') ?? '0')
    const hideCaptured = c.req.query('hideCaptured') !== 'false'

    const alreadyCaptured = hideCaptured ? buildAlreadyCapturedSet(project) : undefined

    // Query by feed-level signals if feedId specified, otherwise project-level
    const scopeId = feedId ? `feed:${feedId}` : id

    const config = { ...DEFAULT_INTELLIGENCE_CONFIG }
    if (minPoolCount > 0) config.minPoolCount = minPoolCount

    const suggestions = await computeSuggestions(pool, {
      projectId: scopeId,
      config,
      alreadyCaptured,
    })

    let filtered = suggestions
    if (minConfidence > 0) {
      filtered = filtered.filter((s) => s.confidence >= minConfidence)
    }
    if (signalType) {
      filtered = filtered.filter((s) => s.signalType === signalType)
    }

    return c.json({
      suggestions: filtered.slice(0, limit),
      total: filtered.length,
      scope: feedId ? 'feed' : 'project',
      meta: {
        windowDays: DEFAULT_INTELLIGENCE_CONFIG.windowDays,
        sampleRate: DEFAULT_INTELLIGENCE_CONFIG.sampleRate,
      },
    })
  })

  app.post('/api/projects/:id/intelligence/dismiss', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const id = c.req.param('id')
    const body = await c.req.json<{ signalType: SignalType; value: string }>()
    if (!body.signalType || !body.value) return c.json({ error: 'signalType and value required' }, 400)
    await ensureTables()
    await dismissSignal(pool, id, body.signalType, body.value)
    return c.json({ ok: true })
  })

  app.post('/api/projects/:id/intelligence/undismiss', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const id = c.req.param('id')
    const body = await c.req.json<{ signalType: SignalType; value: string }>()
    if (!body.signalType || !body.value) return c.json({ error: 'signalType and value required' }, 400)
    await ensureTables()
    await undismissSignal(pool, id, body.signalType, body.value)
    return c.json({ ok: true })
  })

  // Flush now — trigger immediate write of in-memory counters to DB
  app.post('/api/intelligence/flush', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    await ensureTables()
    const result = await opts.ingest?.flushIntelligence()
    if (!result) return c.json({ error: 'Intelligence not active (ingest not running?)' }, 409)
    return c.json({ ok: true, ...result })
  })

  // Backfill — scan existing pool posts and sample jetstream for baseline
  app.post('/api/intelligence/backfill', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    await ensureTables()
    const body = (await c.req.json<{ projectId?: string; limit?: number; sampleSeconds?: number }>().catch(() => null)) ?? {}
    const sampleSeconds = body.sampleSeconds ?? 30

    const sampleFirehose = async (onPost: (post: import('@cfb/core-types').NormalizedPost) => void, seconds: number) => {
      const { startJetstreamIngest } = await import('@cfb/ingest-jetstream')
      const url = process.env.JETSTREAM_URL ?? 'wss://jetstream1.us-east.bsky.network/subscribe'
      const { stop } = await startJetstreamIngest(url, { onPost })
      await new Promise<void>((resolve) => setTimeout(() => { stop(); resolve() }, seconds * 1000))
    }

    const result = await backfillIntelligence(pool, {
      projectId: body.projectId,
      limit: body.limit ?? 50000,
      sampleSeconds,
      sampleFirehose,
    })
    return c.json(result)
  })

  // Global intelligence settings
  app.get('/api/settings/intelligence', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    await ensureTables()
    const config = await getIntelligenceSettings(pool)
    const disabledProjects = await getProjectIntelligenceDisabled(pool)
    return c.json({
      config: config ?? DEFAULT_INTELLIGENCE_CONFIG,
      disabledProjects: [...disabledProjects],
    })
  })

  app.patch('/api/settings/intelligence', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    await ensureTables()
    const body = await c.req.json<Partial<IntelligenceConfig> & { disabledProjects?: string[] }>()
    const { disabledProjects, ...configPatch } = body
    const current = (await getIntelligenceSettings(pool)) ?? DEFAULT_INTELLIGENCE_CONFIG
    const merged = { ...current, ...configPatch }
    await saveIntelligenceSettings(pool, merged)
    if (disabledProjects !== undefined) {
      await saveProjectIntelligenceDisabled(pool, disabledProjects)
    }
    return c.json({ config: merged, disabledProjects: disabledProjects ?? [] })
  })
}
