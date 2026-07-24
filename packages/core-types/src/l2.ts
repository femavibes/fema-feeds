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
  | 'post_created_hours'
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
  | 'audience_like_count'
  | 'audience_repost_count'

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
  | 'has_gif'
  | 'has_image'
  | 'has_link_card'
  | 'has_quote'
  | 'has_record'
  | 'has_quote_with_media'
  | 'has_text_only'

/** Media kinds for the unified Media node (multi-toggle OR). */
export type L2MediaKind =
  | 'text_only'
  | 'image'
  | 'video'
  | 'gif'
  | 'link_card'
  | 'quote'
  | 'quote_with_media'

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

/** How Parameters interact with bound properties on a target node (default: override_when_on). */
export type L2ParamControlMode = 'override_when_on' | 'full_control'

export interface L2TextCondition {
  type: 'text'
  id: string
  paramControlMode?: L2ParamControlMode
  field: 'text'
  op: 'contains' | 'not_contains' | 'equals' | 'regex'
  value: string
  caseInsensitive?: boolean
}

/** Multi-field keyword search — mirrors L1 keyword include/exclude. */
export interface L2KeywordCondition {
  type: 'keyword'
  id: string
  paramControlMode?: L2ParamControlMode
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
  paramControlMode?: L2ParamControlMode
  op: 'matches' | 'not_matches'
  pattern: string
  fields: import('./post-record.js').PostSearchField[]
  caseInsensitive?: boolean
  /** Compile into project ingest gate when live (default false). */
  runAtIngest?: boolean
}

/** @deprecated Prefer L2MediaCondition (`type: 'media'`). Migrated on feed load. */
export interface L2BoolCondition {
  type: 'bool'
  id: string
  paramControlMode?: L2ParamControlMode
  field: L2BoolField
  value: boolean
  runAtIngest?: boolean
}

/** Unified Media node — multi-toggle OR over embed flags (Discover at L1 by default). */
export interface L2MediaCondition {
  type: 'media'
  id: string
  paramControlMode?: L2ParamControlMode
  op: 'is' | 'is_not'
  kinds: L2MediaKind[]
  /** Compile into project ingest gate when live (default true). */
  runAtIngest?: boolean
}

/** Post shape from normalized ingest (root / reply / quote / repost). */
export interface L2PostKindCondition {
  type: 'post_kind'
  id: string
  paramControlMode?: L2ParamControlMode
  kinds: ('root' | 'reply' | 'quote' | 'repost')[]
  op: 'is' | 'is_not'
  runAtIngest?: boolean
}

/** Language allowlist — mirrors L1 language + unknown-lang policy. */
export interface L2LanguageCondition {
  type: 'language'
  id: string
  paramControlMode?: L2ParamControlMode
  allow: string[]
  unknown: 'include' | 'exclude'
  runAtIngest?: boolean
}

export interface L2LabelsCondition {
  type: 'labels'
  id: string
  paramControlMode?: L2ParamControlMode
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
  paramControlMode?: L2ParamControlMode
  op: 'includes' | 'excludes'
  tags: string[]
  /** Compile into project ingest gate when live (default true). */
  runAtIngest?: boolean
}

/** Substring match on link card, facet, and/or bridged URLs — not plain post text. */
export interface L2UrlCondition {
  type: 'url'
  id: string
  paramControlMode?: L2ParamControlMode
  op: 'includes' | 'excludes'
  patterns: string[]
  sources: import('./post-record.js').PostUrlSource[]
  caseSensitive?: boolean
}

/** Match @mention facet DIDs — handles or DIDs in accounts; optional Bluesky list URI. */
export interface L2MentionCondition {
  type: 'mention'
  id: string
  paramControlMode?: L2ParamControlMode
  op: 'includes' | 'excludes'
  /** Handles (user.bsky.social) or DIDs (did:plc:…). Resolved before eval. */
  accounts: string[]
  /** Advanced: also match facet mentions of anyone on this Bluesky list (must be synced). */
  listUri?: string
  /**
   * filter = gate posts already in play (L2).
   * discover = pull matching mention posts into the L1 pool.
   * Default discover.
   */
  role?: import('./follow-ring.js').FollowRingRole
}

