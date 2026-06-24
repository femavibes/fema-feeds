import { resolve } from 'node:path'

import { config as loadEnv } from 'dotenv'

import { loadAllFeeds } from '@cfb/feed-config'
import { sweepLabelRefresh } from '@cfb/label-refresh'
import { createLabelStreamManager } from '@cfb/label-stream'
import { loadAllProjects } from '@cfb/project-config'
import { reevalPoolForFeeds, pollDueFollowRings, seedFollowRingsFromFeeds, seedFollowRingsFromProjects } from '@cfb/l2-worker'
import { loadHydratedProjects, pollDueAuthorLists, seedAuthorListsFromFeeds, seedAuthorListsFromProjects } from '@cfb/list-cache'
import { createPool, getEnrichmentSettings, pruneExpiredPosts } from '@cfb/storage-postgres'

const root = resolve(import.meta.dirname, '../../..')
loadEnv({ path: resolve(root, '.env') })
const projectsDir = resolve(root, 'config/projects')
const feedsDir = resolve(root, 'config/feeds')

async function runPollLists(once: boolean, intervalSec: number) {
  const pool = createPool()
  const tick = async () => {
    const projects = await loadAllProjects(projectsDir)
    const feeds = await loadAllFeeds(feedsDir)
    await seedAuthorListsFromProjects(pool, projects)
    await seedAuthorListsFromFeeds(pool, feeds)
    await seedFollowRingsFromFeeds(pool, feeds)
    await seedFollowRingsFromProjects(pool, projects)
    const n = await pollDueAuthorLists(pool)
    const rings = await pollDueFollowRings(pool)
    console.error(`[worker] refreshed ${n} author list(s), ${rings} follow ring(s)`)
    if (once) {
      await pool.end().catch(() => undefined)
      process.exit(0)
    }
  }

  await tick()
  if (!once) {
    setInterval(() => { void tick() }, intervalSec * 1000)
    console.error(`[worker] poll-lists every ${intervalSec}s — Ctrl+C to stop`)
    process.on('SIGINT', async () => {
      await pool.end()
      process.exit(0)
    })
  }
}

async function runRefreshLabels(once: boolean, intervalSec: number) {
  const pool = createPool()
  const tick = async () => {
    const settings = await getEnrichmentSettings(pool)
    const rawProjects = await loadAllProjects(projectsDir)
    await seedAuthorListsFromProjects(pool, rawProjects)
    const projects = await loadHydratedProjects(pool, rawProjects)
    const feeds = await loadAllFeeds(feedsDir)
    const result = await sweepLabelRefresh(pool, settings, feeds, projects)
    console.error(
      `[worker] label refresh: checked=${result.checked} changed=${result.changed} l1Removed=${result.l1Removed} l2=${result.l2Reevaluated} errors=${result.errors}`,
    )
    if (once) {
      console.log(JSON.stringify(result))
      await pool.end().catch(() => undefined)
      process.exit(0)
    }
  }

  await tick()
  if (!once) {
    setInterval(() => { void tick() }, intervalSec * 1000)
    console.error(`[worker] refresh-labels every ${intervalSec}s — Ctrl+C to stop`)
    process.on('SIGINT', async () => {
      await pool.end()
      process.exit(0)
    })
  }
}

async function runLabelStream() {
  const pool = createPool()
  const settings = await getEnrichmentSettings(pool)
  if (!settings.enabled || !settings.labelStreamEnabled) {
    console.error('[worker] label stream disabled in enrichment settings')
    await pool.end()
    process.exit(1)
  }

  const manager = createLabelStreamManager({
    pool,
    projectsDir,
    feedsDir,
    getSettings: () => getEnrichmentSettings(pool),
  })
  await manager.start()
  console.error('[worker] label-stream running — Ctrl+C to stop')

  const logStats = () => {
    const s = manager.getStats()
    console.error(
      `[worker] label-stream: connections=${s.connections} events=${s.events} labels=${s.labelsProcessed} changed=${s.postsChanged} errors=${s.errors}`,
    )
  }
  const statsTimer = setInterval(logStats, 60_000)

  process.on('SIGINT', async () => {
    clearInterval(statsTimer)
    manager.stop()
    await pool.end()
    process.exit(0)
  })
}

async function runPrune() {
  const pool = createPool()
  const removed = await pruneExpiredPosts(pool)
  console.log(JSON.stringify({ prunedPosts: removed }))
  await pool.end()
}

async function runL2Reeval(projectId?: string) {
  const pool = createPool()
  const feeds = await loadAllFeeds(feedsDir)
  const result = await reevalPoolForFeeds(pool, feeds, { projectId })
  console.log(JSON.stringify(result))
  await pool.end()
}

const [cmd, ...rest] = process.argv.slice(2)

if (cmd === 'poll-lists') {
  const once = rest.includes('--once')
  const intervalArg = rest.find((a) => a.startsWith('--interval='))
  const intervalSec = intervalArg ? Number(intervalArg.split('=')[1]) : 300
  await runPollLists(once, intervalSec)
} else if (cmd === 'refresh-labels') {
  const once = rest.includes('--once')
  const intervalArg = rest.find((a) => a.startsWith('--interval='))
  const intervalSec = intervalArg ? Number(intervalArg.split('=')[1]) : 300
  await runRefreshLabels(once, intervalSec)
} else if (cmd === 'label-stream') {
  await runLabelStream()
} else if (cmd === 'prune') {
  await runPrune()
} else if (cmd === 'l2-reeval') {
  const projectArg = rest.find((a) => a.startsWith('--project='))
  const projectId = projectArg?.split('=')[1]
  await runL2Reeval(projectId)
} else {
  console.log(`Usage:
  node dist/main.js poll-lists [--once] [--interval=300]
  node dist/main.js refresh-labels [--once] [--interval=300]
  node dist/main.js label-stream
  node dist/main.js prune
  node dist/main.js l2-reeval [--project=urbanism]

Env:
  DATABASE_URL  (required)`)
}
