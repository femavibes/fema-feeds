/**
 * Stable identifiers for L1 filters. Order is defined in @cfb/l1-registry.
 * Add new IDs here when extending the filter registry.
 */
export type L1StepId =
  | 'labels'
  | 'post_kind'
  | 'author_allowlist'
  | 'author_blocklist'
  | 'language'
  | 'language_unknown'
  | 'has_video'
  | 'has_image'
  | 'has_link_card'
  | 'has_quote'
  | 'has_record'
  | 'has_text_only'
  | 'hashtag_exclude'
  | 'hashtag_include'
  | 'keyword_exclude'
  | 'keyword_include'
  | 'follow_ring'
  | 'ingest_gate'

import type { PostEmbedDetail, PostReplyRefs } from './post-record.js'
import type { LabelerLabel } from './labels.js'
import type { FollowRingFilterConfig } from './follow-ring.js'
import type { CompiledIngestGate, CompiledL1Meta } from './ingest-gate.js'

export type PostKind = 'root' | 'reply' | 'quote' | 'repost'

export type LanguageUnknownPolicy = 'include' | 'exclude' | 'detect'

/** Embed flags extracted once at normalize time — cheap L1 bit checks. */
export interface EmbedFlags {
  hasVideo: boolean
  hasImage: boolean
  hasLinkCard: boolean
  hasQuote: boolean
  hasRecord: boolean
  /** True when no media embed present. */
  hasTextOnly: boolean
}

/**
 * Canonical post shape for L1/L2 evaluation.
 * Built from a Jetstream event in @cfb/post-normalize and persisted in summary_json.
 */
export interface NormalizedPost {
  uri: string
  cid: string
  authorDid: string
  /** ATProto record $type (usually app.bsky.feed.post). */
  recordType: string
  text: string
  /** record.createdAt */
  createdAt: string
  langs: string[]
  /** Self-label values from record.labels (author applied before posting). */
  selfLabels: string[]
  /** Labels from subscribed labelers (Bluesky moderation + custom), resolved at ingest. */
  labelerLabels: LabelerLabel[]
  /** Denormalized union for fast filtering / DB indexes (optional on in-flight posts). */
  allLabelVals?: string[]
  postKind: PostKind
  embed: EmbedFlags
  embedDetail?: PostEmbedDetail
  reply?: PostReplyRefs
  /** Visible hashtag facets (byte range within text). */
  facetTags: string[]
  /** Hashtag facets whose byteEnd exceeds text length (hidden tags). */
  hiddenFacetTags: string[]
  /** Link URLs from facet #link features. */
  facetLinks: string[]
  /** Mentioned user DIDs from facet #mention features. */
  facetMentions: string[]
  /** record.tags — outline / bridged platform tags. */
  outlineTags: string[]
  bridgyOriginalText?: string
  bridgyOriginalUrl?: string
  /** Jetstream / indexer timestamp. */
  indexedAt: string
}

export type EmbedFlagRequirement = 'require' | 'exclude' | 'ignore'

/** Extensible list source — add types in docs/LIST_SOURCES.md */
export type ListSource =
  | { type: 'manual_dids'; dids: string[] }
  | { type: 'bluesky_list'; uri: string; pollIntervalMinutes?: number }
  /** Starter packs resolve to their backing list via getStarterPack → getList */
  | { type: 'bluesky_starter_pack'; uri: string; pollIntervalMinutes?: number }

export interface AuthorListConfig {
  listId: string
  /**
   * One or more sources merged into this list.
   * Use `sources` for new configs; `dids` alone still supported (treated as manual).
   */
  sources?: ListSource[]
  /** @deprecated Prefer sources: [{ type: 'manual_dids', dids }] */
  dids?: string[]
  /** Default poll interval for bluesky_list sources without their own (minutes). */
  pollIntervalMinutes?: number
  fastPath: {
    enabled: boolean
    bypassSteps: L1StepId[]
  }
}

/** Feed-scoped author list — used by L2 rules only (no L1 fast-path). */
export interface FeedAuthorListConfig {
  listId: string
  sources?: ListSource[]
  /** @deprecated Prefer sources: [{ type: 'manual_dids', dids }] */
  dids?: string[]
  pollIntervalMinutes?: number
}

