import type { BackfillJob, BackfillJobConfig, NormalizedPost, ProjectL1Config, FeedConfig } from '@cfb/core-types'
import type { Pool } from '@cfb/storage-postgres'
import {
  getBackfillJob,
  updateBackfillJobStatus,
  updateBackfillJobProgress,
  getBackfillSettings,
} from '@cfb/storage-postgres'
import { persistL1Matches } from '@cfb/storage-postgres'
import { compileAllProjects } from '@cfb/l1-compile'
import { evaluateProjectL1 } from '@cfb/l1-eval'
import { loadAllFeeds } from '@cfb/feed-config'
import { loadProject } from '@cfb/project-config'
import { loadHydratedProjects } from '@cfb/list-cache'
import { mapJetstreamCreateEvent } from '@cfb/ingest-jetstream'
import { normalizeJetstreamPost, type JetstreamPostEvent } from '@cfb/post-normalize'
import { matchedProjectIdsFromL1, processPostForFeeds, loadLogicBlockPackagesForFeeds } from '@cfb/l2-worker'
import { buildStrictGates, postPassesStrictGate } from './strict-gate.js'

/** In-memory tracking of active backfill jobs. */
const activeJobs = new Map<string, { cancel: () => void }>()

export interface BackfillRunnerOptions {
  pool: Pool
  projectsDir: string
  feedsDir: string
}

export interface BackfillProgress {
  candidatesScanned: number
  matchesFound: number
  l2Written: number
  errors: number
}

export async function startBackfillJob(
  jobId: string,
  opts: BackfillRunnerOptions,
): Promise<void> {
  const { pool, projectsDir, feedsDir } = opts
  const job = await getBackfillJob(pool, jobId)
  if (!job || job.status !== 'queued') return

  const settings = await getBackfillSettings(pool)
  // Note: don't re-check concurrent limit here — the API already validated it
  // before creating the job. The job itself counts as 'queued' which would
  // self-block if we checked again.

  await updateBackfillJobStatus(pool, jobId, 'running')

  let cancelled = false
  activeJobs.set(jobId, { cancel: () => { cancelled = true } })

  const progress: BackfillProgress = { candidatesScanned: 0, matchesFound: 0, l2Written: 0, errors: 0 }

  try {
    // Load project + feeds
    const rawProject = await loadProject(projectsDir, job.projectId)
    const hydrated = await loadHydratedProjects(pool, [rawProject])
    const project = hydrated[0] ?? rawProject
    compileAllProjects([project])
    const feeds = (await loadAllFeeds(feedsDir)).filter(f => f.projectId === job.projectId && f.enabled)

    const logicBlockPkgs = await loadLogicBlockPackagesForFeeds(pool, feeds).catch(() => [])
    const strictState = buildStrictGates([project], feeds, logicBlockPkgs)

    const isCancelled = () => cancelled
    const limitReached = () =>
      progress.candidatesScanned >= job.candidateLimit ||
      progress.matchesFound >= job.matchLimit

    const handlePost = async (post: NormalizedPost) => {
      progress.candidatesScanned++
      // Apply strict gate (keyword filter) — same as live ingest
      if (!postPassesStrictGate(post, project, strictState)) return
      const result = evaluateProjectL1(post, project)
      if (result.matched) {
        const matches = [{ projectId: job.projectId, matched: true, matchedVia: 'jetstream' as const, trace: [] }]
        try {
          await persistL1Matches(pool, { post, matches })
          progress.matchesFound++
          if (feeds.length > 0) {
            const l2 = await processPostForFeeds(pool, post, matchedProjectIdsFromL1(matches), feeds)
            progress.l2Written += l2.written
          }
        } catch {
          progress.errors++
        }
      }
      // Persist progress every 500 candidates
      if (progress.candidatesScanned % 500 === 0) {
        await updateBackfillJobProgress(pool, jobId, progress).catch(() => {})
      }
    }

    switch (job.config.method) {
      case 'jetstream':
        await runJetstreamBackfill(job, handlePost, isCancelled, limitReached)
        break
      case 'search':
        await runSearchBackfill(job, handlePost, isCancelled, limitReached)
        break
      case 'author':
        await runAuthorBackfill(job, project, feeds, handlePost, isCancelled, limitReached)
        break
    }

    await updateBackfillJobProgress(pool, jobId, progress)
    await updateBackfillJobStatus(pool, jobId, cancelled ? 'cancelled' : 'completed')
  } catch (err) {
    await updateBackfillJobProgress(pool, jobId, progress).catch(() => {})
    await updateBackfillJobStatus(pool, jobId, 'failed')
    console.error(`[backfill] job ${jobId} failed:`, err)
  } finally {
    activeJobs.delete(jobId)
  }
}

