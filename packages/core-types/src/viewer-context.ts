/** Per-viewer context passed to rankers at skeleton serve time (when authenticated). */
export interface ViewerContext {
  viewerDid: string
  /** Author DIDs from the viewer's follow graph (cached; may be a subset). */
  followedAuthorDids: string[]
  /** Recently served posts for this feed (serve/view history for personalization). */
  servedPosts: ServedPostRecord[]
  /** Post URIs the viewer liked (from sendInteractions). */
  likedPostUris: string[]
  /** Post URIs the viewer reposted (from sendInteractions). */
  repostedPostUris: string[]
}

export interface ServedPostRecord {
  postUri: string
  /** ISO timestamp — last time this post appeared in a skeleton response. */
  servedAt: string
  /** Times returned in getFeedSkeleton for this viewer+feed (DB: impression_count). */
  serveCount: number
  /** ISO timestamp — first client-reported interactionSeen, if any (DB: seen_at). */
  viewedAt: string | null
}

/** Bluesky feed interaction events we persist from sendInteractions. */
export type FeedInteractionEvent =
  | 'interactionSeen'
  | 'interactionLike'
  | 'interactionRepost'
  | 'interactionReply'
  | 'interactionQuote'
  | 'interactionShare'
