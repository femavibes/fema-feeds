/**
 * Substitute promotion — vote intake at ingest, eval on SUBSTITUTE canvas path.
 * Configured via feed.sources.substitute (Sources tab), not match-tree nodes.
 */
import type { FeedConfig, NormalizedPost, SubstitutionDirection } from '@cfb/core-types'
import { substituteSourceEnabled } from '@cfb/core-types'
import type pg from 'pg'
import {
  insertSubstitutionVote,
  getSubstitutionVoteCount,
  getIngestedPost,
  ensureSubstitutionTables,
  isPostInPool,
} from '@cfb/storage-postgres'
import { normalizedPostFromRow } from '@cfb/storage-postgres'

export interface SubstitutePathwayInfo {
  feedId: string
  projectId: string
  pathwayId: string
  direction: SubstitutionDirection
  threshold: number
  timeWindowHours: number
}

/** Vote→promote pathways from sources.substitute. */
export function collectSubstitutePathways(feed: FeedConfig): SubstitutePathwayInfo[] {
  const sub = feed.sources?.substitute
  if (!substituteSourceEnabled(feed.sources) || !sub?.pathways?.length) return []
  return sub.pathways.map((p, i) => ({
    feedId: feed.feedId,
    projectId: feed.projectId,
    pathwayId: `substitute-${p.direction}-${i}`,
    direction: p.direction,
    threshold: p.threshold,
    timeWindowHours: p.timeWindowHours ?? 0,
  }))
}

/** Resolve the target URI from a post based on substitution direction. */
export function resolveTargetUri(
  post: NormalizedPost,
  direction: SubstitutionDirection,
): string | null {
  switch (direction) {
    case 'reply_to_root':
      return post.reply?.rootUri ?? null
    case 'reply_to_parent':
      return post.reply?.parentUri ?? null
    case 'quote_to_quoted':
      return post.embedDetail?.record?.uri ?? post.embedDetail?.quotedRecord?.uri ?? null
    case 'quoted_to_quoters':
    case 'replied_to_repliers':
      return post.uri
  }
}

export function resolveInverseSourceUri(
  post: NormalizedPost,
  direction: SubstitutionDirection,
): string | null {
  switch (direction) {
    case 'quoted_to_quoters':
      return post.embedDetail?.record?.uri ?? post.embedDetail?.quotedRecord?.uri ?? null
    case 'replied_to_repliers':
      return post.reply?.parentUri ?? post.reply?.rootUri ?? null
    default:
      return null
  }
}

export function postMatchesDirection(
  post: NormalizedPost,
  direction: SubstitutionDirection,
): boolean {
  switch (direction) {
    case 'reply_to_root':
    case 'reply_to_parent':
      return post.postKind === 'reply'
    case 'quote_to_quoted':
    case 'quoted_to_quoters':
      return post.postKind === 'quote'
    case 'replied_to_repliers':
      return post.postKind === 'reply'
  }
}

export function isInverseDirection(direction: SubstitutionDirection): boolean {
  return direction === 'quoted_to_quoters' || direction === 'replied_to_repliers'
}

let tablesEnsured = false

export interface ResolvedSubstitutionTarget {
  targetUri: string
  direction: SubstitutionDirection
  feedId: string
}

export interface SubstitutionResult {
  votesRecorded: number
  resolvedTargets: string[]
  resolved: ResolvedSubstitutionTarget[]
}

export async function processSubstitution(
  pool: pg.Pool,
  post: NormalizedPost,
  matchedProjectIds: string[],
  feeds: FeedConfig[],
): Promise<SubstitutionResult> {
  if (!tablesEnsured) {
    await ensureSubstitutionTables(pool)
    tablesEnsured = true
  }

  const projectSet = new Set(matchedProjectIds)
  const applicableFeeds = feeds.filter(
    (f) => f.enabled && (f.poolScope === 'global' || projectSet.has(f.projectId)),
  )

  let votesRecorded = 0
  const resolvedTargets: string[] = []
  const resolved: ResolvedSubstitutionTarget[] = []

  function markResolved(targetUri: string, direction: SubstitutionDirection, feedId: string): void {
    if (resolvedTargets.includes(targetUri)) return
    resolvedTargets.push(targetUri)
    resolved.push({ targetUri, direction, feedId })
  }

  for (const feed of applicableFeeds) {
    const subNodes = collectSubstitutePathways(feed)
    if (subNodes.length === 0) continue

    for (const node of subNodes) {
      if (!postMatchesDirection(post, node.direction)) continue

      if (isInverseDirection(node.direction)) {
        const referencedUri = resolveInverseSourceUri(post, node.direction)
        if (!referencedUri || referencedUri === post.uri) continue

        const inPool = await isPostInPool(pool, referencedUri)
        if (!inPool) continue

        await insertSubstitutionVote(pool, {
          projectId: node.projectId,
          feedId: node.feedId,
          pathwayId: node.pathwayId,
          targetUri: referencedUri,
          sourceUri: post.uri,
        })
        votesRecorded++

        const count = await getSubstitutionVoteCount(
          pool,
          node.projectId,
          node.feedId,
          node.pathwayId,
          referencedUri,
          node.timeWindowHours || undefined,
        )

        if (count >= node.threshold) {
          markResolved(post.uri, node.direction, node.feedId)
        }
      } else {
        const targetUri = resolveTargetUri(post, node.direction)
        if (!targetUri || targetUri === post.uri) continue

        await insertSubstitutionVote(pool, {
          projectId: node.projectId,
          feedId: node.feedId,
          pathwayId: node.pathwayId,
          targetUri,
          sourceUri: post.uri,
        })
        votesRecorded++

        const count = await getSubstitutionVoteCount(
          pool,
          node.projectId,
          node.feedId,
          node.pathwayId,
          targetUri,
          node.timeWindowHours || undefined,
        )

        if (count >= node.threshold) {
          markResolved(targetUri, node.direction, node.feedId)
        }
      }
    }
  }

  return { votesRecorded, resolvedTargets, resolved }
}

export async function resolveTargetPost(
  pool: pg.Pool,
  targetUri: string,
  fetchFromApi?: (uri: string) => Promise<NormalizedPost | null>,
): Promise<NormalizedPost | null> {
  const existing = await getIngestedPost(pool, targetUri)
  if (existing) return normalizedPostFromRow(existing)
  if (fetchFromApi) return fetchFromApi(targetUri)
  return null
}
