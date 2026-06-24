import { describe, expect, it } from 'vitest'
import { normalizeJetstreamPost, type JetstreamPostEvent } from './normalize.js'

const videoPostEvent: JetstreamPostEvent = {
  uri: 'at://did:plc:example/app.bsky.feed.post/3m',
  cid: 'bafyexample',
  author: 'did:plc:example',
  time: '2026-05-05T06:39:00.000Z',
  record: {
    $type: 'app.bsky.feed.post',
    text: '#GayPuppy #PuppyPlay video',
    createdAt: '2026-05-05T06:38:57.542Z',
    langs: ['en'],
    embed: {
      $type: 'app.bsky.embed.video',
      video: {
        $type: 'blob',
        mimeType: 'video/mp4',
        size: 3721606,
      },
      aspectRatio: { width: 1080, height: 1900 },
      presentation: 'default',
    },
    facets: [
      {
        index: { byteStart: 0, byteEnd: 9 },
        features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'GayPuppy' }],
      },
      {
        index: { byteStart: 10, byteEnd: 20 },
        features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'PuppyPlay' }],
      },
    ],
    labels: {
      $type: 'com.atproto.label.defs#selfLabels',
      values: [{ val: 'porn' }],
    },
  },
}

describe('normalizeJetstreamPost', () => {
  it('extracts video embed, labels, facets, and timestamps', () => {
    const post = normalizeJetstreamPost(videoPostEvent)
    expect(post.recordType).toBe('app.bsky.feed.post')
    expect(post.createdAt).toBe('2026-05-05T06:38:57.542Z')
    expect(post.langs).toEqual(['en'])
    expect(post.selfLabels).toEqual(['porn'])
    expect(post.embed.hasVideo).toBe(true)
    expect(post.embed.hasTextOnly).toBe(false)
    expect(post.embedDetail?.video?.mimeType).toBe('video/mp4')
    expect(post.embedDetail?.video?.aspectRatio).toEqual({ width: 1080, height: 1900 })
    expect(post.facetTags).toEqual(['GayPuppy', 'PuppyPlay'])
    expect(post.postKind).toBe('root')
  })

  it('separates hidden hashtag facets from visible tags', () => {
    const event: JetstreamPostEvent = {
      ...videoPostEvent,
      record: {
        ...videoPostEvent.record,
        text: 'short',
        facets: [
          {
            index: { byteStart: 0, byteEnd: 4 },
            features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'visible' }],
          },
          {
            index: { byteStart: 0, byteEnd: 99 },
            features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'hidden' }],
          },
        ],
      },
    }
    const post = normalizeJetstreamPost(event)
    expect(post.facetTags).toEqual(['visible'])
    expect(post.hiddenFacetTags).toEqual(['hidden'])
  })

  it('extracts image alt, link card, mentions, and outline tags', () => {
    const event: JetstreamPostEvent = {
      uri: 'at://did:plc:x/app.bsky.feed.post/1',
      cid: 'bafy',
      author: 'did:plc:x',
      record: {
        text: 'check this @user',
        tags: ['artsky', 'outline-only'],
        embed: {
          $type: 'app.bsky.embed.images',
          images: [
            {
              alt: 'A sunset over the city',
              image: { mimeType: 'image/jpeg', size: 1200 },
              aspectRatio: { width: 4, height: 3 },
            },
          ],
        },
        facets: [
          {
            features: [
              { $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:mentioned' },
              { $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com/path' },
            ],
          },
        ],
        bridgyOriginalText: '<p>from mastodon</p>',
        bridgyOriginalUrl: 'https://snarfed.org/example',
      },
    }
    const post = normalizeJetstreamPost(event)
    expect(post.outlineTags).toEqual(['artsky', 'outline-only'])
    expect(post.embedDetail?.images?.[0]?.alt).toBe('A sunset over the city')
    expect(post.facetMentions).toEqual(['did:plc:mentioned'])
    expect(post.facetLinks).toEqual(['https://example.com/path'])
    expect(post.bridgyOriginalText).toBe('<p>from mastodon</p>')
    expect(post.bridgyOriginalUrl).toBe('https://snarfed.org/example')
  })

  it('extracts reply and quote embed refs', () => {
    const reply: JetstreamPostEvent = {
      uri: 'at://did:plc:x/app.bsky.feed.post/2',
      cid: 'bafy2',
      author: 'did:plc:x',
      record: {
        text: 'replying',
        reply: {
          root: { uri: 'at://did:plc:root/app.bsky.feed.post/1' },
          parent: { uri: 'at://did:plc:parent/app.bsky.feed.post/9' },
        },
      },
    }
    expect(normalizeJetstreamPost(reply).postKind).toBe('reply')
    expect(normalizeJetstreamPost(reply).reply).toEqual({
      rootUri: 'at://did:plc:root/app.bsky.feed.post/1',
      parentUri: 'at://did:plc:parent/app.bsky.feed.post/9',
    })

    const quote: JetstreamPostEvent = {
      uri: 'at://did:plc:x/app.bsky.feed.post/3',
      cid: 'bafy3',
      author: 'did:plc:x',
      record: {
        text: 'quoting',
        embed: {
          $type: 'app.bsky.embed.record',
          record: { uri: 'at://did:plc:q/app.bsky.feed.post/1', cid: 'bafyq' },
        },
      },
    }
    const q = normalizeJetstreamPost(quote)
    expect(q.postKind).toBe('quote')
    expect(q.embedDetail?.record).toEqual({
      uri: 'at://did:plc:q/app.bsky.feed.post/1',
      cid: 'bafyq',
    })
  })
})
