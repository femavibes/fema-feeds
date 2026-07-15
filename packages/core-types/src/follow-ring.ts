/** Who supplies the hub for a follow-ring filter. */
export type FollowRingHubSource = 'account' | 'viewer'

export type FollowRingDirection = 'follows' | 'followers' | 'both'

export type FollowRingOp = 'includes' | 'excludes'

/** Role determines whether the ring gates incoming posts or discovers new ones. */
export type FollowRingRole = 'filter' | 'discover'

/** Shared follow-ring shape for L1 project config and L2 nodes. */
export interface FollowRingFilterConfig {
  /** account = fixed hub (ingest + skeleton); viewer = viewing user's DID at skeleton only */
  hubSource?: FollowRingHubSource
  /** Required when hubSource is account (default). */
  hub?: string
  direction: FollowRingDirection
  op: FollowRingOp
  pollIntervalMinutes?: number
  /**
   * filter (default) = gate incoming posts by ring membership.
   * discover = pull recent posts from ring members (account hub only).
   */
  role?: FollowRingRole
}

export function followRingHubSource(source?: FollowRingHubSource): FollowRingHubSource {
  return source ?? 'account'
}

export function isViewerFollowRing(source?: FollowRingHubSource): boolean {
  return followRingHubSource(source) === 'viewer'
}

export function l1FollowRingNodeId(projectId: string): string {
  return `l1:${projectId}`
}

/** Human-readable ring direction for traces and UI summaries. */
export function formatFollowRingDirection(direction: FollowRingDirection): string {
  switch (direction) {
    case 'follows':
      return 'follows'
    case 'followers':
      return 'followers'
    case 'both':
      return 'follows+followers'
  }
}