/** Near You–style media bucket from ingest rank_snapshot (0=text … 5=quote). */
export type L2MediaTypeValue = 0 | 1 | 2 | 3 | 4 | 5

/** @deprecated Prefer L2MediaCondition (`type: 'media'`). Migrated on feed load. */
export interface L2MediaTypeCondition {
  type: 'media_type'
  id: string
  paramControlMode?: L2ParamControlMode
  op: 'is' | 'is_not'
  mediaTypes: L2MediaTypeValue[]
}

/** Alt text on image/video/gif posts (from rank_snapshot.hasAltText). */
export interface L2AltTextCondition {
  type: 'alt_text'
  id: string
  paramControlMode?: L2ParamControlMode
  op: 'has' | 'missing'
}

/** Post freshness by indexedAt or record createdAt. */
export interface L2PostAgeCondition {
  type: 'post_age'
  id: string
  paramControlMode?: L2ParamControlMode
  /** newer_than = within last N hours; older_than = at least N hours old */
  op: 'newer_than' | 'older_than'
  hours: number
  use: 'indexed_at' | 'created_at'
}

/** Compare embed metadata stats — image count, file sizes, aspect ratios, etc. */
export interface L2MediaStatsCondition {
  type: 'media_stats'
  id: string
  paramControlMode?: L2ParamControlMode
  metric: L2MediaStatMetric
  op: L2CompareOp
  value: number
}

/** Match embed blob mime types (image/jpeg, video/mp4, …). */
export interface L2MimeTypeCondition {
  type: 'mime_type'
  id: string
  paramControlMode?: L2ParamControlMode
  op: 'includes' | 'excludes'
  /** Substring match against any embed mime (case-insensitive). */
  pattern: string
}

export interface L2AuthorCondition {
  type: 'author'
  id: string
  paramControlMode?: L2ParamControlMode
  op: 'in_list' | 'not_in_list'
  /** Manual DIDs or cached list id from author_list_cache */
  listId?: string
  dids?: string[]
  runAtIngest?: boolean
  /**
   * filter = gate posts already in play (L2 / path conjunct).
   * discover = list members can enter the L1 pool (like keyword include). Default discover.
   */
  role?: import('./follow-ring.js').FollowRingRole
  /**
   * Legacy / manual-prefilter only: block authors not on this list even if other
   * discovery would match. Unused under strict-from-feeds.
   */
  authorsOnly?: boolean
}

export interface L2FollowRingCondition {
  type: 'follow_ring'
  id: string
  paramControlMode?: L2ParamControlMode
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
  /** filter (default) = gate posts; discover = pull posts from ring members. */
  role?: import('./follow-ring.js').FollowRingRole
}

/** Compare two numeric expressions — e.g. (like_count + repost_count) >= 10 */
export interface L2CompareCondition {
  type: 'compare'
  id: string
  paramControlMode?: L2ParamControlMode
  left: L2Expr
  op: L2CompareOp
  right: L2Expr
}

/** Score node — adds editor_score to posts that pass through it. */
export interface L2ScoreCondition {
  type: 'score'
  id: string
  paramControlMode?: L2ParamControlMode
  /** Points added to post's editor_score when it passes through this node. */
  points: number
}

/** Preserved Graze leaf node not yet mapped to a native L2 condition */
export interface L2GrazeStubCondition {
  type: 'graze_stub'
  id: string
  paramControlMode?: L2ParamControlMode
  grazeType: string
  payload: unknown
  title?: string
}

/** Reference to a published native logic block — resolved at eval time. */
export interface L2LogicBlockRefCondition {
  type: 'logic_block_ref'
  id: string
  paramControlMode?: L2ParamControlMode
  packageId: string
  versionPin: string
  label?: string
  updatePolicy?: import('./logic-blocks.js').LogicBlockUpdatePolicy
  /**
   * Consumer overrides for Parameter Node controls inside the packaged root.
   * Keyed by param `name`; missing keys use the control default.
   */
  paramValues?: Record<string, boolean | string | string[]>
}

/** One option on an enum Parameter control (mode → which nodes exist / property writes). */
export interface L2ParamEnumOption {
  value: string
  label: string
  /** Node ids that exist when this option is selected (presence; legacy + shorthand). */
  targetNodeIds: string[]
  /** Richer targets for this mode (presence and/or property). */
  bindings?: L2ParamTargetBinding[]
}

