import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { readFile } from 'node:fs/promises'
import type { JetstreamPostEvent } from '@cfb/post-normalize'
import { ingestFixtureEvent } from '@cfb/ingest-jetstream'
import { compileAllProjects } from '@cfb/l1-compile'
import { evaluateMergedL1, getMatchedProjects } from '@cfb/l1-eval'
import { prepareProjectsForIngest } from '@cfb/list-cache'
import { loadAllProjects } from '@cfb/project-config'
import { createPool, type Pool } from '@cfb/storage-postgres'
import { createIngestRunner } from '@cfb/ingest-runner'

const root = resolve(import.meta.dirname, '../../..')
loadEnv({ path: resolve(root, '.env') })

const projectsDir = resolve(root, 'config/projects')

async function loadProjects(pool: Pool | null) {
  const raw = await loadAllProjects(projectsDir)
  const feedsDir = resolve(root, 'config/feeds')
  if (pool) {
    const { loadAllFeeds } = await import('@cfb/feed-config')
    return prepareProjectsForIngest(pool, raw, await loadAllFeeds(feedsDir))
  }
  const { refreshAllProjectAuthorLists } = await import('@cfb/list-sources')
  return refreshAllProjectAuthorLists(raw)
}

async function runFixture(fixturePath: string) {
  const raw = await readFile(fixturePath, 'utf8')
  const event = JSON.parse(raw) as JetstreamPostEvent
  const pool = process.env.DATABASE_URL ? createPool() : null
  const configs = await loadProjects(pool)
  compileAllProjects(configs)

  await ingestFixtureEvent(event, (post) => {
    const result = evaluateMergedL1(post, configs)
    const matched = getMatchedProjects(result)
    console.log(JSON.stringify({ post: post.uri, matchedCount: matched.length, matched }, null, 2))
  })
  if (pool) await pool.end()
}

const [cmd, arg] = process.argv.slice(2)

if (cmd === 'eval-fixture' && arg) {
  await runFixture(resolve(arg))
} else if (cmd === 'run-live' || cmd === 'run') {
  const durationSec = arg ? Number(arg) : undefined
  const runner = createIngestRunner({
    projectsDir,
    feedsDir: resolve(root, 'config/feeds'),
    ownsPool: true,
  })
  await runner.start()
  console.error('[ingest] running — Ctrl+C to stop')

  const shutdown = async () => {
    const status = await runner.stop()
    console.log(JSON.stringify(status, null, 2))
    process.exit(0)
  }

  if (durationSec && durationSec > 0) {
    setTimeout(() => { void shutdown() }, durationSec * 1000)
  } else {
    process.on('SIGINT', () => { void shutdown() })
  }
} else {
  console.log(`Usage:
  node dist/main.js eval-fixture <fixture.json>
  node dist/main.js run-live [seconds]
  node dist/main.js run

Or use the web UI / POST /api/ingest/start when the API is running.`)
}
