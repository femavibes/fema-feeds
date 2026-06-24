import type { ProjectL1Config } from '@cfb/core-types'
import { startJetstreamIngest } from '@cfb/ingest-jetstream'
import { compileAllProjects } from '@cfb/l1-compile'
import { evaluateMergedL1, getMatchedProjects } from '@cfb/l1-eval'
import { loadAllFeeds } from '@cfb/feed-config'
import { prepareProjectsForIngest } from '@cfb/list-cache'
import { loadAllProjects } from '@cfb/project-config'
import { loadL1FollowRingsForProjects, loadIngestGateExtrasForProjects } from '@cfb/l2-worker'
import type { Pool } from '@cfb/storage-postgres'
import { resolve } from 'node:path'
import { projectsForIngestBenchmark } from './ingest-test-config.js'

const DEFAULT_JETSTREAM_URL = 'wss://jetstream1.us-east.bsky.network/subscribe'

export interface IngestSmokeTestResult {
  id?: number
  durationSec: number
  finishedAt: string
  ignorePrefilters: boolean
  seen: number
  wouldSave: number
  passRatePct: string
  postsPerSec: string
  enabledProjects: number
  byProject: Record<string, number>
}

export interface IngestSmokeTestOptions {
  projectsDir: string
  feedsDir?: string
  durationSec: number
  ignorePrefilters?: boolean
  pool?: Pool | null
  jetstreamUrl?: string
  isIngestRunning?: () => boolean
}

let smokeTestInProgress = false
let lastSmokeTestResult: IngestSmokeTestResult | null = null

export function getLastIngestSmokeTestResult(): IngestSmokeTestResult | null {
  return lastSmokeTestResult
}

export function isIngestSmokeTestInProgress(): boolean {
  return smokeTestInProgress
}

export async function runIngestSmokeTest(
  options: IngestSmokeTestOptions,
): Promise<IngestSmokeTestResult> {
  if (smokeTestInProgress) {
    throw new Error('An ingest smoke test is already in progress')
  }
  if (options.isIngestRunning?.()) {
    throw new Error('Stop live ingest before running a smoke test')
  }

  const durationSec = Math.min(Math.max(options.durationSec, 10), 1800)
  const jetstreamUrl = options.jetstreamUrl ?? process.env.JETSTREAM_URL ?? DEFAULT_JETSTREAM_URL
  const ignorePrefilters = options.ignorePrefilters ?? false
  const pool = options.pool ?? null
  const feedsDir =
    options.feedsDir ?? resolve(options.projectsDir, '../feeds')

  const raw = await loadAllProjects(options.projectsDir)
  const feeds = await loadAllFeeds(feedsDir)
  const projects: ProjectL1Config[] = pool
    ? await prepareProjectsForIngest(pool, raw, feeds)
    : raw
  const enabled = projectsForIngestBenchmark(projects, ignorePrefilters)
  compileAllProjects(enabled)

  const accountFollowRings = pool
    ? await loadL1FollowRingsForProjects(pool, enabled)
    : {}
  const ingestGateExtrasByProject = pool
    ? await loadIngestGateExtrasForProjects(pool, enabled, feeds)
    : {}

  smokeTestInProgress = true
  let seen = 0
  let wouldSave = 0
  const byProject = new Map<string, number>()

  try {
    const { stop } = await startJetstreamIngest(jetstreamUrl, {
      onPost: (post) => {
        seen++
        const result = evaluateMergedL1(post, enabled, {
          accountFollowRings,
          ingestGateExtrasByProject,
        })
        const matched = getMatchedProjects(result)
        if (matched.length > 0) {
          wouldSave++
          for (const m of matched) {
            byProject.set(m.projectId, (byProject.get(m.projectId) ?? 0) + 1)
          }
        }
      },
    })

    await new Promise<void>((resolve) => setTimeout(resolve, durationSec * 1000))
    stop()
    await new Promise((r) => setTimeout(r, 300))
  } finally {
    smokeTestInProgress = false
  }

  const passRatePct = seen > 0 ? ((wouldSave / seen) * 100).toFixed(2) : '0.00'
  const postsPerSec = seen > 0 ? (seen / durationSec).toFixed(1) : '0.0'

  const result: IngestSmokeTestResult = {
    durationSec,
    finishedAt: new Date().toISOString(),
    ignorePrefilters,
    seen,
    wouldSave,
    passRatePct,
    postsPerSec,
    enabledProjects: enabled.length,
    byProject: Object.fromEntries(byProject.entries()),
  }
  lastSmokeTestResult = result
  return result
}
