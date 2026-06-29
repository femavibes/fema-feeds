/** Numeric fields for L2 conditions and rank expressions. */
export type L2NumericField =
  | 'like_count'
  | 'repost_count'
  | 'reply_count'
  | 'quote_count'
  | 'bookmark_count'
  | 'author_follower_count'
  | 'author_follows_count'
  | 'author_posts_count'
  | 'facet_tag_count'
  | 'hidden_facet_tag_count'
  | 'outline_tag_count'
  | 'text_length'
  | 'media_type'
  | 'post_age_hours'
  | 'image_count'
  | 'image_max_size_bytes'
  | 'image_min_size_bytes'
  | 'image_total_size_bytes'
  | 'image_max_aspect_w'
  | 'image_max_aspect_h'
  | 'video_size_bytes'
  | 'video_aspect_w'
  | 'video_aspect_h'
  | 'link_thumb_size_bytes'
  | 'facet_link_count'
  | 'facet_mention_count'
  | 'editor_score'

/** Subset of numeric fields exposed in the Media stats condition UI. */
export type L2MediaStatMetric = Extract<
  L2NumericField,
  | 'image_count'
  | 'image_max_size_bytes'
  | 'image_min_size_bytes'
  | 'image_total_size_bytes'
  | 'image_max_aspect_w'
  | 'image_max_aspect_h'
  | 'video_size_bytes'
  | 'video_aspect_w'
  | 'video_aspect_h'
  | 'link_thumb_size_bytes'
  | 'facet_link_count'
  | 'facet_mention_count'
>

export type L2BoolField =
  | 'has_video'
  | 'has_image'
  | 'has_link_card'
  | 'has_quote'
  | 'has_record'
  | 'has_text_only'

export type L2CompareOp = '==' | '!=' | '<' | '<=' | '>' | '>='

export type L2ArithmeticOp = '+' | '-' | '*' | '/' | '**' | 'min' | 'max'

export type L2UnaryOp = 'log' | 'sqrt' | 'abs' | 'floor' | 'ceil' | 'neg'

/** Expression tree for sort formulas (arithmetic + functions). */
export type L2Expr =
  | { type: 'literal'; value: number }
  | { type: 'field'; field: L2NumericField }
  | { type: 'enrichment_field'; enricherId: string; field: string }
  | { type: 'binary'; op: L2ArithmeticOp; left: L2Expr; right: L2Expr }
  | { type: 'unary'; op: L2UnaryOp; operand: L2Expr }
  | { type: 'clamp'; value: L2Expr; min: L2Expr; max: L2Expr }
  | { type: 'cond'; op: L2CompareOp; left: L2Expr; right: L2Expr; then: L2Expr; else: L2Expr }
  | { type: 'ratio'; numerator: L2Expr; denominator: L2Expr; guard?: number }

export type L2GroupLogic = 'all' | 'any' | 'n_of' | 'none'

export interface L2RuleGroup {
  type: 'group'
  id: string
  logic: L2GroupLogic
  children: L2RuleNode[]
  /** For n_of: how many children must pass (default 2) */
  minPass?: number
  /** Optional label from Graze metadata.title or user note */
  label?: string
}

export interface L2TextCondition {
  type: 'text'
  id: string
  field: 'text'
  op: 'contains' | 'not_contains' | 'equals' | 'regex'
  value: string
  caseInsensitive?: boolean
}

/** Multi-field keyword search — mirrors L1 keyword include/exclude. */
export interface L2KeywordCondition {
  type: 'keyword'
  id: string
  op: 'includes' | 'excludes'
  terms: string[]
  fields: import('./post-record.js').PostSearchField[]
  caseSensitive?: boolean
  wholeWord?: boolean
  /** Compile into project ingest gate when live (default true). */
  runAtIngest?: boolean
}

/** Regex across one or more searchable fields (body, alt text, links, facets). */
export interface L2RegexCondition {
  type: 'regex'
  id: string
  op: 'matches' | 'not_matches'
  pattern: string
  fields: import('./post-record.js').PostSearchField[]
  caseInsensitive?: boolean
  /** Compile into project ingest gate when live (default false). */
  runAtIngest?: boolean
}

export interface L2BoolCondition {
  type: 'bool'
  id: string
  field: L2BoolField
  value: boolean
  runAtIngest?: boolean
}

/** Post shape from normalized ingest (root / reply / quote / repost). */
export interface L2PostKindCondition {
  type: 'post_kind'
  id: string
  kinds: ('root' | 'reply' | 'quote' | 'repost')[]
  op: 'is' | 'is_not'
  runAtIngest?: boolean
}

