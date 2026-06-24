import type { Context } from 'hono'
import type { FeedConfig, ProjectL1Config } from '@cfb/core-types'
import { feedVisibleToUser, projectVisibleToUser, stampFeedOwner, stampProjectOwner } from '@cfb/core-types'

export function getUserDid(c: Context): string | null {
  return (c.get('userDid') as string | null | undefined) ?? null
}

export function filterProjectsForUser(
  projects: ProjectL1Config[],
  userDid: string | null,
): ProjectL1Config[] {
  return projects.filter((p) => projectVisibleToUser(p, userDid))
}

export function filterFeedsForUser(feeds: FeedConfig[], userDid: string | null): FeedConfig[] {
  return feeds.filter((f) => feedVisibleToUser(f, userDid))
}

export function assertProjectAccess(
  project: ProjectL1Config,
  userDid: string | null,
): { ok: true } | { ok: false; status: 403 | 404 } {
  if (!projectVisibleToUser(project, userDid)) {
    return { ok: false, status: project.ownerDid ? 403 : 404 }
  }
  return { ok: true }
}

export function assertFeedAccess(
  feed: FeedConfig,
  userDid: string | null,
): { ok: true } | { ok: false; status: 403 | 404 } {
  if (!feedVisibleToUser(feed, userDid)) {
    return { ok: false, status: feed.ownerDid ? 403 : 404 }
  }
  return { ok: true }
}

export function stampProjectForSave(
  project: ProjectL1Config,
  userDid: string | null,
): ProjectL1Config {
  if (!userDid) return project
  return stampProjectOwner(project, userDid)
}

export function stampFeedForSave(feed: FeedConfig, userDid: string | null): FeedConfig {
  if (!userDid) return feed
  return stampFeedOwner(feed, userDid)
}
