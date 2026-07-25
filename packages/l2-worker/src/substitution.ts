/**
 * Substitution resolver — runs at ingest time.
 * When a post matches a pathway containing a Substitute node,
 * this module records a vote toward the target post and resolves it if threshold is met.
 *
 * Pathway-aware: only fires when the post passes the sibling conditions
 * in the same branch as the substitute node.
 */
import type { FeedConfig, L2EvalInput, L2NodeTrace, L2RuleNode, L2SubstituteCondition, NormalizedPost, SubstitutionDirection } from '@cfb/core-types'
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
import { resolveFeedMatch } from '@cfb/l2-graph'
import { evalRuleNode, buildL2Runtime } from '@cfb/l2-eval'

export interface SubstituteNodeInfo {
  feedId: string
  projectId: string
  /** The substitute node's id serves as pathway identifier. */
  pathwayId: string
  direction: SubstitutionDirection
  threshold: number
  timeWindowHours: number
  /** Sibling conditions that must pass for this substitution to fire. */
  siblings: L2RuleNode[]
}

export interface SubstitutePathwayInfo {
  feedId: string
  projectId: string
  pathwayId: string
  direction: SubstitutionDirection
  threshold: number
  timeWindowHours: number
  /** Legacy match-tree nodes only — canvas source pathways skip sibling gating on votes. */
  siblings?: L2RuleNode[]
}

/** Collect vote pathways from sources.substitute or legacy substitute condition nodes. */
export function collectSubstitutePathways(feed: FeedConfig): SubstitutePathwayInfo[] {
  const sub = feed.sources?.substitute
  if (substituteSourceEnabled(feed.sources) && sub?.pathways?.length) {
    return sub.pathways.map((p, i) => ({
      feedId: feed.feedId,
      projectId: feed.projectId,
      pathwayId: `substitute-${p.direction}-${i}`,
      direction: p.direction,
      threshold: p.threshold,
      timeWindowHours: p.timeWindowHours ?? 0,
    }))
  }
  return collectSubstituteNodes(feed).map((node) => ({
    feedId: node.feedId,
    projectId: node.projectId,
    pathwayId: node.pathwayId,
    direction: node.direction,
    threshold: node.threshold,
    timeWindowHours: node.timeWindowHours,
    siblings: node.siblings,
  }))
}

/** Walk a feed's rule tree and collect all Substitute nodes with their pathway siblings. */
export function collectSubstituteNodes(feed: FeedConfig): SubstituteNodeInfo[] {
  const results: SubstituteNodeInfo[] = []
  const match = resolveFeedMatch(feed)
  walkForSubstitute(match, feed.feedId, feed.projectId, results)
  return results
}

function walkForSubstitute(
  node: L2RuleNode,
  feedId: string,
  projectId: string,
  results: SubstituteNodeInfo[],
  parentSiblings: L2RuleNode[] = [],
): void {
  if (node.type === 'substitute') {
    results.push({
      feedId,
      projectId,
      pathwayId: node.id,
      direction: node.direction,
      threshold: node.threshold,
      timeWindowHours: node.timeWindowHours ?? 0,
      siblings: parentSiblings,
    })
    return
  }
  if (node.type === 'group') {
    for (const child of node.children) {
      // For 'all' groups, siblings are the other children (excluding substitute nodes)
      // For 'any' groups, no sibling context passes down
      if (node.logic === 'all') {
        const siblings = [
          ...parentSiblings,
          ...node.children.filter((c) => c !== child && c.type !== 'substitute'),
        ]
        walkForSubstitute(child, feedId, projectId, results, siblings)
      } else {
        walkForSubstitute(child, feedId, projectId, results, parentSiblings)
      }
    }
  }
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
      // Inverse: the "target" to promote is the arriving post itself.
      // The referenced pool post is the vote trigger, not the target.
      return post.uri
  }
}

/**
 * For inverse directions, resolve the pool post URI that the arriving post references.
 * Returns null if the referenced post isn't relevant.
 */
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

/** Check if a post is eligible for a given substitution direction. */
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

/** Whether this direction is an inverse (pool post referenced → pull in the referencing post). */
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
  /** @deprecated Prefer `resolved` — kept for callers that only need URIs. */
  resolvedTargets: string[]
  resolved: ResolvedSubstitutionTarget[]
}

/**
 * Process substitution for a post that matched L1.
 * Only records votes when the post passes the pathway's sibling conditions.
 * Returns target URIs that crossed threshold.
 */
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

      // Legacy: sibling conditions on match-tree substitute nodes.
      if (node.siblings?.length && !postPassesSiblings(post, node.siblings)) continue

      if (isInverseDirection(node.direction)) {
        // Inverse: post references a pool post → the arriving post is the candidate
        const referencedUri = resolveInverseSourceUri(post, node.direction)
        if (!referencedUri || referencedUri === post.uri) continue

        // Only fire if the referenced post is actually in the pool
        const inPool = await isPostInPool(pool, referencedUri)
        if (!inPool) continue

        // Vote key: the referenced pool post URI (accumulates votes from multiple quoters/repliers)
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

        // When threshold met, promote the arriving post (and any other quoters/repliers)
        if (count >= node.threshold) {
          markResolved(post.uri, node.direction, node.feedId)
        }
      } else {
        // Standard: arriving post is the source, resolve the target to promote
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

/** Evaluate sibling conditions against a post (lightweight L2 eval without metrics).
 * Strips post_kind nodes since the substitute direction already implies the post kind. */
function postPassesSiblings(post: NormalizedPost, siblings: L2RuleNode[]): boolean {
  const ctx = buildL2Runtime(post, {})
  const input: L2EvalInput = {}
  const traces: L2NodeTrace[] = []
  for (const sibling of siblings) {
    const stripped = stripPostKindNodes(sibling)
    if (!stripped) continue
    if (!evalRuleNode(stripped, ctx, input, traces)) return false
  }
  return true
}

/** Recursively remove post_kind nodes from a rule tree. */
function stripPostKindNodes(node: L2RuleNode): L2RuleNode | null {
  if (node.type === 'post_kind') return null
  if (node.type !== 'group') return node
  const children = node.children
    .map(stripPostKindNodes)
    .filter((c): c is L2RuleNode => c !== null)
  if (children.length === 0) return null
  return { ...node, children }
}

/**
 * Resolve a target post — fetch from pool or via Bluesky API.
 * Returns the NormalizedPost if available, null if not resolvable.
 */
export async function resolveTargetPost(
  pool: pg.Pool,
  targetUri: string,
  fetchFromApi?: (uri: string) => Promise<NormalizedPost | null>,
): Promise<NormalizedPost | null> {
  // Check pool first
  const existing = await getIngestedPost(pool, targetUri)
  if (existing) return normalizedPostFromRow(existing)

  // Fetch via API if provided
  if (fetchFromApi) {
    return fetchFromApi(targetUri)
  }

  return null
}
