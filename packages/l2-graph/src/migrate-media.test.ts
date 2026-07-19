import { describe, expect, it } from 'vitest'
import { normalizeRuleNode } from './normalize-match.js'
import { migrateBoolToMedia, migrateMediaTypeToMedia } from './migrate-media.js'
import type { L2BoolCondition, L2MediaTypeCondition } from '@cfb/core-types'

describe('migrate media nodes', () => {
  it('maps bool has_video true/false', () => {
    const requireVideo: L2BoolCondition = {
      type: 'bool',
      id: 'b1',
      field: 'has_video',
      value: true,
    }
    expect(migrateBoolToMedia(requireVideo)).toEqual({
      type: 'media',
      id: 'b1',
      op: 'is',
      kinds: ['video'],
    })
    expect(
      migrateBoolToMedia({ ...requireVideo, value: false, field: 'has_record' }),
    ).toEqual({
      type: 'media',
      id: 'b1',
      op: 'is_not',
      kinds: ['quote_with_media'],
    })
  })

  it('maps media_type buckets to kinds', () => {
    const node: L2MediaTypeCondition = {
      type: 'media_type',
      id: 'm1',
      op: 'is',
      mediaTypes: [1, 2, 3],
    }
    expect(migrateMediaTypeToMedia(node)).toEqual({
      type: 'media',
      id: 'm1',
      op: 'is',
      kinds: ['image', 'video', 'gif'],
    })
  })

  it('normalizes legacy bool/media_type on load', () => {
    const bool = normalizeRuleNode({
      type: 'bool',
      id: 'b',
      field: 'has_quote',
      value: true,
    } as L2BoolCondition)
    expect(bool).toMatchObject({ type: 'media', kinds: ['quote'], op: 'is' })

    const mt = normalizeRuleNode({
      type: 'media_type',
      id: 'mt',
      op: 'is_not',
      mediaTypes: [0, 4],
    } as L2MediaTypeCondition)
    expect(mt).toMatchObject({
      type: 'media',
      op: 'is_not',
      kinds: ['text_only', 'link_card'],
    })
  })
})
