import { useCallback, useEffect, useRef, useState } from 'react'

import { api, type IngestStatusResponse } from '../api/client'

interface Options {
  pollMs?: number
  onStatusChange?: (status: IngestStatusResponse) => void
}

export function useIngestRunner({ pollMs = 5000, onStatusChange }: Options = {}) {
  const [status, setStatus] = useState<IngestStatusResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onStatusChangeRef = useRef(onStatusChange)
  onStatusChangeRef.current = onStatusChange

  const refresh = useCallback(async () => {
    try {
      const next = await api.ingestStatus()
      setStatus(next)
      onStatusChangeRef.current?.(next)
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => {
      void refresh()
    }, pollMs)
    return () => clearInterval(id)
  }, [pollMs, refresh])

  const toggle = useCallback(async () => {
    if (!status || busy) return
    setBusy(true)
    setError(null)
    try {
      const next = status.running ? await api.ingestStop() : await api.ingestStart()
      setStatus(next)
      onStatusChangeRef.current?.(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Toggle failed')
    } finally {
      setBusy(false)
    }
  }, [busy, status])

  return {
    status,
    running: status?.running ?? false,
    busy,
    error,
    refresh,
    toggle,
  }
}
