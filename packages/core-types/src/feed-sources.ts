import type { ScoutAutoDeriveConfig, ScoutThresholdConfig } from './scout-discovery.js'
import type { SubstitutionDirection } from './substitution.js'

/** Pool scope — which posts the default START node evaluates. */
export type FeedPoolScope = 'project' | 'all_projects'

/**
 * Ingress that produced a feed candidate — for stats breakdown (UI later).
 * @see docs/FEED_SOURCES_PLAN.md
 */
export type FeedCandidateMatchVia =
  | 'pool'
  | 'scout'
  | 'substitute'
  | 'feed'
  | 'project_pool'
  | 'static_uri'
  | 'subscribed'

/** When the same post matches multiple paths, higher priority wins for attribution. */
export const MATCH_VIA_PRIORITY: Record<FeedCandidateMatchVia, number> = {
  substitute: 4,
  scout: 3,
  subscribed: 2,
  feed: 2,
  project_pool: 2,
  static_uri: 2,
  pool: 1,
}

export function preferMatchVia(
  current: FeedCandidateMatchVia | null | undefined,
  incoming: FeedCandidateMatchVia,
): FeedCandidateMatchVia {
  if (!current) return incoming
  return MATCH_VIA_PRIORITY[incoming] >= MATCH_VIA_PRIORITY[current] ? incoming : current
}

/** Canvas / eval ingress origin — maps to a source node id on the visual editor. */
export type FeedIngressOrigin = 'pool' | 'scout' | 'substitute' | `source-${number}`

export function ingressOriginToCanvasNode(origin: FeedIngressOrigin): string {
  return origin === 'pool' ? 'start' : origin
}

export function scoutSourceEnabled(sources?: FeedSourcesConfig): boolean {
  return Boolean(sources?.scout && (sources.scout.enabled ?? true))
}

export function substituteSourceEnabled(sources?: FeedSourcesConfig): boolean {
  return Boolean(sources?.substitute && (sources.substitute.enabled ?? true))
}

export function matchedViaForIngress(
  ingress: FeedIngressOrigin,
  feed: { sources?: FeedSourcesConfig },
): FeedCandidateMatchVia {
  if (ingress === 'pool') return 'pool'
  if (ingress === 'scout') return 'scout'
  if (ingress === 'substitute') return 'substitute'
  const m = /^source-(\d+)$/.exec(ingress)
  if (m) {
    const src = feed.sources?.native?.[Number(m[1])]
    if (src?.type === 'feed') return 'feed'
    if (src?.type === 'project_pool') return 'project_pool'
    if (src?.type === 'static_uri_list') return 'static_uri'
  }
  return 'pool'
}

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

/** Scout discovery source — engagement signals fetch external posts for eval. */
export interface ScoutFeedSource {
  type: 'scout'
  enabled?: boolean
  scouts?: string[]
  autoDerive?: ScoutAutoDeriveConfig
  threshold: ScoutThresholdConfig
  maxPostAgeHours?: number
}

/** One vote→promote pathway on the substitute source (replaces a substitute condition node). */
export interface SubstitutePathwayConfig {
  direction: SubstitutionDirection
  threshold: number
  timeWindowHours?: number
}

/** Substitute promotion source — replies/quotes vote; promoted target enters this ingress. */
export interface SubstituteFeedSource {
  type: 'substitute'
  enabled?: boolean
  pathways: SubstitutePathwayConfig[]
}

/** Full sources config on a feed. */
export interface FeedSourcesConfig {
  /** Native sources (other project pools, other feeds, static URIs). */
  native?: NativeFeedSource[]
  /** Subscribed custom code sources from marketplace. */
  subscribed?: SubscribedSourceConfig[]
  /** Scout discovery ingress (canvas: SCOUT → logic → END). */
  scout?: ScoutFeedSource
  /** Substitute promotion ingress (canvas: SUBSTITUTE → logic → END). */
  substitute?: SubstituteFeedSource
}
