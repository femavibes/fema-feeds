import { describe, expect, it } from 'vitest'
import { extractMediaFromEmbed } from './pool-match-enrich.js'

describe('extractMediaFromEmbed', () => {
  it('extracts image thumbnails', () => {
    const { media } = extractMediaFromEmbed({
      $type: 'app.bsky.embed.images#view',
      images: [
        {
          thumb: 'https://cdn.example/thumb.jpg',
          fullsize: 'https://cdn.example/full.jpg',
          alt: 'sunset',
          aspectRatio: { width: 4, height: 3 },
        },
      ],
    })
    expect(media).toEqual([
      {
        kind: 'image',
        thumbUrl: 'https://cdn.example/thumb.jpg',
        fullUrl: 'https://cdn.example/full.jpg',
        alt: 'sunset',
        aspectRatio: { width: 4, height: 3 },
      },
    ])
  })

  it('extracts video thumbnail and quote record', () => {
    const { media, quote } = extractMediaFromEmbed({
      $type: 'app.bsky.embed.recordWithMedia#view',
      media: {
        $type: 'app.bsky.embed.video#view',
        thumbnail: 'https://cdn.example/vthumb.jpg',
        playlist: 'https://video.example/playlist.m3u8',
        alt: 'clip',
      },
      record: {
        $type: 'app.bsky.embed.record#viewRecord',
        uri: 'at://did:plc:q/app.bsky.feed.post/1',
        value: { text: 'original post text' },
        author: {
          did: 'did:plc:q',
          handle: 'quoted.bsky.social',
          displayName: 'Quoted Author',
        },
      },
    })
    expect(media[0]?.kind).toBe('video')
    expect(quote?.text).toBe('original post text')
    expect(quote?.author.handle).toBe('quoted.bsky.social')
  })

  it('does not add a reply chip equivalent', () => {
    const { media, quote } = extractMediaFromEmbed(undefined)
    expect(media).toEqual([])
    expect(quote).toBeUndefined()
  })
})
