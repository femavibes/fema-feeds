import WebSocket from 'ws'
import type { AtprotoLabel } from '@cfb/label-resolve'
import { decodeAtprotoFrame } from './cbor-frame.js'
import { subscribeLabelsUrl } from './resolve-endpoint.js'

export interface LabelStreamCallbacks {
  onLabels: (labels: AtprotoLabel[], seq: number) => void | Promise<void>
  onConnected?: () => void
  onError?: (err: unknown) => void
}

export interface LabelStreamConnection {
  close: () => void
  getCursor: () => number
}

const MAX_BACKOFF_MS = 30_000

function toUint8Array(data: WebSocket.RawData): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  if (Array.isArray(data)) {
    const total = data.reduce((n, chunk) => n + chunk.length, 0)
    const out = new Uint8Array(total)
    let offset = 0
    for (const chunk of data) {
      out.set(chunk, offset)
      offset += chunk.length
    }
    return out
  }
  return new Uint8Array(data as ArrayBuffer)
}

/** Maintain a WebSocket subscription to one labeler's label stream. */
export function connectLabelStream(
  serviceEndpoint: string,
  initialCursor: number,
  callbacks: LabelStreamCallbacks,
): LabelStreamConnection {
  let ws: WebSocket | null = null
  let closed = false
  let backoff = 1000
  let cursor = initialCursor
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, backoff)
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
  }

  const connect = () => {
    if (closed) return
    const url = subscribeLabelsUrl(serviceEndpoint, cursor)
    ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'

    ws.on('open', () => {
      backoff = 1000
      callbacks.onConnected?.()
    })

    ws.on('message', (data) => {
      const buf = toUint8Array(data)
      const frame = decodeAtprotoFrame(buf)
      if (!frame || frame.header.op !== 1) return
      if (frame.header.t !== '#labels') return

      const body = frame.body as { labels?: AtprotoLabel[]; seq?: number } | null
      if (!body) return
      const labels = body.labels ?? []
      const seq = body.seq ?? 0
      if (seq > cursor) cursor = seq
      void Promise.resolve(callbacks.onLabels(labels, seq)).catch((e) => callbacks.onError?.(e))
    })

    ws.on('close', () => {
      ws = null
      scheduleReconnect()
    })

    ws.on('error', (err) => {
      callbacks.onError?.(err)
    })
  }

  connect()

  return {
    close: () => {
      closed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      ws?.close()
      ws = null
    },
    getCursor: () => cursor,
  }
}
