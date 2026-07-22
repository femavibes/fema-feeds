import type { Hono, Context } from 'hono'

import type { FeedConfig, L2EvalInput, L2ParamValue, PostMetrics, ProjectL1Config } from '@cfb/core-types'

import { draftsDiffer } from '@cfb/core-types'

import {

  deleteFeed,

  loadFeed,

  loadFeedsForProject,

  saveFeed,

} from '@cfb/feed-config'

import { evaluateFeedL2 } from '@cfb/l2-eval'

import { buildLogicBlockEvalInput } from './logic-block-eval.js'
import { resolveFeedSortPack } from './sort-pack-eval.js'
import {
  applyFeedSortPackUpgrade,
  scanFeedSortPackUpgrade,
} from './sort-pack-upgrades.js'

import { buildFeedPublishInfo, applyFeedInjector, applyFeedRanker, resolveFeedgenServiceDid } from '@cfb/feedgen'

import { countImportableConditions, importFeedGenRules, resolveFeedMatch, collectParamControls, setParamValueAcrossMatch, resolveParamRuntimeMode } from '@cfb/l2-graph'

import { loadPostMetrics, loadMentionDidsForFeed, loadFollowRingsForFeed, previewFeedPoolMatches, startBackgroundReeval, getRebuildStatus, clearRebuildStatus, cancelRebuild, seedFollowRingsFromFeeds } from '@cfb/l2-worker'
import { setPostEngagement } from '@cfb/storage-postgres'

import { seedAuthorListsFromFeeds } from '@cfb/list-cache'

import { resolvePostInput } from '@cfb/post-resolve'

import {

  countFeedCandidates,

  deleteFeedCandidatesForFeed,

  deleteFeedDraft,

  deleteFeedVersions,

  getAuthorListCache,

  getFeedSkeleton,

  getFeedVersion,

  getNextFeedVersion,

  listFeedVersions,

  updateFeedVersionLabel,

  resolveUserFeedgenSettings,

  saveFeedDraft,

  saveFeedVersion,

  getFeedStats,

  createFeedApiKey,

  listFeedApiKeys,

  revokeFeedApiKey,

  resolveFeedApiKey,

} from '@cfb/storage-postgres'

import type { Pool } from '@cfb/storage-postgres'

import { loadFeedEditorState } from './feed-editor.js'
import {
  applyFeedLogicBlockUpgrades,
  scanFeedLogicBlockUpgrades,
  syncAutoMinorLogicBlockPins,
} from './logic-block-upgrades.js'

import { feedgenEnvFromProcess } from './feedgen-env.js'

import { mergeDraftIntoLive, newFeedShell, normalizeFeedDraft } from './feed-lifecycle.js'
import { recompileStrictGateIfNeeded } from './strict-recompile.js'
import { loadAllFeeds } from '@cfb/feed-config'
import { loadProject, saveProject } from '@cfb/project-config'
import { seedFollowRingsFromProjects } from '@cfb/l2-worker'

import { buildSkeletonPreviewHtml } from './skeleton-preview-html.js'

import {

  assertFeedAccess,

  filterFeedsForUser,

  getUserDid,

  stampFeedForSave,

} from './request-user.js'

import {
  blueskySessionError,
  checkBlueskyRkeyCollision,
  deleteBlueskyGeneratorRecord,
  getAtprotoAgent,
  getBlueskyGeneratorRecordStatus,
  listBlueskyFeedGenerators,
  publishBlueskyGeneratorRecord,
} from './bluesky-generator.js'

import { readFeedAvatarBytes } from './feed-avatar.js'



