import type { FeedConfig, ProjectL1Config } from '@cfb/core-types'

import { isFeedPubliclyServed } from '@cfb/core-types'

import type pg from 'pg'

import { getFeedSkeleton, recordFeedServedPosts } from '@cfb/storage-postgres'

import { resolveFeedByUri } from './uri.js'

import { applyFeedInjector } from './inject.js'

import { applyFeedRanker } from './rank.js'
import { applyNativePersonalization, type ViewerPersonalizationContext } from './native-personalization.js'

import { encodeFeedContext, newSkeletonReqId } from './feed-context.js'

import { applyViewerFollowRingFilter } from './skeleton-viewer-ring.js'



export interface SkeletonFeedItem {

  post: string

  feedContext?: string

}



export interface SkeletonResponse {

  feed: SkeletonFeedItem[]

  cursor?: string

  reqId?: string

}



export interface SkeletonError {

  error: string

  status: number

}



export interface SkeletonRequestOptions {

  feed: string

  limit?: number

  cursor?: string

  viewerDid?: string

  /** L1 project config for viewer follow-ring at skeleton serve. */

  project?: ProjectL1Config

}



export async function handleGetFeedSkeleton(

  pool: pg.Pool,

  feeds: FeedConfig[],

  publisherDid: string,

  params: SkeletonRequestOptions,

): Promise<SkeletonResponse | SkeletonError> {

  if (!publisherDid) {

    return { error: 'Feed publisher DID not configured', status: 503 }

  }



  const config = resolveFeedByUri(feeds, publisherDid, params.feed)

  if (!config) {

    return { error: 'Unknown feed', status: 400 }

  }

  if (!isFeedPubliclyServed(config)) {

    return { feed: [] }

  }



  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100)

  const skeleton = await getFeedSkeleton(pool, config.feedId, limit, params.cursor)

  const filtered = await applyViewerFollowRingFilter(
    pool,
    config,
    params.project,
    skeleton.feed,
    params.viewerDid,
  )

  // Apply native personalization (viewer-aware reordering)
  const personalized = config.personalization
    ? applyNativePersonalization(filtered, config.personalization, undefined /* TODO: load viewer context */)
    : filtered

  const ranked = await applyFeedRanker(pool, config, personalized, limit, params.viewerDid)

  const feedRows = await applyFeedInjector(pool, config, ranked, limit)



  const reqId = params.viewerDid ? newSkeletonReqId() : undefined

  const feed: SkeletonFeedItem[] = feedRows.map((row, index) => ({

    post: row.post,

    ...(reqId

      ? { feedContext: encodeFeedContext(config.feedId, reqId, index) }

      : {}),

  }))



  if (params.viewerDid && reqId) {

    try {

      await recordFeedServedPosts(pool, {

        viewerDid: params.viewerDid,

        feedId: config.feedId,

        reqId,

        items: feed.map((row, position) => ({ postUri: row.post, position })),

      })

    } catch {

      /* impression log failure must not break skeleton serve */

    }

  }



  return { feed, cursor: skeleton.cursor, reqId }

}


