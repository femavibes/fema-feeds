import { resolve } from 'node:path'

import { config as loadEnv } from 'dotenv'

import { loadAllFeeds, saveFeed } from '@cfb/feed-config'
import { sweepLabelRefresh } from '@cfb/label-refresh'
import { createLabelStreamManager } from '@cfb/label-stream'
import { createListitemStreamManager } from '@cfb/listitem-stream'
import {
  collectParamControls,
  tickParamTriggersForFeed,
  triggersForControl,
} from '@cfb/l2-graph'
import { buildParamTriggerContext } from '@cfb/l2-worker'
import { loadAllProjects } from '@cfb/project-config'
import { reevalPoolForFeeds, pollDueFollowRings, seedFollowRingsFromFeeds, seedFollowRingsFromProjects } from '@cfb/l2-worker'
import { loadHydratedProjects, pollDueAuthorLists, seedAuthorListsFromFeeds, seedAuthorListsFromProjects } from '@cfb/list-cache'
import {
  createPool,
  getAuthorListMemberCount,
  getEnrichmentSettings,
  noteListMemberCount,
  pruneExpiredPosts,
  pruneOldParamMatchEvents,
} from '@cfb/storage-postgres'

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

async function runListitemStream() {
  const pool = createPool()
  const manager = createListitemStreamManager({ pool })
  await manager.start()
  console.error('[worker] listitem-stream running — Ctrl+C to stop')

  const logStats = () => {
    const s = manager.getStats()
    console.error(
      `[worker] listitem-stream: owners=${s.ownerCount} events=${s.events} creates=${s.creates} deletes=${s.deletes} applied=${s.applied} ignored=${s.ignored} errors=${s.errors}`,
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

async function runRefreshEngagement(projectId?: string) {
  const pool = createPool()
  const feeds = await loadAllFeeds(feedsDir)
  const { catchUpFeedEngagement } = await import('@cfb/ingest-runner')
  const targetFeeds = feeds.filter((f) => f.enabled && (!projectId || f.projectId === projectId))
  const feedIds = targetFeeds.map((f) => f.feedId)
  console.error(`[worker] refreshing engagement for ${feedIds.length} feed(s): ${feedIds.join(', ')}`)
  const result = await catchUpFeedEngagement(pool, feedIds, { staleMinutes: 0 })
  console.log(JSON.stringify(result))
  await pool.end()
}

async function syncListMembershipCounts(
  pool: Awaited<ReturnType<typeof createPool>>,
  feed: Awaited<ReturnType<typeof loadAllFeeds>>[number],
): Promise<void> {
  const listIds = new Set<string>()
  for (const control of collectParamControls(feed.match)) {
    for (const trigger of triggersForControl(control)) {
      if (trigger.kind === 'list_membership') listIds.add(trigger.listId)
    }
  }
  for (const listId of listIds) {
    const count = await getAuthorListMemberCount(pool, listId)
    if (count !== null) {
      await noteListMemberCount(pool, feed.feedId, listId, count)
    }
  }
}

async function runParamTriggers(once: boolean, intervalSec: number) {
  const pool = createPool()
  const tick = async () => {
    const feeds = await loadAllFeeds(feedsDir)
    let updated = 0
    for (const feed of feeds) {
      if (!feed.enabled) continue
      await syncListMembershipCounts(pool, feed)
      const ctx = await buildParamTriggerContext(pool, feed)
      const { feed: next, changed } = tickParamTriggersForFeed(feed, ctx)
      if (changed.length === 0) continue
      await saveFeed(feedsDir, next)
      updated += 1
      console.error(`[worker] param-triggers ${feed.feedId}: ${changed.join(', ')}`)
    }
    if (updated > 0) {
      console.error(`[worker] param-triggers updated ${updated} feed(s)`)
    }
    await pruneOldParamMatchEvents(pool).catch(() => undefined)
    if (once) {
      await pool.end().catch(() => undefined)
      process.exit(0)
    }
  }

  await tick()
  if (!once) {
    setInterval(() => { void tick() }, intervalSec * 1000)
    console.error(`[worker] param-triggers every ${intervalSec}s — Ctrl+C to stop`)
    process.on('SIGINT', async () => {
      await pool.end().catch(() => undefined)
      process.exit(0)
    })
  }
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
} else if (cmd === 'listitem-stream') {
  await runListitemStream()
} else if (cmd === 'prune') {
  await runPrune()
} else if (cmd === 'refresh-engagement') {
  const projectArg = rest.find((a) => a.startsWith('--project='))
  const projectId = projectArg?.split('=')[1]
  await runRefreshEngagement(projectId)
} else if (cmd === 'param-triggers' || cmd === 'param-schedules') {
  const once = rest.includes('--once')
  const intervalArg = rest.find((a) => a.startsWith('--interval='))
  const intervalSec = intervalArg ? Number(intervalArg.split('=')[1]) : 60
  await runParamTriggers(once, intervalSec)
} else if (cmd === 'l2-reeval') {
  const projectArg = rest.find((a) => a.startsWith('--project='))
  const projectId = projectArg?.split('=')[1]
  await runL2Reeval(projectId)
} else {
  console.log(`Usage:
  node dist/main.js poll-lists [--once] [--interval=300]
  node dist/main.js refresh-labels [--once] [--interval=300]
  node dist/main.js refresh-engagement [--project=urbanism]
  node dist/main.js label-stream
  node dist/main.js listitem-stream
  node dist/main.js param-triggers [--once] [--interval=60]
  node dist/main.js param-schedules [--once] [--interval=60]  (alias)
  node dist/main.js prune
  node dist/main.js l2-reeval [--project=urbanism]

Env:
  DATABASE_URL  (required)`)
}
