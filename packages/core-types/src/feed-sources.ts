/** Pool scope — which posts the default START node evaluates. */
export type FeedPoolScope = 'project' | 'all_projects'

/** Native feed source — provides additional posts for evaluation without custom code. */
export type NativeFeedSource = ProjectPoolSource | FeedCandidateSource | StaticUriListSource

export interface ProjectPoolSource {
  type: 'project_pool'
  /** ID of another project on this deployment whose pool to pull from. */
  projectId: string
}

export interface FeedCandidateSource {
  type: 'feed'
  /** Feed ID on this deployment whose scored candidates to import. */
  feedId: string
}

export interface StaticUriListSource {
  type: 'static_uri_list'
  /** AT-URIs of posts to include in evaluation. */
  uris: string[]
}

/** Subscribed custom code source — fetches posts from external systems. */
export interface SubscribedSourceConfig {
  packageId: string
  versionPin: string
  config?: Record<string, unknown>
}

/** Full sources config on a feed. */
export interface FeedSourcesConfig {
  /** Native sources (other project pools, other feeds, static URIs). */
  native?: NativeFeedSource[]
  /** Subscribed custom code sources from marketplace. */
  subscribed?: SubscribedSourceConfig[]
}
