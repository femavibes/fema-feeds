/** Native injector config — pinned posts and rotating content without custom code. */
export type NativeInjectorConfig = NativePinnedInjector | NativeRotatingInjector

export interface NativePinnedInjector {
  type: 'pinned'
  posts: NativePinnedPost[]
}

export interface NativePinnedPost {
  uri: string
  /** Position in the page (0 = top). */
  position: number
  /** Stop showing after this date. */
  expiresAt?: string
  /** Stop showing after this many impressions per viewer. */
  maxImpressions?: number
}

export interface NativeRotatingInjector {
  type: 'rotating'
  /** Pool of post URIs to cycle through. */
  pool: string[]
  /** Insert one every N organic posts. */
  interval: number
  /** Max injected per page. */
  maxPerPage: number
  /** How to pick from pool. */
  rotation: 'round-robin' | 'random' | 'least-shown'
  /** Stop showing a post after N impressions per viewer. */
  perViewerMaxImpressions?: number
  /** Stop the whole rotation after this date. */
  expiresAt?: string
}
