import type { PostSearchField } from './post-record.js'

import type { FollowRingFilterConfig, FollowRingHubSource } from './follow-ring.js'



/** One ingest-eligible leaf criterion compiled from a feed node. */

export type IngestGateBranch =

  | {

      type: 'keyword'

      op: 'includes' | 'excludes'

      terms: string[]

      fields: PostSearchField[]

      caseSensitive?: boolean

      wholeWord?: boolean

      sourceFeedId?: string

      sourceNodeId?: string

    }

  | {

      type: 'regex'

      op: 'includes' | 'excludes'

      pattern: string

      fields: PostSearchField[]

      caseInsensitive?: boolean

      sourceFeedId?: string

      sourceNodeId?: string

    }

  | {

      type: 'hashtag'

      op: 'includes' | 'excludes'

      tags: string[]

      sourceFeedId?: string

      sourceNodeId?: string

    }

  | {

      type: 'post_kind'

      kinds: ('root' | 'reply' | 'quote' | 'repost')[]

      sourceFeedId?: string

      sourceNodeId?: string

    }

  | {

      type: 'language'

      allow: string[]

      unknown: 'include' | 'exclude'

      sourceFeedId?: string

      sourceNodeId?: string

    }

  | {

      type: 'embed'

      field:

        | 'has_video'

        | 'has_image'

        | 'has_link_card'

        | 'has_quote'

        | 'has_record'

        | 'has_text_only'

      required: boolean

      sourceFeedId?: string

      sourceNodeId?: string

    }

  | {

      type: 'labels'

      op: 'includes' | 'excludes'

      values: string[]

      scope: 'all' | 'labeler' | 'self'

      sourceFeedId?: string

      sourceNodeId?: string

    }

  | {

      type: 'follow_ring'

      op: 'includes' | 'excludes'

      hubSource: FollowRingHubSource

      hub?: string

      direction: FollowRingFilterConfig['direction']

      pollIntervalMinutes?: number

      sourceFeedId?: string

      sourceNodeId?: string

    }

  | {

      type: 'author'

      op: 'in_list' | 'not_in_list'

      listId?: string

      dids?: string[]

      sourceFeedId?: string

      sourceNodeId?: string

    }



export interface IngestGateAllRule {

  type: 'all'

  rules: IngestGateRule[]

  /** @deprecated use rules */

  branches?: IngestGateBranch[]

  sourceFeedId?: string

  sourcePathId?: string

  sourceNodeId?: string

}



export interface IngestGateAnyRule {

  type: 'any'

  rules: IngestGateRule[]

  sourceFeedId?: string

  sourcePathId?: string

  sourceNodeId?: string

}



export interface IngestGateNoneRule {

  type: 'none'

  rules: IngestGateRule[]

  sourceFeedId?: string

  sourcePathId?: string

  sourceNodeId?: string

}



export interface IngestGateNOfRule {

  type: 'n_of'

  rules: IngestGateRule[]

  minPass: number

  sourceFeedId?: string

  sourcePathId?: string

  sourceNodeId?: string

}



/** Recursive ingest rule tree — mirrors L2 group logic; OR across top-level paths. */

export type IngestGateRule =

  | IngestGateBranch

  | IngestGateAllRule

  | IngestGateAnyRule

  | IngestGateNoneRule

  | IngestGateNOfRule



/** @deprecated use IngestGateAllRule */

export type IngestGateAllBranch = IngestGateAllRule



export type IngestGateIncludeRule = IngestGateRule



/** Compiled pool gate from live feed rules (OR across top-level include rules). */

export interface CompiledIngestGate {

  /** Discovery paths — OR across branches (keyword/hashtag/author includes, etc.). */

  includeBranches: IngestGateRule[]

  /** Global rejects — any match drops the post. */

  excludeBranches: IngestGateBranch[]

  /** Global requirements — all must pass (language, post kind, embed flags, …). */

  restrictBranches?: IngestGateBranch[]

}



export type CompiledL1Source = 'prefilter' | 'feeds'

export interface CompiledL1Meta {

  compiledAt: string

  /** `prefilter` = project prefilter graph; `feeds` = legacy feed pool-on compile. */

  source?: CompiledL1Source

  /** @deprecated Legacy feed-compiled ingest — enabled feeds that contributed. */

  liveFeedIds?: string[]

}