/**
 * How a control attaches to a concrete node.
 * - presence: include/exclude the node (groups cascade)
 * - property: patch a whitelisted field on the node
 */
export type L2ParamBindingKind = 'presence' | 'property'

export interface L2ParamTargetBinding {
  nodeId: string
  kind: L2ParamBindingKind
  /** Whitelisted property key when kind is `property` (e.g. caseSensitive, allow). */
  property?: string
  /**
   * For array fields (language.allow, …): member token to add when active / remove when inactive.
   */
  member?: string
  /**
   * Desired property value when the Parameter control is active.
   * - Boolean Parameter + boolean field: `true`/`false` (default true) — inactive gets the inverse.
   * - Boolean Parameter + binary enum: which pole when active (default first/`includes`); inactive gets the other.
   * - Boolean Parameter + member: omit/`true` = add when active; `false` = remove when active.
   * - Dropdown Parameter option: absolute value written when that option is selected.
   * - Text/list fields: prefer `listValue` / `listWhenOff`; `value` may hold a single string.
   */
  value?: boolean | string | number
  /**
   * For stringList (and optional string) fields: list written when the control is active /
   * when this enum option is selected. Boolean inactive uses `listWhenOff` (default []).
   */
  listValue?: string[]
  /**
   * Legacy: unused for toggle-off (off keeps the node’s authored baseline).
   * Kept for older graphs that stored an explicit when-off list.
   */
  listWhenOff?: string[]
  /** How to apply list/string writes when the control is active (default replace). */
  listMode?: 'replace' | 'merge'
}

/** Live / default / override value for a Parameter control. */
export type L2ParamValue = boolean | string | string[]

/**
 * How a schedule window re-applies its active value.
 * - boundaries: write on window enter/exit only (last write wins between boundaries)
 * - continuous: re-apply active value every worker tick while inside the window
 */
export type L2ParamScheduleEnforce = 'boundaries' | 'continuous'

/** Time-of-day window that sets a Param value when active. */
export interface L2ParamScheduleWindow {
  id: string
  /** Optional label in the UI. */
  label?: string
  /** 0=Sun … 6=Sat. Empty = every day. */
  daysOfWeek?: number[]
  /** Local feed time HH:mm (inclusive). */
  startTime: string
  /** Local feed time HH:mm (exclusive at boundary tick). */
  endTime: string
  /** Inclusive calendar start YYYY-MM-DD (feed timezone). */
  startDate?: string
  /** Inclusive calendar end YYYY-MM-DD (feed timezone). */
  endDate?: string
  /** Value while this window is active. */
  activeValue: L2ParamValue
  /** Value written when leaving this window (boundaries mode). Omit = no write on exit. */
  inactiveValue?: L2ParamValue
  /** Default boundaries. */
  enforce?: L2ParamScheduleEnforce
}

export type L2ParamTriggerKind =
  | 'time_window'
  | 'match_rate'
  | 'staleness'
  | 'author_post'
  | 'list_membership'

/** Whether a Param control or trigger writes production or editor preview only. */
export type L2ParamRuntimeMode = 'draft' | 'live'

export interface L2ParamTriggerBase {
  id: string
  label?: string
  activeValue: L2ParamValue
  inactiveValue?: L2ParamValue
  enforce?: L2ParamScheduleEnforce
  /** `live` = worker may apply flips (requires control `runtimeMode` live). Default `draft`. */
  runtimeMode?: L2ParamRuntimeMode
}

export interface L2ParamTimeWindowTrigger extends L2ParamTriggerBase {
  kind: 'time_window'
  daysOfWeek?: number[]
  startTime: string
  endTime: string
  startDate?: string
  endDate?: string
}

export type L2ParamListenScope = 'feed' | 'node' | 'any_bound' | 'all_bound'

export interface L2ParamMatchRateTrigger extends L2ParamTriggerBase {
  kind: 'match_rate'
  /** What activity to listen to (defaults to feed). */
  scope: L2ParamListenScope
  /** When scope is node — graph node id (bound target or other watch node). */
  nodeId?: string
  /** Rolling window length in minutes (e.g. 60 = per hour). */
  windowMinutes: number
  comparator: 'lt' | 'lte' | 'gt' | 'gte'
  threshold: number
}

