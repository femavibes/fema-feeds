import cbor from 'cbor'

export interface AtprotoStreamHeader {
  t?: string
  op?: number
}

/** Decode ATProto WebSocket frame: header CBOR + body CBOR. */
export function decodeAtprotoFrame(
  data: Uint8Array,
): { header: AtprotoStreamHeader; body: unknown } | null {
  if (data.length === 0) return null
  try {
    const headerResult = cbor.decodeFirstSync(data)
    const header = headerResult.value as AtprotoStreamHeader
    const rest = data.subarray(headerResult.byteLength)
    if (rest.length === 0) return { header, body: null }
    const bodyResult = cbor.decodeFirstSync(rest)
    return { header, body: bodyResult.value }
  } catch {
    return null
  }
}
