import { describe, expect, it } from 'vitest'
import { buildPostMediaStats } from './media-stats.js'

describe('buildPostMediaStats', () => {
  it('aggregates image count and sizes', () => {
    const stats = buildPostMediaStats({
      embedDetail: {
        images: [
          { size: 1_000_000, mimeType: 'image/jpeg', aspectRatio: { width: 4, height: 3 } },
          { size: 5_000_000, mimeType: 'image/png', aspectRatio: { width: 16, height: 9 } },
        ],
      },
    })
    expect(stats.imageCount).toBe(2)
    expect(stats.imageMaxSizeBytes).toBe(5_000_000)
    expect(stats.imageMinSizeBytes).toBe(1_000_000)
    expect(stats.imageTotalSizeBytes).toBe(6_000_000)
    expect(stats.imageMaxAspectWidth).toBe(16)
    expect(stats.imageMaxAspectHeight).toBe(9)
  })

  it('includes nested recordWithMedia images and video', () => {
    const stats = buildPostMediaStats({
      embedDetail: {
        $type: 'app.bsky.embed.recordWithMedia',
        media: {
          images: [{ size: 500 }],
          video: { size: 3_721_606, aspectRatio: { width: 1080, height: 1900 } },
        },
      },
      facetLinks: ['https://example.com'],
      facetMentions: ['did:plc:x', 'did:plc:y'],
    })
    expect(stats.imageCount).toBe(1)
    expect(stats.videoSizeBytes).toBe(3_721_606)
    expect(stats.videoAspectWidth).toBe(1080)
    expect(stats.facetLinkCount).toBe(1)
    expect(stats.facetMentionCount).toBe(2)
  })
})
