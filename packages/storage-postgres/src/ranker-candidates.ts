import type { EmbedFlags, PostRankSnapshot, RankerCandidate } from '@cfb/core-types'

import { rankSnapshotFromSummary } from '@cfb/post-normalize'

import type pg from 'pg'



function parseRankSnapshot(raw: unknown, summary: Record<string, unknown>): PostRankSnapshot {
  if (raw && typeof raw === 'object' && Object.keys(raw as object).length > 0) {
    const s = raw as PostRankSnapshot
    if (typeof s.mediaType === 'number') {
      if (s.mediaStats) return s
      return { ...s, mediaStats: rankSnapshotFromSummary(summary).mediaStats }
    }
  }
  return rankSnapshotFromSummary(summary)
}



function hasMediaFromEmbed(embed: EmbedFlags): boolean {

  return embed.hasImage || embed.hasVideo || embed.hasLinkCard || embed.hasQuote || embed.hasRecord

}



/** Load enrichment for skeleton URIs (missing rows omitted). */

export async function loadRankerCandidates(

  pool: pg.Pool,

  uris: string[],

): Promise<RankerCandidate[]> {

  if (uris.length === 0) return []



  const res = await pool.query<{

    post_uri: string

    cid: string

    author_did: string

    indexed_at: Date

    summary_json: Record<string, unknown>

    rank_snapshot: unknown

    like_count: number | null

    repost_count: number | null

    quote_count: number | null

    reply_count: number | null

    bookmark_count: number | null

    followers_count: number | null

    follows_count: number | null

    posts_count: number | null

    handle: string | null

  }>(

    `SELECT p.post_uri, p.cid, p.author_did, p.indexed_at, p.summary_json, p.rank_snapshot,

            e.like_count, e.repost_count, e.quote_count, e.reply_count, e.bookmark_count,

            a.followers_count, a.follows_count, a.posts_count, a.handle

     FROM unnest($1::text[]) WITH ORDINALITY AS u(post_uri, ord)

     LEFT JOIN ingested_posts p ON p.post_uri = u.post_uri

     LEFT JOIN post_engagement e ON e.post_uri = p.post_uri

     LEFT JOIN author_profiles a ON a.did = p.author_did

     WHERE p.post_uri IS NOT NULL

     ORDER BY u.ord`,

    [uris],

  )



  return res.rows.map((r) => {

    const summary = r.summary_json ?? {}

    const rankSnapshot = parseRankSnapshot(r.rank_snapshot, summary)

    const embed = rankSnapshot.embed

    const hasMedia = hasMediaFromEmbed(embed)

    const hasAltText =

      rankSnapshot.hasAltText ??

      (hasMedia ? false : null)



    return {

      uri: r.post_uri,

      cid: r.cid,

      authorDid: r.author_did,

      indexedAt: new Date(r.indexed_at).toISOString(),

      createdAt: rankSnapshot.createdAt,

      postKind: rankSnapshot.postKind,

      langs: rankSnapshot.langs,

      likeCount: Number(r.like_count ?? 0),

      repostCount: Number(r.repost_count ?? 0),

      replyCount: Number(r.reply_count ?? 0),

      quoteCount: Number(r.quote_count ?? 0),

      bookmarkCount: Number(r.bookmark_count ?? 0),

      authorFollowerCount: Number(r.followers_count ?? 0),

      authorFollowsCount: Number(r.follows_count ?? 0),

      authorPostsCount: Number(r.posts_count ?? 0),

      authorHandle: r.handle,

      textLength: rankSnapshot.textLength,

      mediaType: rankSnapshot.mediaType,

      hasMedia,

      hasAltText,

      embed,

      facetTagCount: rankSnapshot.facetTagCount,

      hiddenFacetTagCount: rankSnapshot.hiddenFacetTagCount,

      outlineTagCount: rankSnapshot.outlineTagCount,

      labelVals: rankSnapshot.labelVals,

      rankSnapshot,

    }

  })

}


