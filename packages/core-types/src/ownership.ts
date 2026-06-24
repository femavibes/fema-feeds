import type { FeedConfig, ProjectL1Config } from '@cfb/core-types'

/** Projects/feeds without ownerDid are legacy unclaimed — visible until first save stamps owner. */
export function projectVisibleToUser(
  project: ProjectL1Config,
  userDid: string | null,
): boolean {
  if (!userDid) return !project.ownerDid
  if (!project.ownerDid) return true
  return project.ownerDid === userDid
}

export function feedVisibleToUser(feed: FeedConfig, userDid: string | null): boolean {
  if (!userDid) return !feed.ownerDid
  if (!feed.ownerDid) return true
  return feed.ownerDid === userDid
}

export function stampProjectOwner(
  project: ProjectL1Config,
  userDid: string,
): ProjectL1Config {
  return { ...project, ownerDid: project.ownerDid ?? userDid }
}

export function stampFeedOwner(feed: FeedConfig, userDid: string): FeedConfig {
  return { ...feed, ownerDid: feed.ownerDid ?? userDid }
}
