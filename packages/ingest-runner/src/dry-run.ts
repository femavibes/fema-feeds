import type { ProjectL1Config } from '@cfb/core-types'
import { startJetstreamIngest } from '@cfb/ingest-jetstream'
import { compileAllProjects } from '@cfb/l1-compile'
import { evaluateProjectL1 } from '@cfb/l1-eval'
import { refreshAllProjectAuthorLists } from '@cfb/list-sources'
import { prepareProjectsForIngest } from '@cfb/list-cache'
import { loadAllProjects, loadProject } from '@cfb/project-config'
import type { Pool } from '@cfb/storage-postgres'

const DEFAULT_JETSTREAM_URL = 'wss://jetstream1.us-east.bsky.network/subscribe'

export interface DryRunResult {
  projectId: string
  durationSec: number
  seen: number
  wouldSave: number
  passRatePct: string
  topRejectSteps: Record<string, number>
}

export interface DryRunOptions {
  projectsDir: string
  projectId: string
  durationSec: number
  pool?: Pool | null
  jetstreamUrl?: string
  /** Use in-memory project config (unsaved UI draft) instead of disk. */
  project?: ProjectL1Config
  isIngestRunning?: () => boolean
}

let dryRunInProgress = false

export async function runProjectDryRun(options: DryRunOptions): Promise<DryRunResult> {
  if (dryRunInProgress) {
    throw new Error('A dry run is already in progress')
  }
  if (options.isIngestRunning?.()) {
    throw new Error('Stop live ingest before running a dry run')
  }

  const durationSec = Math.min(Math.max(options.durationSec, 10), 1800)
  const jetstreamUrl = options.jetstreamUrl ?? process.env.JETSTREAM_URL ?? DEFAULT_JETSTREAM_URL
  const pool = options.pool ?? null

  let hydrated: ProjectL1Config
  if (options.project?.projectId === options.projectId) {
    hydrated = options.project
  } else {
    try {
      await loadProject(options.projectsDir, options.projectId)
    } catch {
      throw new Error(`Project not found: ${options.projectId}`)
    }
    const raw = await loadAllProjects(options.projectsDir)
    const projects = pool
      ? await prepareProjectsForIngest(pool, raw)
      : await refreshAllProjectAuthorLists(raw)
    const found = projects.find((p) => p.projectId === options.projectId)
    if (!found) throw new Error(`Project not found: ${options.projectId}`)
    hydrated = found
  }

  compileAllProjects([hydrated])

  dryRunInProgress = true
  let seen = 0
  let wouldSave = 0
  const rejectSteps = new Map<string, number>()

  try {
    const { stop } = await startJetstreamIngest(jetstreamUrl, {
      onPost: (post) => {
        seen++
        const result = evaluateProjectL1(post, hydrated)
        if (result.matched) {
          wouldSave++
        } else {
          const failed = result.trace.find((t) => t.outcome === 'fail')
          if (failed) rejectSteps.set(failed.stepId, (rejectSteps.get(failed.stepId) ?? 0) + 1)
        }
      },
    })

    await new Promise<void>((resolve) => setTimeout(resolve, durationSec * 1000))
    stop()
    await new Promise((r) => setTimeout(r, 300))
  } finally {
    dryRunInProgress = false
  }

  const passRatePct = seen > 0 ? ((wouldSave / seen) * 100).toFixed(2) : '0.00'
  const topRejectSteps = Object.fromEntries(
    [...rejectSteps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
  )

  return {
    projectId: options.projectId,
    durationSec,
    seen,
    wouldSave,
    passRatePct,
    topRejectSteps,
  }
}

export function isDryRunInProgress(): boolean {
  return dryRunInProgress
}
