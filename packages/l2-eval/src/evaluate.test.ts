import { describe, expect, it } from 'vitest'
import type { FeedConfig, NormalizedPost } from '@cfb/core-types'
import { evaluateFeedL2 } from './evaluate.js'

const basePost: NormalizedPost = {
  uri: 'at://did:plc:x/app.bsky.feed.post/1',
  cid: 'bafy',
  authorDid: 'did:plc:author1',
  recordType: 'app.bsky.feed.post',
  text: 'love urbanism and transit',
  createdAt: '2026-01-01T00:00:00.000Z',
  langs: ['en'],
  selfLabels: [],
  labelerLabels: [],
  postKind: 'root',
  embed: {
    hasVideo: false,
    hasImage: true,
    hasLinkCard: false,
    hasQuote: false,
    hasRecord: false,
    hasTextOnly: false,
  },
  facetTags: ['urbanism'],
  hiddenFacetTags: [],
  facetLinks: [],
  facetMentions: [],
  outlineTags: [],
  indexedAt: '2026-01-01T00:00:00.000Z',
}

const baseFeed: FeedConfig = {
  feedId: 'urbanism-main',
  projectId: 'urbanism',
  name: 'Urbanism Main',
  enabled: true,
  poolScope: 'project_only',
  match: {
    type: 'group',
    id: 'root',
    logic: 'any',
    children: [
      {
        type: 'group',
        id: 'g1',
        logic: 'all',
        children: [
          {
            type: 'text',
            id: 'c1',
            field: 'text',
            op: 'contains',
            value: 'urbanism',
          },
        ],
      },
    ],
  },
}