export interface L2ParamStalenessTrigger extends L2ParamTriggerBase {
  kind: 'staleness'
  scope: L2ParamListenScope
  nodeId?: string
  /** No matches for this many minutes → active. */
  staleMinutes: number
}

export interface L2ParamAuthorPostTrigger extends L2ParamTriggerBase {
  kind: 'author_post'
  authorDids?: string[]
  authorListIds?: string[]
  lookbackMinutes?: number
}

export interface L2ParamListMembershipTrigger extends L2ParamTriggerBase {
  kind: 'list_membership'
  listId: string
  event: 'member_added' | 'member_removed' | 'any_change'
}

export type L2ParamTrigger =
  | L2ParamTimeWindowTrigger
  | L2ParamMatchRateTrigger
  | L2ParamStalenessTrigger
  | L2ParamAuthorPostTrigger
  | L2ParamListMembershipTrigger

/** A named control on a Parameter Node (toggle, dropdown, text, or list). */
export interface L2ParamControl {
  name: string
  label: string
  description?: string
  type: 'boolean' | 'enum' | 'string' | 'stringList'
  /** boolean default, selected enum value, string, or string list */
  default: L2ParamValue
  /**
   * Boolean controls: node ids that exist when the toggle is ON
   * (excluded / treated as non-existent when OFF). Legacy shorthand for
   * presence bindings — prefer `bindings`.
   */
  targetNodeIds?: string[]
  /** Rich targets: presence and/or property (including text/list). */
  bindings?: L2ParamTargetBinding[]
  /** Enum controls: each option lists presence targets / property writes. */
  options?: L2ParamEnumOption[]
  /** string / stringList: placeholder shown in the control editor. */
  placeholder?: string
  /** Time-based auto triggers for this Param (worker applies to live feed values). @deprecated prefer triggers */
  schedules?: L2ParamScheduleWindow[]
  /** Native auto triggers (time, match rate, staleness, author, list). */
  triggers?: L2ParamTrigger[]
  /**
   * `live` = manual flips and API writes affect production immediately.
   * `draft` = editor preview only (blue). Default `draft`.
   */
  runtimeMode?: L2ParamRuntimeMode
}

/**
 * Eval-neutral control panel. Never Discover/Filter; stripped before L1/L2 match.
 * Controls include/exclude other nodes by id and/or patch whitelisted fields.
 */
export interface L2ParametersCondition {
  type: 'parameters'
  id: string
  /** Panel title on the canvas / inspector. */
  title?: string
  controls: L2ParamControl[]
  /** Live values while editing this feed (overrides defaults). */
  values?: Record<string, L2ParamValue>
}

/**
 * Substitute node — consumes matching posts as votes toward a related post.
 * When vote count reaches threshold, the target post enters the pathway.
 */
export interface L2SubstituteCondition {
  type: 'substitute'
  id: string
  paramControlMode?: L2ParamControlMode
  /** Which direction to resolve the target post. */
  direction: import('./substitution.js').SubstitutionDirection
  /** Number of votes needed before target enters the pathway. Default 1. */
  threshold: number
  /** Only count votes within this window (hours). 0 = unlimited. */
  timeWindowHours?: number
}

/**
 * Scout node — discovers posts via community engagement signals.
 * When N distinct scouts interact with the same external post, it's fetched and evaluated.
 */
export interface L2ScoutCondition {
  type: 'scout'
  id: string
  paramControlMode?: L2ParamControlMode
  /** Manual scout DIDs. */
  scouts?: string[]
  /** Auto-derive scouts from pool data. */
  autoDerive?: import('./scout-discovery.js').ScoutAutoDeriveConfig
  /** Scaling threshold config. */
  threshold: import('./scout-discovery.js').ScoutThresholdConfig
  /** Drop signals for posts older than this (hours). Default 48. */
  maxPostAgeHours?: number
}

