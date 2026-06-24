const PLC_DIRECTORY = 'https://plc.directory'

export interface ResolveEndpointOptions {
  fetch?: typeof fetch
}

/** Resolve labeler WebSocket base from DID document (#atproto_labeler service). */
export async function resolveLabelerServiceEndpoint(
  did: string,
  options: ResolveEndpointOptions = {},
): Promise<string> {
  const fetchFn = options.fetch ?? fetch
  const res = await fetchFn(`${PLC_DIRECTORY}/${encodeURIComponent(did)}`, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`PLC lookup failed for ${did}: ${res.status}`)
  }
  const doc = (await res.json()) as {
    service?: Array<{ id?: string; type?: string; serviceEndpoint?: string }>
  }
  const labeler = doc.service?.find(
    (s) => s.id === '#atproto_labeler' || s.type === 'AtprotoLabeler',
  )
  if (!labeler?.serviceEndpoint) {
    throw new Error(`No atproto_labeler service in DID doc for ${did}`)
  }
  return labeler.serviceEndpoint.replace(/\/$/, '')
}

export function subscribeLabelsUrl(serviceEndpoint: string, cursor?: number): string {
  const wsBase = serviceEndpoint.replace(/^http/i, 'ws')
  const url = new URL(`${wsBase}/xrpc/com.atproto.label.subscribeLabels`)
  if (cursor !== undefined && cursor > 0) url.searchParams.set('cursor', String(cursor))
  return url.toString()
}
