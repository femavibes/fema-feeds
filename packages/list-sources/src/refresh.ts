import type { AuthorListConfig, ProjectL1Config } from '@cfb/core-types'
import { resolveAuthorListDids, type ListResolveOptions } from './resolve.js'

/** DIDs available after resolution (runtime L1 reads this). */
export function getResolvedDids(list: AuthorListConfig): string[] {
  return list.dids ?? []
}

/** Fetch all list sources and write merged DIDs onto each author list. */
export async function refreshAuthorList(
  list: AuthorListConfig,
  options?: ListResolveOptions,
): Promise<AuthorListConfig> {
  try {
    const dids = await resolveAuthorListDids(list, options)
    return { ...list, dids }
  } catch (err) {
    console.warn(`[list-sources] refresh failed for list "${list.listId}":`, err)
    return { ...list, dids: list.dids ?? [] }
  }
}

export async function refreshProjectAuthorLists(
  project: ProjectL1Config,
  options?: ListResolveOptions,
): Promise<ProjectL1Config> {
  if (!project.authorLists?.length) return project
  const authorLists = await Promise.all(
    project.authorLists.map((list) => refreshAuthorList(list, options)),
  )
  return { ...project, authorLists }
}

export async function refreshAllProjectAuthorLists(
  projects: ProjectL1Config[],
  options?: ListResolveOptions,
): Promise<ProjectL1Config[]> {
  return Promise.all(projects.map((p) => refreshProjectAuthorLists(p, options)))
}

/**
 * Returns minimum poll interval (minutes) for lists with bluesky_list sources.
 * Worker uses this to schedule refresh. Default 60.
 */
export function getPollIntervalMinutes(list: AuthorListConfig): number {
  const fromSources = (list.sources ?? [])
    .filter(
      (s): s is Extract<typeof s, { type: 'bluesky_list' | 'bluesky_starter_pack' }> =>
        s.type === 'bluesky_list' || s.type === 'bluesky_starter_pack',
    )
    .map((s) => s.pollIntervalMinutes ?? list.pollIntervalMinutes ?? 60)
  if (fromSources.length) return Math.min(...fromSources)
  return list.pollIntervalMinutes ?? 60
}