/** Language allowlist — mirrors L1 language + unknown-lang policy. */
export interface L2LanguageCondition {
  type: 'language'
  id: string
  allow: string[]
  unknown: 'include' | 'exclude'
  runAtIngest?: boolean
}

export interface L2LabelsCondition {
  type: 'labels'
  id: string
  op: 'includes' | 'excludes'
  values: string[]
  /** all = self + labeler; self = record only; labeler = resolved moderation only */
  scope: import('./labels.js').LabelSourceScope
  /** When scope is labeler, optionally restrict to these labeler DIDs. */
  labelerDids?: string[]
  runAtIngest?: boolean
}

export interface L2HashtagCondition {
  type: 'hashtag'
  id: string
  op: 'includes' | 'excludes'
  tags: string[]
  /** Compile into project ingest gate when live (default true). */
  runAtIngest?: boolean
}

/** Substring match on link card, facet, and/or bridged URLs — not plain post text. */
export interface L2UrlCondition {
  type: 'url'
  id: string
  op: 'includes' | 'excludes'
  patterns: string[]
  sources: import('./post-record.js').PostUrlSource[]
  caseSensitive?: boolean
}

/** Match @mention facet DIDs — handles or DIDs in accounts; optional Bluesky list URI. */
export interface L2MentionCondition {
  type: 'mention'
  id: string
  op: 'includes' | 'excludes'
  /** Handles (user.bsky.social) or DIDs (did:plc:…). Resolved before eval. */
  accounts: string[]
  /** Advanced: also match facet mentions of anyone on this Bluesky list (must be synced). */
  listUri?: string
}

/** Near You–style media bucket from ingest rank_snapshot (0=text … 5=quote). */
export type L2MediaTypeValue = 0 | 1 | 2 | 3 | 4 | 5

export interface L2MediaTypeCondition {
  type: 'media_type'
  id: string
  op: 'is' | 'is_not'
  mediaTypes: L2MediaTypeValue[]
}

/** Alt text on image/video/gif posts (from rank_snapshot.hasAltText). */
export interface L2AltTextCondition {
  type: 'alt_text'
  id: string
  op: 'has' | 'missing'
}

/** Post freshness by indexedAt or record createdAt. */
export interface L2PostAgeCondition {
  type: 'post_age'
  id: string
  /** newer_than = within last N hours; older_than = at least N hours old */
  op: 'newer_than' | 'older_than'
  hours: number
  use: 'indexed_at' | 'created_at'
}

/** Compare embed metadata stats — image count, file sizes, aspect ratios, etc. */
export interface L2MediaStatsCondition {
  type: 'media_stats'
  id: string
  metric: L2MediaStatMetric
  op: L2CompareOp
  value: number
}

/** Match embed blob mime types (image/jpeg, video/mp4, …). */
export interface L2MimeTypeCondition {
  type: 'mime_type'
  id: string
  op: 'includes' | 'excludes'
  /** Substring match against any embed mime (case-insensitive). */
  pattern: string
}

export interface L2AuthorCondition {
  type: 'author'
  id: string
  op: 'in_list' | 'not_in_list'
  /** Manual DIDs or cached list id from author_list_cache */
  listId?: string
  dids?: string[]
  runAtIngest?: boolean
  /**
   * When pool ingest is on: block posts from authors not on this list, even if other
   * discovery rules (keywords, etc.) would match.
   */
  authorsOnly?: boolean
}

export interface L2FollowRingCondition {
  type: 'follow_ring'
  id: string
  op: 'includes' | 'excludes'
  /** account = fixed hub (cached at ingest); viewer = viewing user at skeleton serve */
  hubSource?: import('./follow-ring.js').FollowRingHubSource
  /** Hub handle or DID when hubSource is account (default). */
  hub?: string
  /** follows = hub's follows; followers = hub's followers; both = union of the two */
  direction: import('./follow-ring.js').FollowRingDirection
  /** How often to refresh the cached DID set (minutes). Default 60. */
  pollIntervalMinutes?: number
  runAtIngest?: boolean
}

/** Compare two numeric expressions — e.g. (like_count + repost_count) >= 10 */
export interface L2CompareCondition {
  type: 'compare'
  id: string
  left: L2Expr
  op: L2CompareOp
  right: L2Expr
}

/** Score node — adds editor_score to posts that pass through it. */
export interface L2ScoreCondition {
  type: 'score'
  id: string
  /** Points added to post's editor_score when it passes through this node. */
  points: number
}

/** Preserved Graze leaf node not yet mapped to a native L2 condition */
export interface L2GrazeStubCondition {
  type: 'graze_stub'
  id: string
  grazeType: string
  payload: unknown
  title?: string
}