describe('evaluateFeedL2', () => {
  it('matches text condition', () => {
    const r = evaluateFeedL2(basePost, baseFeed)
    expect(r.matched).toBe(true)
  })

  it('fails when text missing', () => {
    const r = evaluateFeedL2({ ...basePost, text: 'hello' }, baseFeed)
    expect(r.matched).toBe(false)
  })

  it('fails when feed is disabled', () => {
    const feed: FeedConfig = { ...baseFeed, enabled: false }
    expect(evaluateFeedL2(basePost, feed).matched).toBe(false)
  })

  it('preview mode evaluates disabled feeds', () => {
    const feed: FeedConfig = { ...baseFeed, enabled: false }
    expect(evaluateFeedL2(basePost, feed, { preview: true }).matched).toBe(true)
  })

  it('passes when ALL group has no children (no filters)', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: { type: 'group', id: 'root', logic: 'all', children: [] },
    }
    expect(evaluateFeedL2(basePost, feed).matched).toBe(true)
    expect(evaluateFeedL2({ ...basePost, text: 'anything' }, feed).matched).toBe(true)
  })

  it('fails when ANY group has no children', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: { type: 'group', id: 'root', logic: 'any', children: [] },
    }
    expect(evaluateFeedL2(basePost, feed).matched).toBe(false)
  })

  it('matches hashtag from outline tags and strips hash prefix', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [{ type: 'hashtag', id: 'h1', op: 'includes', tags: ['#artsky'] }],
      },
    }
    const post = { ...basePost, facetTags: [], outlineTags: ['artsky'] }
    expect(evaluateFeedL2(post, feed).matched).toBe(true)
  })

  it('does not match hashtag against plain body text', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [{ type: 'hashtag', id: 'h1', op: 'includes', tags: ['dog'] }],
      },
    }
    expect(evaluateFeedL2({ ...basePost, text: 'my dog is cute' }, feed).matched).toBe(false)
  })

  it('matches URL on link card and facet sources', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'url',
            id: 'u1',
            op: 'includes',
            patterns: ['nytimes.com'],
            sources: ['link_card', 'facet_link'],
          },
        ],
      },
    }
    const linkCard = {
      ...basePost,
      embedDetail: { external: { uri: 'https://www.nytimes.com/article' } },
    }
    const facet = {
      ...basePost,
      facetLinks: ['https://nytimes.com/live'],
    }
    expect(evaluateFeedL2(linkCard, feed).matched).toBe(true)
    expect(evaluateFeedL2(facet, feed).matched).toBe(true)
    expect(evaluateFeedL2(basePost, feed).matched).toBe(false)
  })

  it('matches mention facet DIDs against resolved accounts', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'mention',
            id: 'm1',
            op: 'includes',
            accounts: ['did:plc:mentioned'],
          },
        ],
      },
    }
    const post = { ...basePost, facetMentions: ['did:plc:mentioned'] }
    expect(
      evaluateFeedL2(post, feed, { mentionDids: { m1: ['did:plc:mentioned'] } }).matched,
    ).toBe(true)
    expect(evaluateFeedL2(basePost, feed, { mentionDids: { m1: ['did:plc:mentioned'] } }).matched).toBe(
      false,
    )
  })

  it('does not treat post author as a mention match', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'mention',
            id: 'm1',
            op: 'includes',
            accounts: ['did:plc:author1'],
          },
        ],
      },
    }
    expect(
      evaluateFeedL2(basePost, feed, { mentionDids: { m1: ['did:plc:author1'] } }).matched,
    ).toBe(false)
  })

  it('matches follow ring when author is in cached hub followers', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'follow_ring',
            id: 'r1',
            op: 'includes',
            hub: 'hub.bsky.social',
            direction: 'followers',
          },
        ],
      },
    }
    const post = { ...basePost, authorDid: 'did:plc:member1' }
    expect(
      evaluateFeedL2(post, feed, { followRings: { r1: ['did:plc:member1'] } }).matched,
    ).toBe(true)
    expect(evaluateFeedL2(basePost, feed, { followRings: { r1: ['did:plc:other'] } }).matched).toBe(
      false,
    )
  })

  it('matches follow ring both directions via cached union', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'follow_ring',
            id: 'r1',
            op: 'includes',
            hub: 'hub.bsky.social',
            direction: 'both',
          },
        ],
      },
    }
    const inFollows = { ...basePost, authorDid: 'did:plc:follows-only' }
    const inFollowers = { ...basePost, authorDid: 'did:plc:followers-only' }
    expect(
      evaluateFeedL2(inFollows, feed, {
        followRings: { r1: ['did:plc:follows-only', 'did:plc:other'] },
      }).matched,
    ).toBe(true)
    expect(
      evaluateFeedL2(inFollowers, feed, {
        followRings: { r1: ['did:plc:followers-only'] },
      }).matched,
    ).toBe(true)
    expect(
      evaluateFeedL2(basePost, feed, { followRings: { r1: ['did:plc:nobody'] } }).matched,
    ).toBe(false)
  })

  it('defers viewer-hub follow ring at ingest', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'follow_ring',
            id: 'v1',
            op: 'includes',
            hubSource: 'viewer',
            direction: 'follows',
          },
        ],
      },
    }
    expect(evaluateFeedL2(basePost, feed, { followRings: { v1: [] } }).matched).toBe(true)
  })

  it('matches keyword across configured fields', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'keyword',
            id: 'k1',
            op: 'includes',
            terms: ['sunset'],
            fields: ['image_alt'],
          },
        ],
      },
    }
    const post = {
      ...basePost,
      text: 'photo post',
      embedDetail: { images: [{ alt: 'sunset over hills' }] },
    }
    expect(evaluateFeedL2(post, feed).matched).toBe(true)
  })

  it('passes empty keyword includes (no filter)', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [{ type: 'keyword', id: 'k1', op: 'includes', terms: [], fields: ['text'] }],
      },
    }
    expect(evaluateFeedL2(basePost, feed).matched).toBe(true)
  })

  it('matches regex across configured fields', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'regex',
            id: 'r1',
            op: 'matches',
            pattern: 'bike|transit',
            fields: ['text'],
          },
        ],
      },
    }
    expect(evaluateFeedL2(basePost, feed).matched).toBe(true)
    expect(
      evaluateFeedL2({ ...basePost, text: 'nothing here' }, feed).matched,
    ).toBe(false)
  })

  it('regex supports word boundaries when pattern includes them', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'regex',
            id: 'r1',
            op: 'matches',
            pattern: '\\bdog\\b',
            fields: ['text'],
          },
        ],
      },
    }
    expect(evaluateFeedL2({ ...basePost, text: 'hotdog' }, feed).matched).toBe(false)
    expect(evaluateFeedL2({ ...basePost, text: 'big dog energy' }, feed).matched).toBe(true)
  })

  it('passes empty regex (no filter)', () => {
    for (const op of ['matches', 'not_matches'] as const) {
      const feed: FeedConfig = {
        ...baseFeed,
        match: {
          type: 'group',
          id: 'root',
          logic: 'all',
          children: [
            {
              type: 'regex',
              id: 'r1',
              op,
              pattern: '',
              fields: ['text'],
            },
          ],
        },
      }
      expect(evaluateFeedL2(basePost, feed).matched).toBe(true)
    }
  })

  it('keyword wholeWord rejects partial matches', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'keyword',
            id: 'k1',
            op: 'includes',
            terms: ['dog'],
            fields: ['text'],
            wholeWord: true,
          },
        ],
      },
    }
    expect(evaluateFeedL2({ ...basePost, text: 'hotdog' }, feed).matched).toBe(false)
    expect(evaluateFeedL2({ ...basePost, text: 'big dog energy' }, feed).matched).toBe(true)
  })

  it('evaluates ANY of groups', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'any',
        children: [
          {
            type: 'group',
            id: 'g1',
            logic: 'all',
            children: [{ type: 'text', id: 'c1', field: 'text', op: 'contains', value: 'nope' }],
          },
          {
            type: 'group',
            id: 'g2',
            logic: 'all',
            children: [{ type: 'hashtag', id: 'c2', op: 'includes', tags: ['urbanism'] }],
          },
        ],
      },
    }
    expect(evaluateFeedL2(basePost, feed).matched).toBe(true)
  })

  it('evaluates language allowlist', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          { type: 'language', id: 'l1', allow: ['en'], unknown: 'exclude' },
        ],
      },
    }
    expect(evaluateFeedL2(basePost, feed).matched).toBe(true)
    expect(evaluateFeedL2({ ...basePost, langs: ['es'] }, feed).matched).toBe(false)
    expect(evaluateFeedL2({ ...basePost, langs: [] }, feed).matched).toBe(false)
    expect(
      evaluateFeedL2(
        { ...basePost, langs: [] },
        {
          ...feed,
          match: {
            ...feed.match,
            children: [{ type: 'language', id: 'l1', allow: ['en'], unknown: 'include' }],
          },
        },
      ).matched,
    ).toBe(true)
  })

  it('evaluates labels from self and labeler', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          { type: 'labels', id: 'lb1', op: 'includes', values: ['porn'], scope: 'all' },
        ],
      },
    }
    expect(
      evaluateFeedL2({ ...basePost, labelerLabels: [{ val: 'porn', src: 'did:plc:mod' }] }, feed)
        .matched,
    ).toBe(true)
    expect(
      evaluateFeedL2(
        { ...basePost, selfLabels: ['porn'], labelerLabels: [] },
        {
          ...feed,
          match: {
            ...feed.match,
            children: [
              { type: 'labels', id: 'lb1', op: 'includes', values: ['porn'], scope: 'self' },
            ],
          },
        },
      ).matched,
    ).toBe(true)
    expect(
      evaluateFeedL2(
        { ...basePost, labelerLabels: [{ val: 'porn', src: 'did:plc:mod' }] },
        {
          ...feed,
          match: {
            ...feed.match,
            children: [
              { type: 'labels', id: 'lb1', op: 'excludes', values: ['porn'], scope: 'labeler' },
            ],
          },
        },
      ).matched,
    ).toBe(false)
  })

  it('evaluates post kind condition', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          { type: 'post_kind', id: 'k1', kinds: ['root'], op: 'is' },
        ],
      },
    }
    expect(evaluateFeedL2(basePost, feed).matched).toBe(true)
    expect(evaluateFeedL2({ ...basePost, postKind: 'reply' }, feed).matched).toBe(false)
    expect(
      evaluateFeedL2(
        { ...basePost, postKind: 'reply' },
        {
          ...feed,
          match: {
            ...feed.match,
            children: [{ type: 'post_kind', id: 'k1', kinds: ['reply', 'quote'], op: 'is' }],
          },
        },
      ).matched,
    ).toBe(true)
  })

  it('supports math compare on engagement', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'compare',
            id: 'math1',
            left: {
              type: 'binary',
              op: '+',
              left: { type: 'field', field: 'like_count' },
              right: { type: 'field', field: 'repost_count' },
            },
            op: '>=',
            right: { type: 'literal', value: 50 },
          },
        ],
      },
      rank: {
        sortKey: {
          type: 'binary',
          op: '+',
          left: { type: 'field', field: 'like_count' },
          right: { type: 'field', field: 'repost_count' },
        },
      },
    }
    const fail = evaluateFeedL2(basePost, feed, { metrics: { likeCount: 10, repostCount: 5 } })
    expect(fail.matched).toBe(false)

    const pass = evaluateFeedL2(basePost, feed, { metrics: { likeCount: 40, repostCount: 20 } })
    expect(pass.matched).toBe(true)
    expect(pass.sortKey).toBe(60)
  })

  it('dereferences logic_block_ref at eval time', () => {
    const innerGroup = {
      type: 'group' as const,
      id: 'inner',
      logic: 'all' as const,
      children: [baseFeed.match.children[0]!],
    }
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'logic_block_ref',
            id: 'pkg-node',
            packageId: 'pkg-1',
            versionPin: '1.0.0',
            label: 'Boost pack',
          },
        ],
      },
    }
    const fail = evaluateFeedL2(basePost, feed)
    expect(fail.matched).toBe(false)

    const pass = evaluateFeedL2(basePost, feed, {
      resolveLogicBlock: (ref) =>
        ref.packageId === 'pkg-1' && ref.versionPin === '1.0.0' ? innerGroup : null,
    })
    expect(pass.matched).toBe(true)
  })

  it('matches quote_count and author profile metrics', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'compare',
            id: 'q',
            left: { type: 'field', field: 'quote_count' },
            op: '>=',
            right: { type: 'literal', value: 3 },
          },
          {
            type: 'compare',
            id: 'f',
            left: { type: 'field', field: 'author_follows_count' },
            op: '>=',
            right: { type: 'literal', value: 100 },
          },
        ],
      },
    }
    const fail = evaluateFeedL2(basePost, feed, {
      metrics: { quoteCount: 1, authorFollowsCount: 50 },
    })
    expect(fail.matched).toBe(false)

    const pass = evaluateFeedL2(basePost, feed, {
      metrics: { quoteCount: 5, authorFollowsCount: 200 },
    })
    expect(pass.matched).toBe(true)
  })

  it('matches media_type from rank snapshot', () => {
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'media_type',
            id: 'm',
            op: 'is',
            mediaTypes: [1],
          },
        ],
      },
    }
    expect(evaluateFeedL2(basePost, feed).matched).toBe(true)
    expect(
      evaluateFeedL2(
        { ...basePost, embed: { ...basePost.embed, hasImage: false, hasTextOnly: true } },
        feed,
      ).matched,
    ).toBe(false)
  })

  it('matches post_age by indexed_at with fixed clock', () => {
    const indexedAt = '2026-06-17T10:00:00.000Z'
    const nowMs = Date.parse('2026-06-17T16:00:00.000Z')
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'post_age',
            id: 'age',
            op: 'newer_than',
            hours: 8,
            use: 'indexed_at',
          },
        ],
      },
    }
    const post = { ...basePost, indexedAt }
    expect(evaluateFeedL2(post, feed, { nowMs }).matched).toBe(true)
    expect(
      evaluateFeedL2(post, feed, {
        nowMs: Date.parse('2026-06-18T10:00:00.000Z'),
      }).matched,
    ).toBe(false)
  })

  it('matches alt text when embed detail present', () => {
    const postWithAlt: NormalizedPost = {
      ...basePost,
      embedDetail: {
        images: [{ alt: 'a transit map' }],
      },
    }
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [{ type: 'alt_text', id: 'alt', op: 'has' }],
      },
    }
    expect(evaluateFeedL2(postWithAlt, feed).matched).toBe(true)
    expect(
      evaluateFeedL2(
        {
          ...postWithAlt,
          embedDetail: { images: [{ alt: '' }] },
        },
        feed,
      ).matched,
    ).toBe(false)
  })

  it('matches media_stats for image count and size', () => {
    const post: NormalizedPost = {
      ...basePost,
      embedDetail: {
        images: [
          { size: 2_000_000 },
          { size: 4_500_000 },
          { size: 1_000_000 },
        ],
      },
    }
    const countFeed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'media_stats',
            id: 'imgs',
            metric: 'image_count',
            op: '>=',
            value: 3,
          },
        ],
      },
    }
    expect(evaluateFeedL2(post, countFeed).matched).toBe(true)
    expect(evaluateFeedL2({ ...post, embedDetail: { images: [{ size: 1 }] } }, countFeed).matched).toBe(
      false,
    )

    const sizeFeed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'media_stats',
            id: 'big',
            metric: 'image_max_size_bytes',
            op: '>=',
            value: 4_000_000,
          },
        ],
      },
    }
    expect(evaluateFeedL2(post, sizeFeed).matched).toBe(true)
    expect(evaluateFeedL2({ ...post, embedDetail: { images: [{ size: 500_000 }] } }, sizeFeed).matched).toBe(
      false,
    )
  })

  it('matches mime_type on embed blobs', () => {
    const post: NormalizedPost = {
      ...basePost,
      embedDetail: {
        images: [{ mimeType: 'image/jpeg', size: 100 }],
      },
    }
    const feed: FeedConfig = {
      ...baseFeed,
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [{ type: 'mime_type', id: 'm', op: 'includes', pattern: 'image/jpeg' }],
      },
    }
    expect(evaluateFeedL2(post, feed).matched).toBe(true)
    expect(evaluateFeedL2(post, { ...feed, match: { ...feed.match, children: [{ type: 'mime_type', id: 'm', op: 'excludes', pattern: 'image/jpeg' }] } }).matched).toBe(false)
  })
})
