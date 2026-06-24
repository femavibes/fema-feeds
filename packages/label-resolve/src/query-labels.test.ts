import { describe, expect, it } from 'vitest'
import { filterLabelsForPost, toLabelerLabels } from './query-labels.js'

describe('filterLabelsForPost', () => {
  const postUri = 'at://did:plc:author/app.bsky.feed.post/1'
  const author = 'did:plc:author'

  it('keeps post and account labels', () => {
    const labels = filterLabelsForPost(
      [
        { val: 'porn', src: 'did:plc:mod', uri: postUri },
        { val: 'spam', src: 'did:plc:mod', uri: `at://${author}/app.bsky.actor.profile/self` },
        { val: 'nope', src: 'did:plc:mod', uri: 'at://did:plc:other/app.bsky.feed.post/9' },
      ],
      postUri,
      author,
    )
    expect(labels.map((l) => l.val)).toEqual(['porn', 'spam'])
  })
})

describe('toLabelerLabels', () => {
  it('dedupes and skips self-label duplicates from author src', () => {
    const out = toLabelerLabels(
      [
        { val: 'porn', src: 'did:plc:mod' },
        { val: 'porn', src: 'did:plc:mod' },
        { val: 'porn', src: 'did:plc:author' },
        { val: 'sexual', src: 'did:plc:mod' },
      ],
      { authorDid: 'did:plc:author', selfLabels: ['porn'] },
    )
    expect(out).toEqual([
      { val: 'porn', src: 'did:plc:mod' },
      { val: 'sexual', src: 'did:plc:mod' },
    ])
  })
})