/** Reference to a published native logic block — resolved at eval time. */
export interface L2LogicBlockRefCondition {
  type: 'logic_block_ref'
  id: string
  packageId: string
  versionPin: string
  label?: string
  updatePolicy?: import('./logic-blocks.js').LogicBlockUpdatePolicy
}

export type L2RuleNode =
  | L2RuleGroup
  | L2TextCondition
  | L2KeywordCondition
  | L2RegexCondition
  | L2BoolCondition
  | L2PostKindCondition
  | L2LanguageCondition
  | L2LabelsCondition
  | L2HashtagCondition
  | L2UrlCondition
  | L2MentionCondition
  | L2FollowRingCondition
  | L2MediaTypeCondition
  | L2AltTextCondition
  | L2PostAgeCondition
  | L2MediaStatsCondition
  | L2MimeTypeCondition
  | L2AuthorCondition
  | L2CompareCondition
  | L2ScoreCondition
  | L2GrazeStubCondition
  | L2LogicBlockRefCondition

export type L2PoolScope = 'project_only' | 'global'

/** Where a canvas node came from — drives palette grouping and node chrome. */
export type L2NodeProvenance = 'native' | 'collection' | 'subscription' | 'custom_code'

/** Saved visual editor canvas state (feeds and logic blocks). */
export interface L2VisualLayout {
  positions: Record<string, { x: number; y: number }>
  edges?: Array<{ id: string; source: string; target: string; branch?: boolean }>
  /** Optional display names for condition nodes (groups use match.label). */
  labels?: Record<string, string>
  /** Canvas styling: native built-ins vs collection / subscription / custom code. */
  nodeSources?: Record<string, L2NodeProvenance>
}

export interface FeedConfig {
  feedId: string
  projectId: string
  name: string
  /** Bluesky DID of the account that owns this feed. Set from OAuth session on save. */
  ownerDid?: string
  description?: string
  /** Published at://…/app.bsky.feed.generator/… URI; else built from FEEDGEN_DID + atprotoRkey. */
  publishedUri?: string
  /** Generator record rkey when published; defaults to feedId. */
  atprotoRkey?: string
  /** Live rules are evaluated by L2 ingest + candidate rebuild (set on Update). */
  enabled: boolean
  /** Listed on Bluesky describeFeedGenerator and served via getFeedSkeleton. */
  published?: boolean
  /** ISO timestamp when rules last went live (Update). */
  liveAt?: string
  /** ISO timestamp when first published to Bluesky. */
  publishedAt?: string
  /** Which ingested pool posts this feed can see. Default project_only. */
  poolScope: L2PoolScope
  /** Author lists defined for this feed only (not used at L1 ingestion). */
  authorLists?: import('./index.js').FeedAuthorListConfig[]
  /** Root group — typically ANY of AND-groups (Graze-style). */
  match: L2RuleGroup
  /** Saved canvas layout for the visual editor (optional). */
  visualLayout?: L2VisualLayout
  /** Optional sort — inline L2Expr and/or subscribed sort pack ref. */
  rank?: import('./sort-packs.js').FeedRankConfig
  /** Post-sort injection (ads, promos) — applied at getFeedSkeleton. */
  injector?: import('./plugins.js').FeedInjectorConfig
}

/** Engagement metrics — hydrated when available; default 0 at eval time. */
export interface PostMetrics {
  likeCount?: number
  repostCount?: number
  replyCount?: number
  quoteCount?: number
  bookmarkCount?: number
  authorFollowerCount?: number
  authorFollowsCount?: number
  authorPostsCount?: number
}

export interface L2EvalInput {
  metrics?: PostMetrics
  /** Fixed clock for post_age conditions (defaults to Date.now()). */
  nowMs?: number
  /** Editor preview — evaluate rules even when feed.enabled is false. */
  preview?: boolean
  /** Resolved author list DIDs for in_list conditions */
  authorLists?: Record<string, string[]>
  /** Resolved mention target DIDs keyed by mention condition node id */
  mentionDids?: Record<string, string[]>
  /** Resolved follow-ring DID sets keyed by follow_ring node id */
  followRings?: Record<string, string[]>
  /** Resolve marketplace / collection logic blocks at eval time (dereference). */
  resolveLogicBlock?: (ref: import('./logic-blocks.js').LogicBlockRef) => L2RuleGroup | null
}

export type L2NodeOutcome = 'pass' | 'fail' | 'skip'

export interface L2NodeTrace {
  nodeId: string
  nodeType: L2RuleNode['type']
  outcome: L2NodeOutcome
  detail?: string
}

export interface L2EvalResult {
  feedId: string
  matched: boolean
  sortKey: number | null
  /** Editorial score accumulated from Score nodes in the graph (+1 at END). */
  editorScore: number
  trace: L2NodeTrace[]
}
