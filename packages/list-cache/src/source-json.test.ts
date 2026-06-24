import { describe, expect, it } from 'vitest'
import {
  authorListFromSourceJson,
  buildAuthorListSourceJson,
  listHasRemoteSources,
} from './source-json.js'

describe('buildAuthorListSourceJson', () => {
  it('stores sources without resolved DIDs', () => {
    const json = buildAuthorListSourceJson({
      listId: 'orgs',
      sources: [{ type: 'bluesky_list', uri: 'at://did:plc:x/app.bsky.graph.list/abc' }],
      fastPath: { enabled: true, bypassSteps: ['language'] },
      dids: ['did:plc:old'],
    })
    expect(json.sources).toHaveLength(1)
    expect(json.manualDids).toEqual(['did:plc:old'])
    expect(json).not.toHaveProperty('dids')
  })
})

describe('listHasRemoteSources', () => {
  it('true for bluesky_list', () => {
    expect(
      listHasRemoteSources({
        sources: [{ type: 'bluesky_list', uri: 'at://x' }],
      }),
    ).toBe(true)
  })

  it('false for manual only', () => {
    expect(
      listHasRemoteSources({
        sources: [{ type: 'manual_dids', dids: ['did:plc:a'] }],
      }),
    ).toBe(false)
  })
})

describe('authorListFromSourceJson roundtrip', () => {
  it('rebuilds list config for refresh', () => {
    const json = buildAuthorListSourceJson({
      listId: 'orgs',
      sources: [{ type: 'manual_dids', dids: ['did:plc:z'] }],
      fastPath: { enabled: false, bypassSteps: [] },
    })
    const list = authorListFromSourceJson('orgs', json)
    expect(list.listId).toBe('orgs')
    expect(list.sources).toHaveLength(1)
  })
})
