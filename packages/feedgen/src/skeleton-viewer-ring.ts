import type { FeedConfig, NormalizedPost, ProjectL1Config } from '@cfb/core-types'
import type { FollowRingDirection } from '@cfb/core-types'
import {
  collectAllViewerFollowRingNodes,
  collectViewerFollowRingNodes,
  evaluateViewerFollowRingOverlay,
  evaluateViewerFollowRingNode,
  projectViewerFollowRingNode,
} from '@cfb/l2-eval'
import {
  fetchActorFollowersDids,
  fetchActorFollowsDids,
} from '@cfb/viewer-graph'
import {
  loadRankerCandidates,
  resolveViewerFollowedDids,
  type SkeletonPost,
} from '@cfb/storage-postgres'
import type pg from 'pg'

async function resolveViewerDirectionRing(
  pool: pg.Pool,
  viewerDid: string,
  direction: FollowRingDirection,
  cache: Map<FollowRingDirection, string[]>,
): Promise<string[]> {
  const hit = cache.get(direction)
  if (hit) return hit

  let dids: string[]
  if (direction === 'both') {
    const [follows, followers] = await Promise.all([
      resolveViewerDirectionRing(pool, viewerDid, 'follows', cache),
      resolveViewerDirectionRing(pool, viewerDid, 'followers', cache),
    ])
    dids = [...new Set([...follows, ...followers])]
  } else if (direction === 'follows') {
    dids = await resolveViewerFollowedDids(pool, viewerDid, fetchActorFollowsDids)
  } else {
    try {
      dids = await fetchActorFollowersDids(viewerDid)
    } catch {
      dids = []
    }
  }
  cache.set(direction, dids)
  return dids
}

async function resolveViewerFollowRings(
  pool: pg.Pool,
  viewerDid: string,
  nodes: ReturnType<typeof collectAllViewerFollowRingNodes>,
): Promise<Record<string, string[]>> {
  const directionCache = new Map<FollowRingDirection, string[]>()
  const out: Record<string, string[]> = {}

  await Promise.all(
    nodes.map(async (node) => {
      out[node.id] = await resolveViewerDirectionRing(
        pool,
        viewerDid,
        node.direction,
        directionCache,
      )
    }),
  )

  return out
}

function postStub(uri: string, authorDid: string): NormalizedPost {
  return {
    uri,
    cid: '',
    authorDid,
    recordType: 'app.bsky.feed.post',
    text: '',
    createdAt: new Date(0).toISOString(),
    langs: [],
    selfLabels: [],
    labelerLabels: [],
    postKind: 'root',
    embed: {
      hasVideo: false,
      hasImage: false,
      hasLinkCard: false,
      hasQuote: false,
      hasRecord: false,
      hasTextOnly: true,
    },
    facetTags: [],
    hiddenFacetTags: [],
    facetLinks: [],
    facetMentions: [],
    outlineTags: [],
    indexedAt: new Date(0).toISOString(),
  }
}

/**
 * Apply viewer-hub follow rings at skeleton serve (L1 project + L2 feed rules).
 * Anonymous viewers skip viewer rings (fail open).
 */
export async function applyViewerFollowRingFilter(
  pool: pg.Pool,
  feed: FeedConfig,
  project: ProjectL1Config | undefined,
  posts: SkeletonPost[],
  viewerDid?: string,
): Promise<SkeletonPost[]> {
  if (!viewerDid || posts.length === 0) return posts

  const viewerNodes = collectAllViewerFollowRingNodes(feed, project)
  if (viewerNodes.length === 0) return posts

  const followRings = await resolveViewerFollowRings(pool, viewerDid, viewerNodes)
  const l1Node = project ? projectViewerFollowRingNode(project) : null
  const candidates = await loadRankerCandidates(
    pool,
    posts.map((p) => p.post),
  )
  const postByUri = new Map(candidates.map((c) => [c.uri, c]))

  return posts.filter((row) => {
    const candidate = postByUri.get(row.post)
    if (!candidate) return true
    const post = postStub(candidate.uri, candidate.authorDid)
    if (l1Node && !evaluateViewerFollowRingNode(post, l1Node, followRings)) return false
    if (collectViewerFollowRingNodes(feed).length === 0) return true
    return evaluateViewerFollowRingOverlay(post, feed.match, followRings)
  })
}
