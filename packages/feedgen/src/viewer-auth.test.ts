import { describe, expect, it } from 'vitest'
import { parseViewerDidFromAuthorization } from './viewer-auth.js'

function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.sig`
}

describe('parseViewerDidFromAuthorization', () => {
  it('extracts sub DID from Bearer token', () => {
    const did = 'did:plc:abc123'
    const header = `Bearer ${fakeJwt({ sub: did })}`
    expect(parseViewerDidFromAuthorization(header)).toBe(did)
  })

  it('returns undefined without Bearer prefix', () => {
    expect(parseViewerDidFromAuthorization(undefined)).toBeUndefined()
    expect(parseViewerDidFromAuthorization('Basic abc')).toBeUndefined()
  })
})
