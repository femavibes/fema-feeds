import type { ProjectL1Config } from '@cfb/core-types'

export interface CachedAuthorList {
  listId: string
  projectId: string
  dids: string[]
  memberCount: number
  refreshedAt: string
  nextPollAt: string | null
}

/** Merge cached DIDs onto in-memory project configs (runtime L1 reads list.dids). */
export function hydrateProjectsWithCache(
  projects: ProjectL1Config[],
  cache: Map<string, Pick<CachedAuthorList, 'dids'>>,
): ProjectL1Config[] {
  return projects.map((project) => {
    if (!project.authorLists?.length) return project
    return {
      ...project,
      authorLists: project.authorLists.map((list) => {
        const row = cache.get(list.listId)
        const manual = list.dids ?? []
        if (!row) return list
        return { ...list, dids: [...new Set([...row.dids, ...manual])] }
      }),
    }
  })
}

export function cacheMapFromRows(
  rows: Array<{ listId: string; dids: string[] }>,
): Map<string, Pick<CachedAuthorList, 'dids'>> {
  return new Map(rows.map((r) => [r.listId, { dids: r.dids }]))
}
