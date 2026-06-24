import { describe, expect, it } from 'vitest'
import {
  buildDidWebDocument,
  didWebFromPublicUrl,
  resolveFeedgenServiceDid,
} from './service-did.js'

describe('service-did', () => {
  it('derives did:web from HTTPS public URL', () => {
    expect(didWebFromPublicUrl('https://femafeeds.duckdns.org')).toBe(
      'did:web:femafeeds.duckdns.org',
    )
    expect(didWebFromPublicUrl('http://localhost:3000')).toBeNull()
  })

  it('builds DID document for feedgen', () => {
    expect(buildDidWebDocument('https://femafeeds.duckdns.org')).toEqual({
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: 'did:web:femafeeds.duckdns.org',
      service: [
        {
          id: '#bsky_fg',
          type: 'BskyFeedGenerator',
          serviceEndpoint: 'https://femafeeds.duckdns.org',
        },
      ],
    })
  })

  it('prefers did:web over stored account PLC DID', () => {
    expect(
      resolveFeedgenServiceDid(
        {
          publicBaseUrl: 'https://femafeeds.duckdns.org',
          generatorDid: 'did:plc:lptjvw6ut224kwrj7ub3sqbe',
        },
        'did:plc:lptjvw6ut224kwrj7ub3sqbe',
      ),
    ).toBe('did:web:femafeeds.duckdns.org')
  })
})
