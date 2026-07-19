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
    expect(q.embed.hasQuote).toBe(true)
    expect(q.embed.hasQuoteWithMedia).toBe(false)
    expect(q.embed.hasRecord).toBe(false)
    expect(q.embedDetail?.record).toEqual({
      uri: 'at://did:plc:q/app.bsky.feed.post/1',
      cid: 'bafyq',
    })
  })

  it('splits GIF from video and quote+media from plain quote', () => {
    const gif: JetstreamPostEvent = {
      uri: 'at://did:plc:x/app.bsky.feed.post/gif',
      cid: 'bafygif',
      author: 'did:plc:x',
      record: {
        text: 'gif',
        embed: {
          $type: 'app.bsky.embed.video',
          video: { $type: 'blob', mimeType: 'video/mp4', size: 100 },
          presentation: 'gif',
        },
      },
    }
    const g = normalizeJetstreamPost(gif)
    expect(g.embed.hasGif).toBe(true)
    expect(g.embed.hasVideo).toBe(false)

    const withMedia: JetstreamPostEvent = {
      uri: 'at://did:plc:x/app.bsky.feed.post/qwm',
      cid: 'bafyqwm',
      author: 'did:plc:x',
      record: {
        text: 'quote with media',
        embed: {
          $type: 'app.bsky.embed.recordWithMedia',
          record: { record: { uri: 'at://did:plc:q/app.bsky.feed.post/1', cid: 'bafyq' } },
          media: {
            $type: 'app.bsky.embed.images',
            images: [{ alt: 'x', image: { $type: 'blob', mimeType: 'image/jpeg', size: 10 } }],
          },
        },
      },
    }
    const m = normalizeJetstreamPost(withMedia)
    expect(m.postKind).toBe('quote')
    expect(m.embed.hasQuoteWithMedia).toBe(true)
    expect(m.embed.hasRecord).toBe(true)
    expect(m.embed.hasQuote).toBe(false)
    expect(m.embed.hasImage).toBe(true)
  })

  it('maps app.bsky.embed.gallery items to hasImage (not text-only)', () => {
    const event: JetstreamPostEvent = {
      uri: 'at://did:plc:x/app.bsky.feed.post/gal1',
      cid: 'bafygal',
      author: 'did:plc:x',
      record: {
        text: 'five pics',
        embed: {
          $type: 'app.bsky.embed.gallery',
          items: [
            {
              $type: 'app.bsky.embed.gallery#image',
              alt: 'one',
              image: { $type: 'blob', mimeType: 'image/jpeg', size: 100 },
              aspectRatio: { width: 1, height: 1 },
            },
            {
              $type: 'app.bsky.embed.gallery#image',
              alt: 'two',
              image: { $type: 'blob', mimeType: 'image/png', size: 200 },
            },
          ],
        },
      },
    }
    const post = normalizeJetstreamPost(event)
    expect(post.embed.hasImage).toBe(true)
    expect(post.embed.hasTextOnly).toBe(false)
    expect(post.embedDetail?.$type).toBe('app.bsky.embed.gallery')
    expect(post.embedDetail?.images).toHaveLength(2)
    expect(post.embedDetail?.images?.[0]?.alt).toBe('one')
    expect(post.embedDetail?.images?.[0]?.mimeType).toBe('image/jpeg')
  })

  it('treats bare gallery $type as image embed even without parsed items', () => {
    const event: JetstreamPostEvent = {
      uri: 'at://did:plc:x/app.bsky.feed.post/gal2',
      cid: 'bafygal2',
      author: 'did:plc:x',
      record: {
        text: 'gallery stub',
        embed: { $type: 'app.bsky.embed.gallery' },
      },
    }
    const post = normalizeJetstreamPost(event)
    expect(post.embed.hasImage).toBe(true)
    expect(post.embed.hasTextOnly).toBe(false)
  })
})

describe('normalizeJetstreamRepost', () => {
  it('normalizes reshare records as postKind=repost with subject refs', async () => {
    const { normalizeJetstreamRepost } = await import('./normalize.js')
    const post = normalizeJetstreamRepost({
      uri: 'at://did:plc:alice/app.bsky.feed.repost/3mrepost',
      cid: 'bafyrepost',
      author: 'did:plc:alice',
      time: '2026-07-18T12:00:00.000Z',
      record: {
        $type: 'app.bsky.feed.repost',
        createdAt: '2026-07-18T12:00:00.000Z',
        subject: {
          uri: 'at://did:plc:bob/app.bsky.feed.post/3morig',
          cid: 'bafyorig',
        },
      },
    })
    expect(post.postKind).toBe('repost')
    expect(post.recordType).toBe('app.bsky.feed.repost')
    expect(post.authorDid).toBe('did:plc:alice')
    expect(post.repost).toEqual({
      subjectUri: 'at://did:plc:bob/app.bsky.feed.post/3morig',
      subjectCid: 'bafyorig',
    })
    expect(post.embed.hasTextOnly).toBe(false)
    expect(post.text).toBe('')
  })

  it('overlays subject content onto a repost shell for matching/UI', async () => {
    const { normalizeJetstreamRepost, normalizeJetstreamPost, applyRepostSubject } =
      await import('./normalize.js')
    const shell = normalizeJetstreamRepost({
      uri: 'at://did:plc:alice/app.bsky.feed.repost/3mrepost',
      cid: 'bafyrepost',
      author: 'did:plc:alice',
      record: {
        $type: 'app.bsky.feed.repost',
        subject: { uri: 'at://did:plc:bob/app.bsky.feed.post/3morig', cid: 'bafyorig' },
      },
    })
    const subject = normalizeJetstreamPost({
      uri: 'at://did:plc:bob/app.bsky.feed.post/3morig',
      cid: 'bafyorig',
      author: 'did:plc:bob',
      record: {
        text: 'hello transit',
        langs: ['en'],
        embed: {
          $type: 'app.bsky.embed.images',
          images: [{ alt: 'x', image: { $type: 'blob', mimeType: 'image/jpeg', size: 10 } }],
        },
      },
    })
    const merged = applyRepostSubject(shell, subject)
    expect(merged.postKind).toBe('repost')
    expect(merged.authorDid).toBe('did:plc:alice')
    expect(merged.uri).toContain('/app.bsky.feed.repost/')
    expect(merged.text).toBe('hello transit')
    expect(merged.embed.hasImage).toBe(true)
    expect(merged.repost?.subjectUri).toBe(subject.uri)
    expect(merged.repost?.subjectAuthorDid).toBe('did:plc:bob')
  })
})
