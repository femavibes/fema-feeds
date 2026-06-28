import { loadProject, saveProject } from '@cfb/project-config'
import { loadAllFeeds } from '@cfb/feed-config'
import { compileStrictGate, applyStrictGate } from '@cfb/l1-compile'

/**
 * Recompile strict gate for a project if it is in strict mode.
 * Fire-and-forget — errors are logged but don't block the caller.
 */
export function recompileStrictGateIfNeeded(
  projectsDir: string,
  feedsDir: string,
  projectId: string,
): void {
  void (async () => {
    try {
      const project = await loadProject(projectsDir, projectId)
      if (project.prefilterMode !== 'strict') return
      const allFeeds = await loadAllFeeds(feedsDir)
      const updated = applyStrictGate(project, compileStrictGate(project, allFeeds))
      await saveProject(projectsDir, updated)
    } catch {
      // non-critical — next config reload (60s) will pick it up
    }
  })()
}
