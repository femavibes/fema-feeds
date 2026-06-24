import { describe, expect, it } from 'vitest'
import { resolveAuthorListForCache } from './resolve.js'

describe('resolveAuthorListForCache', () => {
  it('skips empty bluesky list URI without throwing', async () => {
    const result = await resolveAuthorListForCache({
      sources: [{ type: 'bluesky_list', uri: '' }],
    })
    expect(result.dids).toEqual([])
    expect(result.graphName).toBeNull()
  })

  it('merges manual dids when remote URI is blank', async () => {
    const result = await resolveAuthorListForCache({
      dids: ['did:plc:manual'],
      sources: [{ type: 'bluesky_list', uri: '   ' }],
    })
    expect(result.dids).toEqual(['did:plc:manual'])
  })
})