export function registerFeedRoutes(app: Hono, options: { feedsDir: string; projectsDir: string; pool: Pool | null }) {
  const { feedsDir, projectsDir, pool } = options

  app.get('/api/projects/:projectId/feeds', async (c) => {

    const liveFeeds = filterFeedsForUser(

      await loadFeedsForProject(feedsDir, c.req.param('projectId')),

      getUserDid(c),

    )

    const feeds = await Promise.all(

      liveFeeds.map(async (live) => {

        if (!pool) return { ...live, hasUnpublishedDraft: false }

        const state = await loadFeedEditorState(feedsDir, live.feedId, pool).catch(() => null)

        return {

          ...live,

          hasUnpublishedDraft: state?.hasUnpublishedDraft ?? false,

        }

      }),

    )

    return c.json({ feeds })

  })



  // --- Bluesky feed generators (list all / check slug collision) ---
  // Must be registered before /api/feeds/:id to avoid :id matching these paths

  app.get('/api/feeds/bluesky-generators', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const agent = await getAtprotoAgent(pool, userDid)
    if (!agent) return c.json({ error: blueskySessionError(), code: 'bluesky_session_required' }, 401)

    const feedgen = await resolveUserFeedgenSettings(pool, userDid, feedgenEnvFromProcess())
    const serviceDid = resolveFeedgenServiceDid(feedgen, userDid)

    const generators = await listBlueskyFeedGenerators(agent, userDid)
    const localFeeds = await loadAllFeeds(feedsDir)
    const localRkeys = new Set(localFeeds.map((f) => f.atprotoRkey ?? f.feedId))
    const tagged = generators.map((g) => ({
      ...g,
      isOwnDeployment: Boolean(serviceDid && g.did === serviceDid && localRkeys.has(g.rkey)),
      isOwnService: Boolean(serviceDid && g.did === serviceDid),
    }))
    return c.json({ generators: tagged, serviceDid })
  })

  app.delete('/api/feeds/bluesky-generators/:rkey', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const rkey = c.req.param('rkey')
    const agent = await getAtprotoAgent(pool, userDid)
    if (!agent) return c.json({ error: blueskySessionError(), code: 'bluesky_session_required' }, 401)

    try {
      await agent.com.atproto.repo.deleteRecord({
        repo: userDid,
        collection: 'app.bsky.feed.generator',
        rkey,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes('RecordNotFound')) {
        return c.json({ error: message }, 502)
      }
    }
    return c.json({ ok: true, rkey })
  })

  app.get('/api/feeds/check-slug/:slug', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const slug = c.req.param('slug')

    let localExists = false
    try {
      await loadFeed(feedsDir, slug)
      localExists = true
    } catch { /* not found locally */ }

    const agent = await getAtprotoAgent(pool, userDid)
    if (!agent) {
      return c.json({ localExists, bluesky: null })
    }

    const feedgen = await resolveUserFeedgenSettings(pool, userDid, feedgenEnvFromProcess())
    const serviceDid = resolveFeedgenServiceDid(feedgen, userDid)
    const collision = await checkBlueskyRkeyCollision(agent, userDid, slug, serviceDid)

    return c.json({ localExists, bluesky: collision })
  })

  app.get('/api/feeds/:id', async (c) => {

    const id = c.req.param('id')

    try {

      if (pool) {
        await syncAutoMinorLogicBlockPins(feedsDir, id, pool)
      }

      const state = await loadFeedEditorState(feedsDir, id, pool)

      const access = assertFeedAccess(state.live, getUserDid(c))

      if (!access.ok) return c.json({ error: 'not found' }, access.status)

      return c.json({

        feed: state.editor,

        live: state.live,

        draft: state.draft,

        hasUnpublishedDraft: state.hasUnpublishedDraft,

      })

    } catch {

      return c.json({ error: 'not found' }, 404)

    }

  })



  app.get('/api/feeds/:id/stats', async (c) => {
    const id = c.req.param('id')
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    let feed: FeedConfig
    try {
      feed = await loadFeed(feedsDir, id)
    } catch {
      return c.json({ error: 'not found' }, 404)
    }
    const access = assertFeedAccess(feed, getUserDid(c))
    if (!access.ok) return c.json({ error: 'not found' }, access.status)

    const [stats, candidateCount] = await Promise.all([
      getFeedStats(pool, id),
      countFeedCandidates(pool, id),
    ])

    // Fetch Bluesky like count from public API
    let likeCount: number | null = null
    const feedUri = feed.publishedUri
    if (feedUri) {
      try {
        const res = await fetch(
          `https://public.api.bsky.app/xrpc/app.bsky.feed.getFeedGenerator?feed=${encodeURIComponent(feedUri)}`,
        )
        if (res.ok) {
          const data = (await res.json()) as { view?: { likeCount?: number } }
          likeCount = data.view?.likeCount ?? null
        }
      } catch { /* best effort */ }
    }

    return c.json({ ...stats, candidateCount, likeCount })
  })



  app.post('/api/feeds', async (c) => {
    const body = await c.req.json<FeedConfig>()
    if (!body.feedId?.trim() || !body.projectId?.trim()) {
      return c.json({ error: 'feedId and projectId are required' }, 400)
    }
    try {
      await loadFeed(feedsDir, body.feedId)
      return c.json({ error: 'feed already exists' }, 409)
    } catch {
      // ok
    }

    if (!pool) {
      const userDid = getUserDid(c)
      const feed = stampFeedForSave(
        {
          ...body,
          feedId: body.feedId.trim(),
          projectId: body.projectId.trim(),
          enabled: body.enabled ?? true,
          poolScope: body.poolScope ?? 'project_only',
        },
        userDid,
      )
      await saveFeed(feedsDir, feed)
      return c.json({ feed }, 201)
    }

    const userDid = getUserDid(c)

    const shell = newFeedShell(

      stampFeedForSave(

        {

          ...body,

          feedId: body.feedId.trim(),

          projectId: body.projectId.trim(),

          poolScope: body.poolScope ?? 'project_only',

        },

        userDid,

      ),

      userDid,

    )

    await saveFeed(feedsDir, shell)

    if (userDid) {

      await saveFeedDraft(pool, shell.feedId, userDid, normalizeFeedDraft(shell))

    }

    recompileStrictGateIfNeeded(projectsDir, feedsDir, shell.projectId, pool)
    return c.json({ feed: shell }, 201)

  })



  app.get('/api/feeds/:id/logic-block-upgrades', async (c) => {

    const id = c.req.param('id')

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    try {

      const state = await loadFeedEditorState(feedsDir, id, pool)

      const access = assertFeedAccess(state.live, getUserDid(c))

      if (!access.ok) return c.json({ error: 'not found' }, access.status)

      const scanned = await scanFeedLogicBlockUpgrades(feedsDir, id, pool)
      const nextState = await loadFeedEditorState(feedsDir, id, pool)

      return c.json({
        upgrades: scanned.upgrades,
        autoAppliedNodeIds: scanned.autoAppliedNodeIds,
        feed: nextState.editor,
        live: nextState.live,
        hasUnpublishedDraft: nextState.hasUnpublishedDraft,
      })

    } catch {

      return c.json({ error: 'not found' }, 404)

    }

  })



  app.get('/api/feeds/:id/sort-pack-upgrade', async (c) => {

    const id = c.req.param('id')

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    try {

      const state = await loadFeedEditorState(feedsDir, id, pool)

      const access = assertFeedAccess(state.live, getUserDid(c))

      if (!access.ok) return c.json({ error: 'not found' }, access.status)

      const upgrade = await scanFeedSortPackUpgrade(feedsDir, id, pool)

      return c.json({ upgrade })

    } catch {

      return c.json({ error: 'not found' }, 404)

    }

  })



  app.post('/api/feeds/:id/sort-pack-upgrade/apply', async (c) => {

    const id = c.req.param('id')

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    const userDid = getUserDid(c)

    if (!userDid) return c.json({ error: 'login_required' }, 401)

    try {

      const state = await loadFeedEditorState(feedsDir, id, pool)

      const access = assertFeedAccess(state.live, userDid)

      if (!access.ok) return c.json({ error: 'not found' }, access.status)

      const result = await applyFeedSortPackUpgrade(feedsDir, id, pool, userDid)

      const nextState = await loadFeedEditorState(feedsDir, id, pool)

      return c.json({

        feed: result.feed,

        applied: result.applied,

        live: nextState.live,

        hasUnpublishedDraft: nextState.hasUnpublishedDraft,

      })

    } catch {

      return c.json({ error: 'not found' }, 404)

    }

  })



  app.post('/api/feeds/:id/logic-block-upgrades/apply', async (c) => {

    const id = c.req.param('id')

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    const userDid = getUserDid(c)

    if (!userDid) return c.json({ error: 'login_required' }, 401)



    const body =

      (await c.req.json<{ nodeIds?: string[] }>().catch(() => null)) ?? {}

    const nodeIds = body.nodeIds?.filter((n) => n.trim()) ?? []

    if (nodeIds.length === 0) return c.json({ error: 'nodeIds required' }, 400)



    try {

      const state = await loadFeedEditorState(feedsDir, id, pool)

      const access = assertFeedAccess(state.live, userDid)

      if (!access.ok) return c.json({ error: 'not found' }, access.status)



      const result = await applyFeedLogicBlockUpgrades(feedsDir, id, pool, userDid, nodeIds)

      const nextState = await loadFeedEditorState(feedsDir, id, pool)

      return c.json({

        feed: result.feed,

        applied: result.applied,

        live: nextState.live,

        hasUnpublishedDraft: nextState.hasUnpublishedDraft,

      })

    } catch {

      return c.json({ error: 'not found' }, 404)

    }

  })



  app.put('/api/feeds/:id/draft', async (c) => {

    const id = c.req.param('id')

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    const body = await c.req.json<FeedConfig>()

    if (body.feedId !== id) {

      return c.json({ error: 'feedId must match URL' }, 400)

    }

    let live: FeedConfig

    try {

      live = await loadFeed(feedsDir, id)

    } catch {

      return c.json({ error: 'not found' }, 404)

    }

    const access = assertFeedAccess(live, getUserDid(c))

    if (!access.ok) return c.json({ error: 'not found' }, access.status)

    const userDid = getUserDid(c)

    if (!userDid) return c.json({ error: 'login_required' }, 401)



    const draft = normalizeFeedDraft(

      stampFeedForSave(

        {

          ...body,

          feedId: id,

          projectId: live.projectId,

          enabled: body.enabled ?? live.enabled,

          published: live.published,

          publishedAt: live.publishedAt,

          liveAt: live.liveAt,

        },

        userDid,

      ),

    )

    // Persist settings fields to live file immediately (no Update Live needed)
    const settingsFields: Partial<FeedConfig> = {}
    if (body.enabled !== undefined && body.enabled !== live.enabled) settingsFields.enabled = body.enabled
    if (body.name !== undefined && body.name !== live.name) settingsFields.name = body.name
    if (body.description !== undefined && body.description !== live.description) settingsFields.description = body.description
    if (body.poolScope !== undefined && body.poolScope !== live.poolScope) settingsFields.poolScope = body.poolScope
    if (body.public !== undefined && body.public !== live.public) settingsFields.public = body.public
    if (body.logicPublic !== undefined && body.logicPublic !== live.logicPublic) settingsFields.logicPublic = body.logicPublic
    if (body.allowAsInput !== undefined && body.allowAsInput !== live.allowAsInput) settingsFields.allowAsInput = body.allowAsInput
    if (body.isTemplate !== undefined && body.isTemplate !== live.isTemplate) settingsFields.isTemplate = body.isTemplate
    if (body.statsPublic !== undefined && body.statsPublic !== live.statsPublic) settingsFields.statsPublic = body.statsPublic
    if (body.videoFeed !== undefined && body.videoFeed !== live.videoFeed) settingsFields.videoFeed = body.videoFeed
    if (body.publishedUri !== undefined && body.publishedUri !== live.publishedUri) settingsFields.publishedUri = body.publishedUri
    if (body.atprotoRkey !== undefined && body.atprotoRkey !== live.atprotoRkey) settingsFields.atprotoRkey = body.atprotoRkey
    if (Object.keys(settingsFields).length > 0) {
      live = { ...live, ...settingsFields }
      await saveFeed(feedsDir, live)
    }
    await saveFeedDraft(pool, id, userDid, draft)
    await seedAuthorListsFromFeeds(pool, [draft])
    await seedFollowRingsFromFeeds(pool, [draft])

    return c.json({

      feed: draft,

      live,

      hasUnpublishedDraft: draftsDiffer(live, draft),

    })

  })



  app.post('/api/feeds/:id/update', async (c) => {

    const id = c.req.param('id')

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)



    const body: { feed?: FeedConfig } =
      (await c.req.json<{ feed?: FeedConfig }>().catch(() => ({ feed: undefined }))) ?? {}

    let live: FeedConfig

    try {

      live = await loadFeed(feedsDir, id)

    } catch {

      return c.json({ error: 'not found' }, 404)

    }

    const access = assertFeedAccess(live, getUserDid(c))

    if (!access.ok) return c.json({ error: 'not found' }, access.status)

    const userDid = getUserDid(c)

    if (!userDid) return c.json({ error: 'login_required' }, 401)



    const editorState = await loadFeedEditorState(feedsDir, id, pool)
    const draftSource = body.feed ?? editorState.draft ?? editorState.editor

    const nextLive = mergeDraftIntoLive(live, draftSource)

    await saveFeed(feedsDir, nextLive)

    await seedAuthorListsFromFeeds(pool, [nextLive])
    await seedFollowRingsFromFeeds(pool, [nextLive])

    const allFeeds = await loadAllFeeds(feedsDir)
    let updatedProject: ProjectL1Config | undefined
    try {
      updatedProject = await loadProject(projectsDir, nextLive.projectId)
      await seedFollowRingsFromProjects(pool, [updatedProject])
    } catch {
      /* project missing — skip */
    }

    const version = await getNextFeedVersion(pool, id)

    await saveFeedVersion(pool, id, version, nextLive, userDid)

    await saveFeedDraft(pool, id, userDid, normalizeFeedDraft(nextLive))



    // Start background rebuild — return immediately
    startBackgroundReeval(pool, [nextLive], {
      projectId: nextLive.poolScope === 'global' ? undefined : nextLive.projectId,
      feedId: id,
    })

    recompileStrictGateIfNeeded(projectsDir, feedsDir, nextLive.projectId, pool)
    return c.json({
      feed: nextLive,
      live: nextLive,
      hasUnpublishedDraft: false,
      version,
      reeval: { posts: 0, evaluated: 0, matched: 0, written: 0 },
      rebuilding: true,
      project: updatedProject,
    })
  })

  app.get('/api/feeds/:id/rebuild-status', async (c) => {
    const id = c.req.param('id')
    const status = getRebuildStatus(id)
    if (!status) return c.json({ active: false, feedId: id })
    return c.json(status)
  })

  app.post('/api/feeds/:id/rebuild-status/clear', async (c) => {
    const id = c.req.param('id')
    clearRebuildStatus(id)
    return c.json({ ok: true })
  })

  app.post('/api/feeds/:id/rebuild-status/cancel', async (c) => {
    const id = c.req.param('id')
    const cancelled = cancelRebuild(id)
    return c.json({ ok: true, cancelled })
  })



  app.post('/api/feeds/:id/publish', async (c) => {
    const id = c.req.param('id')
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    let live: FeedConfig
    try {
      live = await loadFeed(feedsDir, id)
    } catch {
      return c.json({ error: 'not found' }, 404)
    }

    const access = assertFeedAccess(live, getUserDid(c))
    if (!access.ok) return c.json({ error: 'not found' }, access.status)

    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)

    if (!live.enabled) {
      return c.json({ error: 'Update live rules before publishing' }, 400)
    }

    const body =
      (await c.req.json<{ appPassword?: string }>().catch(() => ({ appPassword: undefined }))) ?? {}

    const feedgen = await resolveUserFeedgenSettings(pool, userDid, feedgenEnvFromProcess())
    const serviceDid = resolveFeedgenServiceDid(feedgen, userDid)

    const agent = await getAtprotoAgent(pool, userDid, body.appPassword)
    if (!agent) {
      return c.json({ error: blueskySessionError(), code: 'bluesky_session_required' }, 401)
    }

    let bluesky: { uri: string; created: boolean }
    try {
      const avatar = await readFeedAvatarBytes(feedsDir, id)
      bluesky = await publishBlueskyGeneratorRecord(agent, userDid, live, serviceDid, avatar)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bluesky publish failed'
      return c.json({ error: message }, 502)
    }

    const next: FeedConfig = {
      ...live,
      published: true,
      publishedAt: live.publishedAt ?? new Date().toISOString(),
      publishedUri: bluesky.uri,
      atprotoRkey: live.atprotoRkey ?? live.feedId,
    }

    await saveFeed(feedsDir, next)
    return c.json({ feed: next, bluesky })
  })



  app.post('/api/feeds/:id/unpublish', async (c) => {
    const id = c.req.param('id')
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    let live: FeedConfig
    try {
      live = await loadFeed(feedsDir, id)
    } catch {
      return c.json({ error: 'not found' }, 404)
    }

    const access = assertFeedAccess(live, getUserDid(c))
    if (!access.ok) return c.json({ error: 'not found' }, access.status)

    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const body =
      (await c.req.json<{ appPassword?: string }>().catch(() => ({ appPassword: undefined }))) ?? {}

    const agent = await getAtprotoAgent(pool, userDid, body.appPassword)
    if (agent) {
      try {
        await deleteBlueskyGeneratorRecord(agent, userDid, live)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Bluesky unpublish failed'
        return c.json({ error: message }, 502)
      }
    }

    const next: FeedConfig = { ...live, published: false }
    await saveFeed(feedsDir, next)
    return c.json({ feed: next })
  })



  app.get('/api/feeds/:id/versions', async (c) => {

    const id = c.req.param('id')

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    let feedProjectId = ''  
    try {

      const f = await loadFeed(feedsDir, id)
      feedProjectId = f.projectId

    } catch {

      return c.json({ error: 'not found' }, 404)

    }

    const versions = await listFeedVersions(pool, id)

    return c.json({ feedId: id, versions })

  })



  app.post('/api/feeds/:id/versions/milestone', async (c) => {

    const id = c.req.param('id')

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)



    const body = await c.req.json<{ label?: string }>().catch(() => ({ label: undefined }))

    const label = body.label?.trim() || null

    let live: FeedConfig

    try {

      live = await loadFeed(feedsDir, id)

    } catch {

      return c.json({ error: 'not found' }, 404)

    }

    const access = assertFeedAccess(live, getUserDid(c))

    if (!access.ok) return c.json({ error: 'not found' }, access.status)

    const userDid = getUserDid(c)

    if (!userDid) return c.json({ error: 'login_required' }, 401)



    const editorState = await loadFeedEditorState(feedsDir, id, pool)

    const draftSource = editorState.draft ?? editorState.editor ?? live

    const snapshot = normalizeFeedDraft(draftSource)



    const version = await getNextFeedVersion(pool, id)

    await saveFeedVersion(pool, id, version, snapshot, userDid, { label, kind: 'milestone' })



    return c.json({ feedId: id, version, label, kind: 'milestone' as const })

  })



  app.patch('/api/feeds/:id/versions/:version', async (c) => {

    const id = c.req.param('id')

    const version = Number(c.req.param('version'))

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    if (!Number.isFinite(version) || version < 1) {

      return c.json({ error: 'invalid version' }, 400)

    }



    const body = await c.req.json<{ label?: string }>().catch(() => ({ label: undefined }))

    const label = body.label?.trim()

    if (!label) return c.json({ error: 'label required' }, 400)



    let live: FeedConfig

    try {

      live = await loadFeed(feedsDir, id)

    } catch {

      return c.json({ error: 'not found' }, 404)

    }

    const access = assertFeedAccess(live, getUserDid(c))

    if (!access.ok) return c.json({ error: 'not found' }, access.status)

    const userDid = getUserDid(c)

    if (!userDid) return c.json({ error: 'login_required' }, 401)



    const updated = await updateFeedVersionLabel(pool, id, version, label)

    if (!updated) return c.json({ error: 'version not found' }, 404)



    return c.json({ feedId: id, version, label })

  })



  app.post('/api/feeds/:id/versions/:version/restore', async (c) => {

    const id = c.req.param('id')

    const version = Number(c.req.param('version'))

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    if (!Number.isFinite(version) || version < 1) {

      return c.json({ error: 'invalid version' }, 400)

    }



    let live: FeedConfig

    try {

      live = await loadFeed(feedsDir, id)

    } catch {

      return c.json({ error: 'not found' }, 404)

    }

    const access = assertFeedAccess(live, getUserDid(c))

    if (!access.ok) return c.json({ error: 'not found' }, access.status)

    const userDid = getUserDid(c)

    if (!userDid) return c.json({ error: 'login_required' }, 401)



    const snapshot = await getFeedVersion(pool, id, version)

    if (!snapshot) return c.json({ error: 'version not found' }, 404)



    const draft: FeedConfig = {

      ...snapshot,

      feedId: live.feedId,

      projectId: live.projectId,

      ownerDid: live.ownerDid,

      enabled: live.enabled,

      published: live.published,

      publishedAt: live.publishedAt,

      liveAt: live.liveAt,

    }

    await saveFeedDraft(pool, id, userDid, normalizeFeedDraft(draft))

    return c.json({

      feed: draft,

      live,

      hasUnpublishedDraft: draftsDiffer(live, draft),

      restoredVersion: version,

    })

  })



  app.get('/api/feeds/:id/publish', async (c) => {

    const id = c.req.param('id')

    let feed: FeedConfig

    try {

      feed = await loadFeed(feedsDir, id)

    } catch {

      return c.json({ error: 'not found' }, 404)

    }

    const access = assertFeedAccess(feed, getUserDid(c))

    if (!access.ok) return c.json({ error: 'not found' }, access.status)



    const userDid = getUserDid(c)

    const feedgen =

      pool && userDid

        ? await resolveUserFeedgenSettings(pool, userDid, feedgenEnvFromProcess())

        : {

            generatorDid: feed.ownerDid ?? '',

            publicBaseUrl: '',

          }



    let candidateCount: number | null = null
    if (pool) {
      candidateCount = await countFeedCandidates(pool, id)
    }

    const publisherDid = feed.ownerDid ?? userDid ?? ''
    const serviceDid = resolveFeedgenServiceDid(feedgen, publisherDid)
    let blueskyRecordPublished = false
    let blueskyRecordNeedsRepublish = false
    let blueskySessionReady = false
    if (pool && userDid) {
      const agent = await getAtprotoAgent(pool, userDid)
      blueskySessionReady = agent !== null
      if (agent) {
        const status = await getBlueskyGeneratorRecordStatus(agent, userDid, feed, serviceDid)
        blueskyRecordPublished = status.exists && status.compatible
        blueskyRecordNeedsRepublish = status.exists && !status.compatible
      }
    }

    return c.json({
      ...buildFeedPublishInfo(feed, {
        serviceDid,
        publisherDid,
        publicBaseUrl: feedgen.publicBaseUrl,
        candidateCount,
        blueskyRecordPublished,
        blueskyRecordNeedsRepublish,
      }),
      blueskySessionReady,
    })
  })



  app.post('/api/feeds/:id/import-rules', async (c) => {

    const id = c.req.param('id')

    let feedProjectId = ''  
    try {

      const f = await loadFeed(feedsDir, id)
      feedProjectId = f.projectId

    } catch {

      return c.json({ error: 'not found' }, 404)

    }



    const body = (await c.req.json<{ rules?: unknown }>().catch(() => null)) ?? {}

    if (body.rules === undefined) {

      return c.json({ error: 'rules JSON is required' }, 400)

    }



    const match = importFeedGenRules(body.rules)

    if (!match) {

      return c.json({ error: 'Unrecognized rules format (Graze filter, groups[], or nodes[]+edges[])' }, 400)

    }



    return c.json({

      match,

      conditionCount: countImportableConditions(match),

    })

  })



  app.get('/api/feeds/:id/skeleton', async (c) => {

    const id = c.req.param('id')

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    let config: import('@cfb/core-types').FeedConfig
    try {
      config = await loadFeed(feedsDir, id)
    } catch {
      return c.json({ error: 'not found' }, 404)
    }

    const limit = Math.min(Number(c.req.query('limit') ?? 50), 100)

    const cursor = c.req.query('cursor') ?? undefined

    const skeleton = await getFeedSkeleton(pool, id, limit, cursor)

    const ranked = await applyFeedRanker(pool, config, skeleton.feed, limit)

    const feed = await applyFeedInjector(pool, config, ranked, limit)

    const candidateCount = await countFeedCandidates(pool, id)

    return c.json({ feedId: id, candidateCount, feed, cursor: skeleton.cursor })

  })

  app.get('/api/feeds/:id/skeleton-preview', async (c) => {
    const id = c.req.param('id')
    if (!pool) return c.text('DATABASE_URL not configured', 503)

    let config: FeedConfig
    try {
      config = await loadFeed(feedsDir, id)
    } catch {
      return c.text('Feed not found', 404)
    }

    const access = assertFeedAccess(config, getUserDid(c))
    if (!access.ok) return c.text('Feed not found', access.status)

    const limit = Math.min(Number(c.req.query('limit') ?? 50), 100)
    const cursor = c.req.query('cursor') ?? undefined
    const skeleton = await getFeedSkeleton(pool, id, limit, cursor)
    const ranked = await applyFeedRanker(pool, config, skeleton.feed, limit)
    const feed = await applyFeedInjector(pool, config, ranked, limit)
    const candidateCount = await countFeedCandidates(pool, id)

    let publicSkeletonUrl: string | null = null
    const userDid = getUserDid(c)
    if (pool && userDid) {
      const feedgen = await resolveUserFeedgenSettings(pool, userDid, feedgenEnvFromProcess())
      const publishInfo = buildFeedPublishInfo(config, {
        serviceDid: resolveFeedgenServiceDid(feedgen, userDid),
        publisherDid: userDid,
        publicBaseUrl: feedgen.publicBaseUrl,
        candidateCount,
      })
      publicSkeletonUrl = publishInfo.skeletonUrl
    }

    const html = buildSkeletonPreviewHtml({
      feedName: config.name,
      feedId: id,
      candidateCount,
      items: feed,
      cursor: skeleton.cursor,
      publicSkeletonUrl,
    })

    return c.html(html)
  })



  app.delete('/api/feeds/:id', async (c) => {

    const id = c.req.param('id')

    let feedProjectId = ''  
    try {

      const f = await loadFeed(feedsDir, id)
      feedProjectId = f.projectId

    } catch {

      return c.json({ error: 'not found' }, 404)

    }

    await deleteFeed(feedsDir, id)

    if (pool) {

      await deleteFeedCandidatesForFeed(pool, id)

      await deleteFeedDraft(pool, id)

      await deleteFeedVersions(pool, id)

    }

    if (feedProjectId) recompileStrictGateIfNeeded(projectsDir, feedsDir, feedProjectId, pool)
    return c.json({ ok: true, feedId: id })

  })



  app.post('/api/feeds/:id/preview', async (c) => {

    const id = c.req.param('id')

    const body = (await c.req.json<{

      post?: string

      feed?: FeedConfig

      metrics?: PostMetrics

    }>().catch(() => null)) ?? {}



    let feed: FeedConfig

    try {

      feed = body.feed?.feedId === id ? body.feed : await loadFeed(feedsDir, id)

    } catch {

      return c.json({ error: 'feed not found' }, 404)

    }



    if (!body.post?.trim()) {

      return c.json({ error: 'post URL or URI is required' }, 400)

    }



    const post = await resolvePostInput(body.post.trim())

    const input: L2EvalInput = {}

    let metricsSource: 'pool' | 'override' | 'default' = 'default'



    if (pool) {

      if (!body.metrics) {

        input.metrics = await loadPostMetrics(pool, post.uri, post.authorDid)

        metricsSource = 'pool'

      } else {

        input.metrics = body.metrics

        metricsSource = 'override'

      }

      const authorLists: Record<string, string[]> = {}

      for (const node of walkFeedAuthorListIds(feed)) {

        const row = await getAuthorListCache(pool, node)

        if (row) authorLists[node] = row.dids

      }

      input.authorLists = authorLists

      input.mentionDids = await loadMentionDidsForFeed(pool, feed)

      input.followRings = await loadFollowRingsForFeed(pool, feed)

    } else if (body.metrics) {

      input.metrics = body.metrics

      metricsSource = 'override'

    }



    const feedForEval = await resolveFeedSortPack(pool, feed)

    const evalInput = await buildLogicBlockEvalInput(pool, feedForEval, input)

    const result = evaluateFeedL2(
      post,
      { ...feedForEval, match: resolveFeedMatch(feedForEval) },
      { ...evalInput, preview: true },
    )

    return c.json({

      post: { uri: post.uri, authorDid: post.authorDid, text: post.text.slice(0, 200) },

      result,

      metrics: input.metrics ?? { likeCount: 0, repostCount: 0, replyCount: 0, authorFollowerCount: 0 },

      metricsSource,

    })

  })



  app.post('/api/feeds/:id/match-pool', async (c) => {

    const id = c.req.param('id')

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)



    const body =

      (await c.req

        .json<{ feed?: FeedConfig; limit?: number; scanLimit?: number; rejectLimit?: number; previewMode?: 'live' | 'formula' }>()

        .catch(() => null)) ?? {}



    let feed: FeedConfig

    if (body.feed) {

      if (body.feed.feedId !== id) {

        return c.json({ error: 'feedId in body does not match URL' }, 400)

      }

      feed = body.feed

    } else {

      try {

        const state = await loadFeedEditorState(feedsDir, id, pool)

        feed = state.editor

      } catch {

        return c.json({ error: 'feed not found' }, 404)

      }

    }



    // Resolve marketplace sort packs so the preview scores with the real formula.
    const feedForPreview = await resolveFeedSortPack(pool, feed)

    const result = await previewFeedPoolMatches(pool, feedForPreview, {
      limit: body.limit,
      scanLimit: body.scanLimit,
      rejectLimit: body.rejectLimit,
      previewMode: body.previewMode,
    })

    return c.json(result)

  })

  // Sort tester — evaluate a post URL against the current sort formula
  app.post('/api/feeds/:id/sort-test', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json<{ url: string; feed?: FeedConfig }>().catch(() => null)
    if (!body?.url) return c.json({ error: 'url required' }, 400)

    let feed: FeedConfig
    if (body.feed) {
      feed = body.feed
    } else {
      try {
        const state = await loadFeedEditorState(feedsDir, id, pool)
        feed = state.editor
      } catch {
        return c.json({ error: 'feed not found' }, 404)
      }
    }

    if (!feed.rank?.sortKey) {
      return c.json({ error: 'Feed has no sort formula (chronological mode)' }, 400)
    }

    try {
      const { resolvePostInput } = await import('@cfb/post-resolve')
      const post = await resolvePostInput(body.url)

      if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

      // Use local DB only — same source as the actual feed system
      let metrics = await loadPostMetrics(pool, post.uri, post.authorDid)
      if (!metrics || (!metrics.likeCount && !metrics.repostCount && !metrics.replyCount && !metrics.authorFollowerCount)) {
        return c.json({ error: 'Post not in our database. Ingest it first to test scoring.' }, 404)
      }

      // Auto-backfill engagement from Bluesky API if all engagement is zero
      if (!metrics.likeCount && !metrics.repostCount && !metrics.replyCount && !metrics.quoteCount) {
        try {
          const params = new URLSearchParams({ uris: post.uri })
          const base = process.env.BSKY_PUBLIC_API ?? 'https://public.api.bsky.app'
          const apiRes = await fetch(`${base}/xrpc/app.bsky.feed.getPosts?${params}`)
          if (apiRes.ok) {
            const data = (await apiRes.json()) as { posts?: Array<{ uri: string; likeCount?: number; repostCount?: number; replyCount?: number; quoteCount?: number }> }
            const view = data.posts?.[0]
            if (view) {
              await setPostEngagement(pool, post.uri, {
                likeCount: view.likeCount ?? 0,
                repostCount: view.repostCount ?? 0,
                replyCount: view.replyCount ?? 0,
                quoteCount: view.quoteCount ?? 0,
              })
              metrics = await loadPostMetrics(pool, post.uri, post.authorDid)
            }
          }
        } catch { /* best effort */ }
      }

      const { buildL2Runtime, numericFieldValue, evalExpr } = await import('@cfb/l2-eval')
      const ctx = buildL2Runtime(post, metrics)

      // Evaluate the full sort expression
      const sortKey = evalExpr(ctx, feed.rank.sortKey)

      // Build breakdown: evaluate each top-level numeric field
      const fields: Array<{ field: string; value: number }> = [
        'like_count', 'repost_count', 'reply_count', 'quote_count', 'bookmark_count',
        'author_follower_count', 'author_follows_count', 'author_posts_count',
        'facet_tag_count', 'text_length', 'post_age_hours',
        'image_count', 'video_size_bytes', 'link_thumb_size_bytes',
        'facet_link_count', 'facet_mention_count', 'editor_score',
      ].map((field) => ({
        field,
        value: numericFieldValue(ctx, field as any),
      }))

      return c.json({
        url: body.url,
        uri: post.uri,
        authorDid: post.authorDid,
        sortKey,
        fields,
        formula: JSON.stringify(feed.rank.sortKey),
      })
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'Failed to resolve post' }, 422)
    }
  })

  /** Session or per-feed API key (Bearer whi_…). */
  async function assertFeedWriteAccess(
    c: Context,
    feed: FeedConfig,
  ): Promise<{ ok: true; via: 'session' | 'api_key' } | { ok: false }> {
    const bearer = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '').trim()
    if (bearer && pool) {
      const key = await resolveFeedApiKey(pool, bearer)
      if (key && key.feedId === feed.feedId) return { ok: true, via: 'api_key' }
    }
    const access = assertFeedAccess(feed, getUserDid(c))
    if (!access.ok) return { ok: false }
    return { ok: true, via: 'session' }
  }

  app.patch('/api/feeds/:id/params', async (c) => {
    const id = c.req.param('id')
    let live: FeedConfig
    try {
      live = await loadFeed(feedsDir, id)
    } catch {
      return c.json({ error: 'not found' }, 404)
    }

    const access = await assertFeedWriteAccess(c, live)
    if (!access.ok) return c.json({ error: 'not found' }, 404)

    const body =
      (await c.req.json<{ values?: Record<string, L2ParamValue> }>().catch(() => null)) ?? {}
    const values = body.values
    if (!values || typeof values !== 'object') {
      return c.json({ error: 'values object required' }, 400)
    }

    const declared = new Set(collectParamControls(live.match).map((ctrl) => ctrl.name))
    const controlsByName = new Map<string, ReturnType<typeof collectParamControls>[number]>()
    for (const ctrl of collectParamControls(live.match)) {
      if (ctrl.name) controlsByName.set(ctrl.name, ctrl)
    }
    const unknown = Object.keys(values).filter((k) => !declared.has(k))
    if (unknown.length > 0) {
      return c.json({ error: 'unknown param ids', unknown }, 400)
    }

    const notLive = Object.keys(values).filter((k) => {
      const ctrl = controlsByName.get(k)
      return ctrl && resolveParamRuntimeMode(ctrl) !== 'live'
    })
    if (notLive.length > 0) {
      return c.json({ error: 'param not live', blocked: notLive }, 400)
    }

    let match = live.match
    for (const [name, value] of Object.entries(values)) {
      match = setParamValueAcrossMatch(match, name, value)
    }

    const next: FeedConfig = stampFeedForSave(
      { ...live, match },
      getUserDid(c) ?? 'api-key',
    )
    await saveFeed(feedsDir, next)
    return c.json({ ok: true, feedId: id, updated: Object.keys(values), via: access.via })
  })

  app.get('/api/feeds/:id/api-keys', async (c) => {
    const id = c.req.param('id')
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    let live: FeedConfig
    try {
      live = await loadFeed(feedsDir, id)
    } catch {
      return c.json({ error: 'not found' }, 404)
    }

    const access = assertFeedAccess(live, getUserDid(c))
    if (!access.ok) return c.json({ error: 'not found' }, access.status)

    const keys = await listFeedApiKeys(pool, id)
    return c.json({ keys })
  })

  app.post('/api/feeds/:id/api-keys', async (c) => {
    const id = c.req.param('id')
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'unauthorized' }, 401)

    let live: FeedConfig
    try {
      live = await loadFeed(feedsDir, id)
    } catch {
      return c.json({ error: 'not found' }, 404)
    }

    const access = assertFeedAccess(live, userDid)
    if (!access.ok) return c.json({ error: 'not found' }, access.status)

    const body =
      (await c.req.json<{ label?: string }>().catch((): { label?: string } => ({}))) ?? {}
    const { row, rawKey } = await createFeedApiKey(pool, {
      feedId: id,
      ownerDid: userDid,
      label: body.label ?? '',
    })
    return c.json({ key: row, rawKey })
  })

  app.delete('/api/feeds/:id/api-keys/:keyId', async (c) => {
    const id = c.req.param('id')
    const keyId = c.req.param('keyId')
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    let live: FeedConfig
    try {
      live = await loadFeed(feedsDir, id)
    } catch {
      return c.json({ error: 'not found' }, 404)
    }

    const access = assertFeedAccess(live, getUserDid(c))
    if (!access.ok) return c.json({ error: 'not found' }, access.status)

    const revoked = await revokeFeedApiKey(pool, id, keyId)
    if (!revoked) return c.json({ error: 'not found' }, 404)
    return c.json({ ok: true })
  })

}

function walkFeedAuthorListIds(feed: FeedConfig): string[] {

  const ids: string[] = []

  const visit = (node: FeedConfig['match'] | { type: string; children?: unknown[]; listId?: string }) => {

    if (node.type === 'author' && 'listId' in node && node.listId) {

      ids.push(node.listId)

    }

    if (node.type === 'group' && 'children' in node && Array.isArray(node.children)) {

      for (const child of node.children) {

        visit(child as FeedConfig['match'])

      }

    }

  }

  visit(feed.match)

  return ids

}

