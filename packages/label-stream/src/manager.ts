import { resolve } from 'node:path'
import type { EnrichmentSettings, FeedConfig, ProjectL1Config } from '@cfb/core-types'
import { loadAllFeeds } from '@cfb/feed-config'
import { applyLabelEventToPoolPost } from '@cfb/label-refresh/apply'
import type { AtprotoLabel } from '@cfb/label-resolve'
import { loadHydratedProjects, seedAuthorListsFromProjects } from '@cfb/list-cache'
import { loadAllProjects } from '@cfb/project-config'
import type pg from 'pg'
import {
  getLabelStreamCursor,
  listEnabledLabelerDids,
  saveLabelStreamCursor,
} from '@cfb/storage-postgres'
import { resolvePoolTargetsForLabelUri } from './pool-targets.js'
import { resolveLabelerServiceEndpoint } from './resolve-endpoint.js'
import { connectLabelStream } from './subscribe.js'

export interface LabelStreamStats {
  connections: number
  events: number
  labelsProcessed: number
  postsChanged: number
  l1Removed: number
  l2Reevaluated: number
  errors: number
}

export interface LabelStreamManagerOptions {
  pool: pg.Pool
  projectsDir: string
  feedsDir?: string
  getSettings: () => Promise<EnrichmentSettings>
  labelerReloadMs?: number
  configReloadMs?: number
}

interface ActiveConnection {
  did: string
  connection: ReturnType<typeof connectLabelStream>
}

export interface LabelStreamManager {
  start: () => Promise<void>
  stop: () => void
  getStats: () => LabelStreamStats
}

export function createLabelStreamManager(options: LabelStreamManagerOptions): LabelStreamManager {
  const feedsDir = options.feedsDir ?? resolve(options.projectsDir, '../feeds')
  const labelerReloadMs = options.labelerReloadMs ?? 60_000
  const configReloadMs = options.configReloadMs ?? 60_000

  let running = false
  let labelerTimer: ReturnType<typeof setInterval> | null = null
  let configTimer: ReturnType<typeof setInterval> | null = null
  const connections = new Map<string, ActiveConnection>()
  let feeds: FeedConfig[] = []
  let projects: ProjectL1Config[] = []

  const stats: LabelStreamStats = {
    connections: 0,
    events: 0,
    labelsProcessed: 0,
    postsChanged: 0,
    l1Removed: 0,
    l2Reevaluated: 0,
    errors: 0,
  }

  async function reloadConfigs(): Promise<void> {
    const raw = await loadAllProjects(options.projectsDir)
    await seedAuthorListsFromProjects(options.pool, raw)
    projects = await loadHydratedProjects(options.pool, raw)
    feeds = await loadAllFeeds(feedsDir)
  }

  async function handleLabelEvent(labelerDid: string, label: AtprotoLabel, seq: number): Promise<void> {
    if (!label.val || !label.src) return
    if (label.src !== labelerDid) return

    stats.labelsProcessed++
    const targets = await resolvePoolTargetsForLabelUri(options.pool, label.uri ?? '')
    if (targets.length === 0) return

    for (const postUri of targets) {
      const result = await applyLabelEventToPoolPost(
        options.pool,
        postUri,
        label,
        feeds,
        projects,
      )
      if (!result?.changed) continue
      stats.postsChanged++
      stats.l1Removed += result.l1Removed
      if (result.l2Reevaluated) stats.l2Reevaluated++
    }

    if (seq > 0) {
      await saveLabelStreamCursor(options.pool, labelerDid, seq)
    }
  }

  async function connectLabeler(labelerDid: string): Promise<void> {
    if (connections.has(labelerDid)) return

    let endpoint: string
    try {
      endpoint = await resolveLabelerServiceEndpoint(labelerDid)
    } catch (err) {
      stats.errors++
      console.error(`[label-stream] endpoint resolve failed for ${labelerDid}:`, err)
      return
    }

    const cursor = await getLabelStreamCursor(options.pool, labelerDid)
    const connection = connectLabelStream(endpoint, cursor, {
      onLabels: async (labels, seq) => {
        stats.events++
        for (const label of labels) {
          try {
            await handleLabelEvent(labelerDid, label, seq)
          } catch {
            stats.errors++
          }
        }
      },
      onError: () => {
        stats.errors++
      },
    })

    connections.set(labelerDid, { did: labelerDid, connection })
    stats.connections = connections.size
  }

  function disconnectLabeler(labelerDid: string): void {
    const active = connections.get(labelerDid)
    if (!active) return
    active.connection.close()
    connections.delete(labelerDid)
    stats.connections = connections.size
  }

  async function syncLabelers(): Promise<void> {
    const settings = await options.getSettings()
    if (!settings.enabled || !settings.labelStreamEnabled) {
      for (const did of [...connections.keys()]) disconnectLabeler(did)
      return
    }

    const enabled = await listEnabledLabelerDids(options.pool)
    const enabledSet = new Set(enabled)

    for (const did of enabled) {
      await connectLabeler(did)
    }
    for (const did of connections.keys()) {
      if (!enabledSet.has(did)) disconnectLabeler(did)
    }
  }

  return {
    async start() {
      if (running) return
      running = true
      await reloadConfigs()
      await syncLabelers()
      labelerTimer = setInterval(() => {
        void syncLabelers().catch(() => undefined)
      }, labelerReloadMs)
      configTimer = setInterval(() => {
        void reloadConfigs().catch(() => undefined)
      }, configReloadMs)
    },
    stop() {
      running = false
      if (labelerTimer) {
        clearInterval(labelerTimer)
        labelerTimer = null
      }
      if (configTimer) {
        clearInterval(configTimer)
        configTimer = null
      }
      for (const did of [...connections.keys()]) disconnectLabeler(did)
    },
    getStats: () => ({ ...stats }),
  }
}
