import type { ProjectL1Config } from '@cfb/core-types'
import { startJetstreamIngest } from '@cfb/ingest-jetstream'
import { compileAllProjects } from '@cfb/l1-compile'
import { evaluateMergedL1, getMatchedProjects } from '@cfb/l1-eval'
import { loadAllFeeds } from '@cfb/feed-config'
import { prepareProjectsForIngest } from '@cfb/list-cache'
import { loadAllProjects } from '@cfb/project-config'
import {
  persistL1Matches,
  type Pool,
  type StressTestSavedAssociation,
} from '@cfb/storage-postgres'
import { loadL1FollowRingsForProjects, loadIngestGateExtrasForProjects } from '@cfb/l2-worker'
import { resolve } from 'node:path'
import { projectsForIngestBenchmark } from './ingest-test-config.js'

const DEFAULT_JETSTREAM_URL = 'wss://jetstream1.us-east.bsky.network/subscribe'

export interface IngestStressTestResult {
  id?: number
  durationSec: number
  finishedAt: string
  ignorePrefilters: boolean
  seen: number
  l1Pass: number
  saved: number
  saveErrors: number
  backlog: number
  passRatePct: string
  writeSuccessPct: string
  postsPerSec: string
  savesPerSec: string
  enabledProjects: number
  byProject: Record<string, number>
  savedAssociations: StressTestSavedAssociation[]
  savedPostUris: string[]
}

export interface IngestStressTestOptions {
  projectsDir: string
  feedsDir?: string
  durationSec: number
  pool: Pool
  ignorePrefilters?: boolean
  jetstreamUrl?: string
  isIngestRunning?: () => boolean
}

let stressTestInProgress = false
let lastStressTestResult: IngestStressTestResult | null = null

export function getLastIngestStressTestResult(): IngestStressTestResult | null {
  return lastStressTestResult
}

export function isIngestStressTestInProgress(): boolean {
  return stressTestInProgress
}

export async function runIngestStressTest(
  options: IngestStressTestOptions,
): Promise<IngestStressTestResult> {
  if (stressTestInProgress) {
    throw new Error('An ingest stress test is already in progress')
  }
  if (options.isIngestRunning?.()) {
    throw new Error('Stop live ingest before running a stress test')
  }

  const durationSec = Math.min(Math.max(options.durationSec, 10), 1800)
  const jetstreamUrl = options.jetstreamUrl ?? process.env.JETSTREAM_URL ?? DEFAULT_JETSTREAM_URL
  const ignorePrefilters = options.ignorePrefilters ?? false
  const feedsDir =
    options.feedsDir ?? resolve(options.projectsDir, '../feeds')

  const raw = await loadAllProjects(options.projectsDir)
  const feeds = await loadAllFeeds(feedsDir)
  const hydrated = await prepareProjectsForIngest(options.pool, raw, feeds)
  const configs = projectsForIngestBenchmark(hydrated, ignorePrefilters)
  compileAllProjects(configs)

  const accountFollowRings = await loadL1FollowRingsForProjects(options.pool, configs)
  const ingestGateExtrasByProject = await loadIngestGateExtrasForProjects(
    options.pool,
    configs,
    feeds,
  )

  stressTestInProgress = true
  let seen = 0
  let l1Pass = 0
  let saved = 0
  let saveErrors = 0
  const byProject = new Map<string, number>()
  const savedAssociations: StressTestSavedAssociation[] = []
  const savedPostUris: string[] = []
  const pending: Promise<void>[] = []

  try {
    const { stop } = await startJetstreamIngest(jetstreamUrl, {
      onPost: (post) => {
        seen++
        const result = evaluateMergedL1(post, configs, {
          accountFollowRings,
          ingestGateExtrasByProject,
        })
        const matched = getMatchedProjects(result)
        if (matched.length === 0) return

        l1Pass++
        const task = persistL1Matches(options.pool, { post, matches: matched })
          .then(({ insertedProjectIds }) => {
            saved++
            savedPostUris.push(post.uri)
            for (const m of matched) {
              byProject.set(m.projectId, (byProject.get(m.projectId) ?? 0) + 1)
            }
            for (const projectId of insertedProjectIds) {
              savedAssociations.push({ postUri: post.uri, projectId })
            }
          })
          .catch(() => {
            saveErrors++
          })
        pending.push(task)
      },
    })

    await new Promise<void>((resolve) => setTimeout(resolve, durationSec * 1000))
    stop()
    await new Promise((r) => setTimeout(r, 300))
    await Promise.allSettled(pending)
  } finally {
    stressTestInProgress = false
  }

  const passRatePct = seen > 0 ? ((l1Pass / seen) * 100).toFixed(2) : '0.00'
  const writeSuccessPct = l1Pass > 0 ? ((saved / l1Pass) * 100).toFixed(2) : '0.00'
  const postsPerSec = seen > 0 ? (seen / durationSec).toFixed(1) : '0.0'
  const savesPerSec = saved > 0 ? (saved / durationSec).toFixed(1) : '0.0'
  const backlog = Math.max(0, l1Pass - saved - saveErrors)

  const result: IngestStressTestResult = {
    durationSec,
    finishedAt: new Date().toISOString(),
    ignorePrefilters,
    seen,
    l1Pass,
    saved,
    saveErrors,
    backlog,
    passRatePct,
    writeSuccessPct,
    postsPerSec,
    savesPerSec,
    enabledProjects: configs.length,
    byProject: Object.fromEntries(byProject.entries()),
    savedAssociations,
    savedPostUris,
  }
  lastStressTestResult = result
  return result
}
