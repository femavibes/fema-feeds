import type { FeedConfig, L2FollowRingCondition, L2RuleNode, NormalizedPost, ProjectL1Config } from '@cfb/core-types'
import { discoverFromRing, isDiscoverRing } from '@cfb/l2-worker'
import { getIngestedPost, persistL1Matches } from '@cfb/storage-postgres'
import type pg from 'pg'

function walkNodes(node: L2RuleNode): L2RuleNode[] {
  const out: L2RuleNode[] = [node]
  if (node.type === 'group') {
    for (const child of node.children) out.push(...walkNodes(child))
  }
  return out
}

export interface DiscoverPollStats {
  polls: number
  fetched: number
  newPosts: number
  evalPass: number
  errors: number
}

export interface DiscoverPollOptions {
  /** Process a discovered post through L2 eval. */
  onDiscovered: (post: NormalizedPost, projectId: string) => Promise<boolean>
  /** Authors to fetch per ring per poll cycle. Default 3. */
  authorsPerPoll?: number
}

interface DiscoverRingEntry {
  projectId: string
  nodeId: string
  cfg: L2FollowRingCondition
}

/**
 * Starts a periodic poller for follow ring discover mode.
 * Fetches recent posts from ring members and runs them through eval.
 */
export function startFollowRingDiscoverPoll(
  pool: pg.Pool,
  projects: ProjectL1Config[],
  feeds: FeedConfig[],
  intervalMs: number,
  options: DiscoverPollOptions,
): { stop: () => void; stats: DiscoverPollStats } {
  const stats: DiscoverPollStats = { polls: 0, fetched: 0, newPosts: 0, evalPass: 0, errors: 0 }

  function collectDiscoverRings(): DiscoverRingEntry[] {
    const entries: DiscoverRingEntry[] = []
    // From project L1 config
    for (const project of projects) {
      if (!project.enabled || !project.followRing) continue
      if (isDiscoverRing(project.followRing)) {
        entries.push({
          projectId: project.projectId,
          nodeId: `l1:${project.projectId}`,
          cfg: {
            type: 'follow_ring',
            id: `l1:${project.projectId}`,
            op: project.followRing.op,
            hubSource: project.followRing.hubSource,
            hub: project.followRing.hub,
            direction: project.followRing.direction,
            pollIntervalMinutes: project.followRing.pollIntervalMinutes,
            role: 'discover',
          },
        })
      }
    }
    // From feed L2 nodes
    for (const feed of feeds) {
      if (!feed.enabled) continue
      for (const node of walkNodes(feed.match)) {
        if (node.type === 'follow_ring' && node.role === 'discover') {
          entries.push({ projectId: feed.projectId, nodeId: node.id, cfg: node })
        }
      }
    }
    return entries
  }

  async function poll(): Promise<void> {
    stats.polls++
    const rings = collectDiscoverRings()
    for (const entry of rings) {
      try {
        const result = await discoverFromRing(
          pool,
          entry.nodeId,
          entry.cfg,
          async (uri) => !!(await getIngestedPost(pool, uri)),
          { limit: options.authorsPerPoll ?? 3 },
        )
        stats.fetched += result.fetched
        for (const post of result.newPosts) {
          stats.newPosts++
          const projectMatches = [{ projectId: entry.projectId, matched: true, matchedVia: 'jetstream' as const, trace: [] }]
          await persistL1Matches(pool, { post, matches: projectMatches })
          const passed = await options.onDiscovered(post, entry.projectId)
          if (passed) stats.evalPass++
        }
      } catch {
        stats.errors++
      }
    }
  }

  const timer = setInterval(() => { void poll() }, intervalMs)
  // Initial poll on startup
  void poll()

  return {
    stop: () => clearInterval(timer),
    stats,
  }
}