export function cancelBackfillJob(jobId: string): boolean {
  const active = activeJobs.get(jobId)
  if (active) {
    active.cancel()
    return true
  }
  return false
}

export function getActiveBackfillJobIds(): string[] {
  return [...activeJobs.keys()]
}

// --- Jetstream Replay ---

async function runJetstreamBackfill(
  job: BackfillJob,
  handlePost: (post: NormalizedPost) => Promise<void>,
  isCancelled: () => boolean,
  limitReached: () => boolean,
): Promise<void> {
  const hoursBack = job.config.hoursBack ?? 24
  const cursorUs = (Date.now() - hoursBack * 60 * 60 * 1000) * 1000
  const jetstreamUrl = process.env.JETSTREAM_URL ?? 'wss://jetstream1.us-east.bsky.network/subscribe'

  // @ts-ignore - @skyware/jetstream types resolved at runtime
  const { Jetstream } = await (import('@skyware/jetstream') as Promise<any>)

  const inflight = new Set<Promise<void>>()

  await new Promise<void>((resolve) => {
    const client = new Jetstream({
      endpoint: jetstreamUrl,
      wantedCollections: ['app.bsky.feed.post'],
      cursor: cursorUs,
    })

    let done = false
    const finish = () => {
      if (done) return
      done = true
      client.close()
      resolve()
    }

    client.onCreate('app.bsky.feed.post', (event: any) => {
      if (isCancelled() || limitReached()) { finish(); return }
      const mapped = mapJetstreamCreateEvent(event)
      const p = handlePost(normalizeJetstreamPost(mapped)).catch(() => {})
      inflight.add(p)
      p.finally(() => inflight.delete(p))
    })

    client.on('error', (err: unknown) => {
      console.error('[backfill:jetstream] error:', err)
      finish()
    })

    client.start()

    // Safety timeout: max 10 minutes per backfill run
    setTimeout(() => finish(), 10 * 60 * 1000)
  })

  // Wait for in-flight L1/L2 processing to finish before reporting progress
  if (inflight.size > 0) await Promise.allSettled([...inflight])
}

// --- Bluesky Search API ---

async function runSearchBackfill(
  job: BackfillJob,
  handlePost: (post: NormalizedPost) => Promise<void>,
  isCancelled: () => boolean,
  limitReached: () => boolean,
): Promise<void> {
  const queries = job.config.queries ?? []
  if (queries.length === 0) return

  const settings = await import('@cfb/storage-postgres').then(m => m.getBackfillSettings)
  const maxPages = job.config.candidateLimit ? Math.ceil(job.config.candidateLimit / 100) : 50
  const seenUris = new Set<string>()

  for (const query of queries) {
    if (isCancelled() || limitReached()) break
    let cursor: string | undefined
    let pages = 0

    while (pages < maxPages && !isCancelled() && !limitReached()) {
      const params = new URLSearchParams({ q: query, limit: '100' })
      if (cursor) params.set('cursor', cursor)
      if (job.config.searchSince) params.set('since', job.config.searchSince)
      if (job.config.searchUntil) params.set('until', job.config.searchUntil)

      try {
        const res = await fetch(
          `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?${params}`,
        )
        if (!res.ok) {
          if (res.status === 429) {
            await delay(5000)
            continue
          }
          break
        }
        const data = await res.json() as {
          posts: Array<{
            uri: string
            cid: string
            author: { did: string }
            record: any
            indexedAt: string
          }>
          cursor?: string
        }

        for (const post of data.posts) {
          if (isCancelled() || limitReached()) break
          if (seenUris.has(post.uri)) continue
          seenUris.add(post.uri)

          const normalized = searchPostToNormalized(post)
          await handlePost(normalized)
        }

        cursor = data.cursor
        if (!cursor || data.posts.length === 0) break
        pages++
        await delay(2000) // Rate limit respect
      } catch {
        break
      }
    }
  }
}

// --- Author Feed Crawl ---