export interface ProjectL1Config {
  projectId: string
  name: string
  enabled: boolean
  /** Bluesky DID of the account that owns this project. Set from OAuth session on save. */
  ownerDid?: string
  /**
   * When true, posts from authors NOT on any project author list fail at L1.
   * Use for author-only projects (reporter feeds with no keyword discovery).
   */
  authorsOnly?: boolean
  postKinds?: PostKind[]
  language?: {
    allow: string[]
    unknown: LanguageUnknownPolicy
  }
  authorLists?: AuthorListConfig[]
  authorBlocklist?: string[]
  labels?: {
    block: string[]
  }
  hasVideo?: EmbedFlagRequirement
  hasImage?: EmbedFlagRequirement
  hasLinkCard?: EmbedFlagRequirement
  hasQuote?: EmbedFlagRequirement
  hasRecord?: EmbedFlagRequirement
  hasTextOnly?: EmbedFlagRequirement
  hashtagInclude?: string[]
  hashtagExclude?: string[]
  keywordInclude?: KeywordFilterConfig
  keywordExclude?: KeywordFilterConfig
  /** Optional L1 follow-ring filter (account hub at ingest; viewer hub at skeleton). */
  followRing?: FollowRingFilterConfig
  /** Always-on ingest graph — compiled to {@link ingestGate} on save. */
  prefilter?: import('./prefilter.js').ProjectPrefilter
  /** Compiled ingest gate (from {@link prefilter} or legacy feed compile). */
  ingestGate?: CompiledIngestGate
  /** When ingest gate was last compiled. */
  compiledL1Meta?: CompiledL1Meta
  /** Prefilter mode: manual (user-built, default) or strict (auto-derived from feeds). */
  prefilterMode?: import('./strict-ingest.js').PrefilterMode
  /** Compiled strict include gate (auto-derived from feeds when prefilterMode=strict). */
  strictIncludeGate?: CompiledIngestGate
  /** Metadata about strict gate compilation. */
  strictGateMeta?: import('./strict-ingest.js').StrictGateMeta
}

export type { ProjectPrefilter } from './prefilter.js'
export { PROJECT_PREFILTER_SCOPE_ID } from './prefilter.js'

/** Shared L1/L2 keyword filter shape. */
export interface KeywordFilterConfig {
  terms: string[]
  fields: import('./post-record.js').PostSearchField[]
  caseSensitive?: boolean
  wholeWord?: boolean
}

/** Steps that author fast-path never skips (safety floor). */
export const L1_NEVER_BYPASS: readonly L1StepId[] = [
  'labels',
  'post_kind',
  'author_blocklist',
] as const

export type L1StepOutcome = 'pass' | 'fail' | 'skip' | 'bypass_remaining'

export interface L1StepTrace {
  stepId: L1StepId
  outcome: L1StepOutcome
  detail?: string
}

export type L1MatchedVia = 'author' | 'jetstream'

export interface L1ProjectResult {
  projectId: string
  matched: boolean
  matchedVia?: L1MatchedVia
  trace: L1StepTrace[]
}

export interface L1MergedResult {
  postUri: string
  projects: L1ProjectResult[]
}

export * from './ingest-gate.js'
export * from './run-at-ingest.js'
export * from './follow-ring.js'
export * from './l2.js'
export * from './enrichment.js'
export * from './feedgen-settings.js'
export * from './ownership.js'
export * from './deployment.js'
export * from './feed-lifecycle.js'
export * from './logic-blocks.js'
export * from './sort-packs.js'
export * from './plugins.js'
export * from './marketplace-listing.js'
export * from './rank-snapshot.js'
export * from './viewer-context.js'
export * from './post-record.js'
export * from './labels.js'
export * from './marketplace.js'
export * from './purge.js'
export * from './strict-ingest.js'
export { collectSearchableText, collectPostUrls, urlMatchesAny, textContainsAny, textMatchesRegex, compileRegex, REGEX_ENGINE_LABEL, DEFAULT_URL_SOURCES } from './post-search.js'
export type { KeywordMatchOptions } from './post-search.js'
