import { unsafeDecodeJwt } from '@atproto/jwk'

/** Extract viewer DID from Bluesky Authorization Bearer JWT (sub claim). */
export function parseViewerDidFromAuthorization(
  authorization: string | undefined,
): string | undefined {
  if (!authorization?.startsWith('Bearer ')) return undefined
  const token = authorization.slice('Bearer '.length).trim()
  if (!token) return undefined

  try {
    const { payload } = unsafeDecodeJwt(token)
    const sub = payload.sub
    if (typeof sub === 'string' && sub.startsWith('did:')) return sub
  } catch {
    /* invalid token — treat as anonymous viewer */
  }
  return undefined
}
