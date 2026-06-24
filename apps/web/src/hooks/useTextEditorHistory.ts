import { useCallback, useEffect, useRef, useState } from 'react'

const HISTORY_LIMIT = 80
const DEBOUNCE_MS = 400

export function useTextEditorHistory(resetKey: string) {
  const textRef = useRef('')
  const pastRef = useRef<string[]>([])
  const futureRef = useRef<string[]>([])
  const pendingBeforeRef = useRef<string | null>(null)
  const debounceRef = useRef<number | null>(null)

  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const syncFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0 || pendingBeforeRef.current !== null)
    setCanRedo(futureRef.current.length > 0)
  }, [])

  const flushPending = useCallback(() => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    const before = pendingBeforeRef.current
    if (before == null) return

    const last = pastRef.current[pastRef.current.length - 1]
    if (last !== before) {
      pastRef.current.push(before)
      if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift()
      futureRef.current = []
    }
    pendingBeforeRef.current = null
    syncFlags()
  }, [syncFlags])

  const bindText = useCallback((value: string) => {
    textRef.current = value
  }, [])

  const recordBeforeChange = useCallback(() => {
    if (pendingBeforeRef.current == null) {
      pendingBeforeRef.current = textRef.current
    }
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(flushPending, DEBOUNCE_MS)
  }, [flushPending])

  const resetHistory = useCallback(() => {
    pastRef.current = []
    futureRef.current = []
    pendingBeforeRef.current = null
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    syncFlags()
  }, [syncFlags])

  const undo = useCallback(() => {
    flushPending()
    const past = pastRef.current
    if (!past.length) return null

    futureRef.current.push(textRef.current)
    const prev = past.pop()!
    syncFlags()
    return prev
  }, [flushPending, syncFlags])

  const redo = useCallback(() => {
    flushPending()
    const future = futureRef.current
    if (!future.length) return null

    pastRef.current.push(textRef.current)
    const next = future.pop()!
    syncFlags()
    return next
  }, [flushPending, syncFlags])

  useEffect(() => {
    resetHistory()
  }, [resetKey, resetHistory])

  useEffect(
    () => () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current)
    },
    [],
  )

  return { bindText, recordBeforeChange, undo, redo, canUndo, canRedo, resetHistory }
}
