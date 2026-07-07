import type { Hono } from 'hono'
import type { Pool } from '@cfb/storage-postgres'
import type { BackfillJobConfig, BackfillSettings } from '@cfb/core-types'
import { DEFAULT_BACKFILL_SETTINGS } from '@cfb/core-types'
import {
  getBackfillSettings,
  saveBackfillSettings,
  ensureBackfillJobsTable,
  createBackfillJob,
  getBackfillJob,
  listBackfillJobs,
  getActiveBackfillCount,
  getLastBackfillForProject,
} from '@cfb/storage-postgres'
import { startBackfillJob, cancelBackfillJob, getActiveBackfillJobIds } from '@cfb/ingest-runner'
import { requireMaster, isRequestMaster } from './require-master.js'
import { getUserDid } from './request-user.js'
import { loadProject } from '@cfb/project-config'

export function registerBackfillRoutes(
  app: Hono,
  opts: { pool: Pool | null; projectsDir: string; feedsDir: string },
) {
  const { pool, projectsDir, feedsDir } = opts
  if (!pool) return

  // Ensure table exists on startup
  void ensureBackfillJobsTable(pool)

  // --- Master settings ---

  app.get('/api/settings/backfill', async (c) => {
    const gate = await requireMaster(c, pool)
    if (!('ok' in gate)) return gate
    const settings = await getBackfillSettings(pool)
    return c.json({ settings })
  })

  app.put('/api/settings/backfill', async (c) => {
    const gate = await requireMaster(c, pool)
    if (!('ok' in gate)) return gate
    const body = await c.req.json<Partial<BackfillSettings>>()
    const current = await getBackfillSettings(pool)
    const settings: BackfillSettings = {
      ...current,
      ...body,
      jetstream: { ...current.jetstream, ...body.jetstream },
      search: { ...current.search, ...body.search },
      author: { ...current.author, ...body.author },
    }
    await saveBackfillSettings(pool, settings)
    return c.json({ settings })
  })

  // --- Job management (per project) ---

  app.get('/api/projects/:id/backfill/jobs', async (c) => {
    const projectId = c.req.param('id')
    const jobs = await listBackfillJobs(pool, projectId)
    return c.json({ jobs })
  })

  app.get('/api/projects/:id/backfill/jobs/:jobId', async (c) => {
    const job = await getBackfillJob(pool, c.req.param('jobId'))
    if (!job || job.projectId !== c.req.param('id')) {
      return c.json({ error: 'not found' }, 404)
    }
    return c.json({ job })
  })

  app.post('/api/projects/:id/backfill/start', async (c) => {
    const projectId = c.req.param('id')
    const userDid = getUserDid(c)

    // Verify project exists
    try {
      await loadProject(projectsDir, projectId)
    } catch {
      return c.json({ error: 'project not found' }, 404)
    }

    const settings = await getBackfillSettings(pool)
    const body = await c.req.json<BackfillJobConfig>()

    // Validate method enabled
    if (!settings.enabledMethods.includes(body.method)) {
      return c.json({ error: `Backfill method '${body.method}' is not enabled` }, 400)
    }

    // Enforce master limits
    const candidateLimit = Math.min(body.candidateLimit || settings.maxCandidatesPerRun, settings.maxCandidatesPerRun)
    const matchLimit = Math.min(body.matchLimit || settings.maxMatchesPerRun, settings.maxMatchesPerRun)

    if (body.method === 'jetstream' && (body.hoursBack ?? 24) > settings.jetstream.maxHoursBack) {
      return c.json({ error: `Max hours back is ${settings.jetstream.maxHoursBack}` }, 400)
    }

    // Check concurrent limit
    const activeCount = await getActiveBackfillCount(pool)
    if (activeCount >= settings.maxConcurrentBackfills) {
      return c.json({ error: 'Maximum concurrent backfill jobs reached. Wait for current job to finish.' }, 409)
    }

    // Check cooldown
    const lastJob = await getLastBackfillForProject(pool, projectId)
    if (lastJob?.finishedAt) {
      const elapsed = Date.now() - new Date(lastJob.finishedAt).getTime()
      const cooldownMs = settings.cooldownMinutes * 60 * 1000
      if (elapsed < cooldownMs) {
        const remaining = Math.ceil((cooldownMs - elapsed) / 60_000)
        return c.json({ error: `Cooldown: wait ${remaining} more minute(s)` }, 429)
      }
    }

    const config: BackfillJobConfig = {
      ...body,
      candidateLimit,
      matchLimit,
    }

    const job = await createBackfillJob(pool, projectId, userDid, config)

    // Start job in background
    void startBackfillJob(job.id, { pool, projectsDir, feedsDir })

    return c.json({ job }, 201)
  })

  app.post('/api/projects/:id/backfill/jobs/:jobId/cancel', async (c) => {
    const jobId = c.req.param('jobId')
    const job = await getBackfillJob(pool, jobId)
    if (!job || job.projectId !== c.req.param('id')) {
      return c.json({ error: 'not found' }, 404)
    }
    if (job.status !== 'running' && job.status !== 'queued') {
      return c.json({ error: 'Job is not active' }, 400)
    }
    cancelBackfillJob(jobId)
    return c.json({ ok: true })
  })

  // --- Derive search queries from project config ---

  app.get('/api/projects/:id/backfill/suggest-queries', async (c) => {
    const projectId = c.req.param('id')
    try {
      const project = await loadProject(projectsDir, projectId)
      const queries: string[] = []
      // From L1 keywords
      if (project.keywordInclude?.terms?.length) {
        queries.push(...project.keywordInclude.terms)
      }
      // From L1 hashtags
      if (project.hashtagInclude?.length) {
        queries.push(...project.hashtagInclude.map(t => `#${t}`))
      }
      return c.json({ queries })
    } catch {
      return c.json({ queries: [] })
    }
  })
}
