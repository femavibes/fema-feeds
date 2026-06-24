import { describe, expect, it } from 'vitest'
import { mergeLabelIntoList } from './apply.js'

describe('mergeLabelIntoList', () => {
  const base = [{ val: 'porn', src: 'did:plc:mod' }]

  it('adds a new label', () => {
    const next = mergeLabelIntoList(base, { val: 'spam', src: 'did:plc:mod' })
    expect(next).toHaveLength(2)
  })

  it('is idempotent for duplicates', () => {
    const next = mergeLabelIntoList(base, { val: 'porn', src: 'did:plc:mod' })
    expect(next).toEqual(base)
  })

  it('removes on neg', () => {
    const next = mergeLabelIntoList(base, { val: 'porn', src: 'did:plc:mod', neg: true })
    expect(next).toHaveLength(0)
  })
})