async function runAuthorBackfill(
  job: BackfillJob,
  project: ProjectL1Config,
  feeds: FeedConfig[],
  handlePost: (post: NormalizedPost) => Promise<void>,
  isCancelled: () => boolean,
  limitReached: () => boolean,
): Promise<void> {
  // Collect author DIDs from project author lists + feed author lists
  const authorDids = new Set<string>()

  const targetListIds = job.config.authorListIds
  for (const list of project.authorLists ?? []) {
    if (targetListIds && !targetListIds.includes(list.listId)) continue
    for (const src of list.sources ?? []) {
      if (src.type === 'manual_dids') src.dids.forEach(d => authorDids.add(d))
    }
    if (list.dids) list.dids.forEach(d => authorDids.add(d))
  }
  for (const feed of feeds) {
    for (const list of (feed as any).authorLists ?? []) {
      if (targetListIds && !targetListIds.includes(list.listId)) continue
      for (const src of list.sources ?? []) {
        if (src.type === 'manual_dids') src.dids.forEach((d: string) => authorDids.add(d))
      }
      if (list.dids) list.dids.forEach((d: string) => authorDids.add(d))
    }
  }

  const maxAuthors = job.config.authorListIds ? authorDids.size : 100
  const pagesPerAuthor = job.config.pagesPerAuthor ?? 20
  const seenUris = new Set<string>()
  let authorsProcessed = 0

  for (const did of authorDids) {
    if (isCancelled() || limitReached() || authorsProcessed >= maxAuthors) break
    let cursor: string | undefined
    let pages = 0

    while (pages < pagesPerAuthor && !isCancelled() && !limitReached()) {
      const params = new URLSearchParams({ actor: did, limit: '100', filter: 'posts_no_replies' })
      if (cursor) params.set('cursor', cursor)

      try {
        const res = await fetch(
          `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?${params}`,
        )
        if (!res.ok) {
          if (res.status === 429) { await delay(5000); continue }
          break
        }
        const data = await res.json() as {
          feed: Array<{ post: { uri: string; cid: string; author: { did: string }; record: any; indexedAt: string } }>
          cursor?: string
        }

        for (const item of data.feed) {
          if (isCancelled() || limitReached()) break
          if (seenUris.has(item.post.uri)) continue
          seenUris.add(item.post.uri)

          const normalized = searchPostToNormalized(item.post)
          await handlePost(normalized)
        }

        cursor = data.cursor
        if (!cursor || data.feed.length === 0) break
        pages++
        await delay(2000)
      } catch {
        break
      }
    }
    authorsProcessed++
  }
}

// --- Helpers ---

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/** Convert a Bluesky API post object to NormalizedPost (best-effort). */
function searchPostToNormalized(post: {
  uri: string
  cid: string
  author: { did: string }
  record: any
  indexedAt: string
}): NormalizedPost {
  const record = post.record ?? {}
  const text: string = record.text ?? ''
  const langs: string[] = record.langs ?? []
  const facets: any[] = record.facets ?? []

  const facetTags: string[] = []
  const facetLinks: string[] = []
  const facetMentions: string[] = []
  for (const facet of facets) {
    for (const feat of facet.features ?? []) {
      if (feat.$type === 'app.bsky.richtext.facet#tag') facetTags.push(feat.tag)
      else if (feat.$type === 'app.bsky.richtext.facet#link') facetLinks.push(feat.uri)
      else if (feat.$type === 'app.bsky.richtext.facet#mention') facetMentions.push(feat.did)
    }
  }

  const embed = record.embed
  const media = embed?.media
  const videoBlob = embed?.video ?? media?.video
  const presentation = videoBlob?.presentation
  const rawHasVideo = Boolean(
    embed?.$type === 'app.bsky.embed.video' ||
      media?.$type === 'app.bsky.embed.video' ||
      videoBlob,
  )
  const hasGif = rawHasVideo && presentation === 'gif'
  const hasVideo = rawHasVideo && !hasGif
  const hasImage =
    embed?.$type === 'app.bsky.embed.images' || media?.$type === 'app.bsky.embed.images'
  const hasLinkCard =
    embed?.$type === 'app.bsky.embed.external' || media?.$type === 'app.bsky.embed.external'
  const hasQuote = embed?.$type === 'app.bsky.embed.record'
  const hasQuoteWithMedia = embed?.$type === 'app.bsky.embed.recordWithMedia'
  const hasRecord = hasQuoteWithMedia

  const isReply = Boolean(record.reply)
  const postKind = isReply
    ? ('reply' as const)
    : hasQuote || hasQuoteWithMedia
      ? ('quote' as const)
      : ('root' as const)

  return {
    uri: post.uri,
    cid: post.cid,
    authorDid: post.author.did,
    recordType: 'app.bsky.feed.post',
    text,
    createdAt: record.createdAt ?? post.indexedAt,
    langs,
    selfLabels: (record.labels?.values ?? []).map((l: any) => l.val),
    labelerLabels: [],
    postKind,
    embed: {
      hasVideo,
      hasGif,
      hasImage,
      hasLinkCard,
      hasQuote,
      hasQuoteWithMedia,
      hasRecord,
      hasTextOnly:
        !hasVideo && !hasGif && !hasImage && !hasLinkCard && !hasQuote && !hasQuoteWithMedia,
    },
    facetTags,
    hiddenFacetTags: [],
    facetLinks,
    facetMentions,
    outlineTags: record.tags ?? [],
    indexedAt: post.indexedAt,
  }
}
