import { loadProject, saveProject } from '@cfb/project-config'
import { loadAllFeeds } from '@cfb/feed-config'
import type { Pool } from '@cfb/storage-postgres'
import { applyStrictGateForProject } from '@cfb/l2-worker'

/**
 * Recompile strict gate for a project if it is in strict mode.
 * Fire-and-forget — errors are logged but don't block the caller.
 */
export function recompileStrictGateIfNeeded(
  projectsDir: string,
  feedsDir: string,
  projectId: string,
  pool: Pool | null,
): void {
  if (!pool) return
  void (async () => {
    try {
      const project = await loadProject(projectsDir, projectId)
      if (project.prefilterMode !== 'strict') return
      const allFeeds = await loadAllFeeds(feedsDir)
      const updated = await applyStrictGateForProject(pool, project, allFeeds)
      await saveProject(projectsDir, updated)
    } catch (err) {
      console.error('[strict-recompile] failed for', projectId, err)
    }
  })()
}
