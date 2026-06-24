import type { FeedConfig, LabelerLabel, NormalizedPost, ProjectL1Config } from '@cfb/core-types'
import { allLabelValues } from '@cfb/core-types'
import { compileAllProjects } from '@cfb/l1-compile'
import { evaluateProjectL1 } from '@cfb/l1-eval'
import type { AtprotoLabel } from '@cfb/label-resolve'
import { reevalPostInPool } from '@cfb/l2-worker'
import type pg from 'pg'
import {
  deleteFeedCandidate,
  getIngestedPost,
  getProjectIdsForPost,
  labelerLabelsFingerprint,
  normalizedPostFromRow,
  pruneOrphanPoolPost,
  removePostFromProject,
  updatePostLabelerLabels,
} from '@cfb/storage-postgres'

export interface PoolLabelApplyResult {
  postUri: string
  changed: boolean
  l1Removed: number
  l2Reevaluated: boolean
}

/** Apply one labeler label add/remove to a pooled post and re-run L1/L2. */
export function mergeLabelIntoList(
  existing: LabelerLabel[],
  event: Pick<AtprotoLabel, 'val' | 'src' | 'neg'>,
): LabelerLabel[] {
  if (event.neg) {
    return existing.filter((l) => !(l.src === event.src && l.val === event.val))
  }
  if (existing.some((l) => l.src === event.src && l.val === event.val)) return existing
  return [...existing, { val: event.val, src: event.src }]
}

export async function applyLabelerLabelsToPoolPost(
  pool: pg.Pool,
  postUri: string,
  labelerLabels: LabelerLabel[],
  feeds: FeedConfig[],
  projects: ProjectL1Config[],
): Promise<PoolLabelApplyResult | null> {
  const row = await getIngestedPost(pool, postUri)
  if (!row) return null

  const post = normalizedPostFromRow(row)
  const before = labelerLabelsFingerprint(post.labelerLabels)
  const after = labelerLabelsFingerprint(labelerLabels)
  if (before === after) {
    return { postUri, changed: false, l1Removed: 0, l2Reevaluated: false }
  }

  await updatePostLabelerLabels(pool, postUri, labelerLabels)
  const updated: NormalizedPost = {
    ...post,
    labelerLabels,
    allLabelVals: allLabelValues({ selfLabels: post.selfLabels, labelerLabels }),
  }

  compileAllProjects(projects)
  const projectsById = new Map(projects.map((p) => [p.projectId, p]))
  let l1Removed = 0

  const projectIds = await getProjectIdsForPost(pool, postUri)
  for (const projectId of projectIds) {
    const config = projectsById.get(projectId)
    if (!config) continue
    const l1 = evaluateProjectL1(updated, config)
    if (!l1.matched) {
      await removePostFromProject(pool, postUri, projectId)
      l1Removed++
      for (const feed of feeds) {
        if (feed.projectId === projectId) {
          await deleteFeedCandidate(pool, feed.feedId, postUri)
        }
      }
    }
  }

  const pruned = await pruneOrphanPoolPost(pool, postUri)
  let l2Reevaluated = false
  if (!pruned && feeds.length > 0) {
    await reevalPostInPool(pool, postUri, feeds)
    l2Reevaluated = true
  }

  return { postUri, changed: true, l1Removed, l2Reevaluated }
}

export async function applyLabelEventToPoolPost(
  pool: pg.Pool,
  postUri: string,
  event: AtprotoLabel,
  feeds: FeedConfig[],
  projects: ProjectL1Config[],
): Promise<PoolLabelApplyResult | null> {
  const row = await getIngestedPost(pool, postUri)
  if (!row) return null
  const post = normalizedPostFromRow(row)
  const next = mergeLabelIntoList(post.labelerLabels, event)
  return applyLabelerLabelsToPoolPost(pool, postUri, next, feeds, projects)
}
