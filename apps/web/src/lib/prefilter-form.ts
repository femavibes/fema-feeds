import type { FeedConfig, ProjectL1Config, ProjectPrefilter } from '@cfb/core-types'
import { emptyPrefilter, normalizePrefilter } from '@cfb/l1-compile'
import { newKeywordCondition } from './l2-form'

export const PREFILTER_PALETTE_IDS = new Set([
  'group-and',
  'group-or',
  'group-n-of',
  'keyword',
  'regex',
  'hashtag',
  'language',
  'labels',
  'embed',
  'post-kind',
  'follow-ring',
  'author',
])

export function ensurePrefilter(project: ProjectL1Config): ProjectPrefilter {
  return project.prefilter ?? emptyPrefilter()
}

export function prefilterToFeedDraft(project: ProjectL1Config): FeedConfig {
  const prefilter = normalizePrefilter(ensurePrefilter(project))
  return {
    feedId: '__prefilter__',
    projectId: project.projectId,
    name: 'Project prefilter',
    enabled: true,
    published: false,
    poolScope: 'project_only',
    match: prefilter.match,
    visualLayout: prefilter.visualLayout,
  }
}

export function feedDraftToPrefilter(feed: FeedConfig): ProjectPrefilter {
  return {
    match: feed.match,
    visualLayout: feed.visualLayout,
  }
}

export function patchProjectPrefilter(
  project: ProjectL1Config,
  prefilter: ProjectPrefilter,
): ProjectL1Config {
  return { ...project, prefilter }
}

export function newPrefilterKeywordNode() {
  const node = newKeywordCondition()
  delete (node as { runAtIngest?: boolean }).runAtIngest
  return node
}
