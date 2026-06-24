/** Per-viewer context passed to rankers at skeleton serve time (when authenticated). */
export interface ViewerContext {
  viewerDid: string
  /** Author DIDs from the viewer's follow graph (cached; may be a subset). */
  followedAuthorDids: string[]
  /** Recently served posts for this feed (demotion / unseen boost). */
  servedPosts: ServedPostRecord[]
  /** Post URIs the viewer liked (from sendInteractions). */
  likedPostUris: string[]
  /** Post URIs the viewer reposted (from sendInteractions). */
  repostedPostUris: string[]
}

export interface ServedPostRecord {
  postUri: string
  servedAt: string
  impressionCount: number
  seenConfirmed: boolean
}

/** Bluesky feed interaction events we persist from sendInteractions. */
export type FeedInteractionEvent =
  | 'interactionSeen'
  | 'interactionLike'
  | 'interactionRepost'
  | 'interactionReply'
  | 'interactionQuote'
  | 'interactionShare'
