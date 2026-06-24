/** Opaque feedContext returned on skeleton items for sendInteractions round-trip. */
const PREFIX = 'cfb:1:'

export function encodeFeedContext(feedId: string, reqId: string, position: number): string {
  return `${PREFIX}${feedId}:${reqId}:${position}`
}

export function parseFeedContext(raw: string | undefined): {
  feedId: string
  reqId: string
  position: number
} | null {
  if (!raw?.startsWith(PREFIX)) return null
  const parts = raw.slice(PREFIX.length).split(':')
  if (parts.length !== 3) return null
  const [feedId, reqId, pos] = parts
  const position = Number(pos)
  if (!feedId || !reqId || !Number.isFinite(position)) return null
  return { feedId, reqId, position }
}

export function newSkeletonReqId(): string {
  return crypto.randomUUID()
}
