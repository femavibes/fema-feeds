import { describe, expect, it } from 'vitest'
import { engagementCounterForCollection, engagementDelta } from './engagement-client.js'

describe('engagement helpers', () => {
  it('maps collection to counter', () => {
    expect(engagementCounterForCollection('app.bsky.feed.like')).toBe('like')
    expect(engagementCounterForCollection('app.bsky.feed.repost')).toBe('repost')
  })

  it('maps operation to delta', () => {
    expect(engagementDelta('create')).toBe(1)
    expect(engagementDelta('delete')).toBe(-1)
  })
})