export type L2RuleNode =
  | L2RuleGroup
  | L2TextCondition
  | L2KeywordCondition
  | L2RegexCondition
  | L2BoolCondition
  | L2MediaCondition
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
  | L2ParametersCondition
  | L2SubstituteCondition
  | L2ScoutCondition

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
  /**
   * Leaf nodes whose canvas body is expanded. Default is collapsed (type + op only).
   * Group frame bodies use {@link collapsedGroupFrameIds}.
   */
  expandedNodeIds?: string[]
  /** AND/OR/NO group frames collapsed to a node-count teaser. Default is expanded. */
  collapsedGroupFrameIds?: string[]
  /**
   * Nodes locked on the canvas: pin position, immune to group expand/collapse-all,
   * and cannot be deleted / extracted / reparented. Direct expand and property edits still work.
   */
  lockedNodeIds?: string[]
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
  /** Visible on the Community page (local + global). Default true. */
  public?: boolean
  /** Others can add this feed to their feed input list. Default false. */
  allowAsInput?: boolean
  /** Feed logic (rules/graph) is viewable and copyable by others. Default false. */
  logicPublic?: boolean
  /** Shows in Community > Templates instead of Community > Feeds. Default false. */
  isTemplate?: boolean
  /** Show DAU and impression stats on the Community page. Default false. */
  statsPublic?: boolean
  /**
   * Bluesky video feed mode — sets `contentMode` on the published
   * app.bsky.feed.generator record so clients treat this as a video feed.
   */
  videoFeed?: boolean
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
  /** Native injectors (pinned + rotating) — no custom code needed. */
  nativeInjectors?: import('./native-injectors.js').NativeInjectorConfig[]
  /** Additional post sources beyond the project pool. */
  sources?: import('./feed-sources.js').FeedSourcesConfig
  /** Native personalization config — viewer-aware adjustments at serve time. */
  personalization?: import('./personalization.js').NativePersonalizationConfig
  /**
   * IANA timezone for Param schedule windows (e.g. America/Los_Angeles).
   * Stored/computed in UTC internally; schedules interpret start/end in this zone.
   */
  timezone?: string
  /** When true, param-triggers worker skips this feed (test rules without live flips). */
  paramTriggersPaused?: boolean
  /** Worker-only state for schedule boundary detection (not author-edited). @deprecated prefer paramTriggerRuntime */
  paramScheduleRuntime?: {
    byParam?: Record<
      string,
      {
        inWindow: boolean
        windowId?: string
      }
    >
  }
  /** Worker-only trigger state (boundary + threshold crossings). */
  paramTriggerRuntime?: {
    time?: Record<string, { inWindow: boolean; windowId?: string }>
    /** triggerId → last satisfied state for edge detection */
    threshold?: Record<string, { satisfied: boolean }>
  }
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
  audienceLikes?: number
  audienceReposts?: number
}

export interface L2EvalInput {
  metrics?: PostMetrics
  /** Fixed clock for post_age conditions (defaults to Date.now()). */
  nowMs?: number
  /** Editor preview — evaluate rules even when feed.enabled is false. */
  preview?: boolean
  /** Resolved author list DIDs for in_list conditions (arrays or Sets — Sets preferred for large lists) */
  authorLists?: Record<string, string[] | ReadonlySet<string>>
  /** Resolved mention target DIDs keyed by mention condition node id */
  mentionDids?: Record<string, string[]>
  /** Resolved follow-ring DIDs keyed by follow_ring node id (arrays or Sets) */
  followRings?: Record<string, string[] | ReadonlySet<string>>
  /** Resolve marketplace / collection logic blocks at eval time (dereference). */
  resolveLogicBlock?: (ref: import('./logic-blocks.js').LogicBlockRef) => L2RuleGroup | null
  /** Evaluate a custom code logic block (WASM/remote). Returns match + optional score. */
  evalCustomLogicBlock?: (ref: import('./logic-blocks.js').LogicBlockRef, post: import('./index.js').NormalizedPost, metrics: PostMetrics, enrichment?: Record<string, Record<string, unknown>>) => { matched: boolean; score?: number } | null
  /** Evaluate a custom code sort modifier. Returns a numeric contribution. */
  evalSortModifier?: (modifier: import('./sort-packs.js').SortModifier, post: import('./index.js').NormalizedPost, metrics: PostMetrics, enrichment?: Record<string, Record<string, unknown>>) => number | null
  /** When true, discovery nodes (keyword, regex, hashtag, url) auto-pass.\n   *  Used for substitution targets where relevance was proven by the source post. */
  skipDiscovery?: boolean
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
