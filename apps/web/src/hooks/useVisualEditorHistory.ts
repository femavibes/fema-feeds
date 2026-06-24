import { useCallback, useEffect, useRef, useState } from 'react'
import type { FeedConfig } from '@cfb/core-types'

export type VisualEditorSnapshot = Pick<FeedConfig, 'match' | 'visualLayout'>

const HISTORY_LIMIT = 60
const DEBOUNCE_MS = 450

function takeSnapshot(draft: FeedConfig): VisualEditorSnapshot {
  return {
    match: structuredClone(draft.match),
    visualLayout: draft.visualLayout ? structuredClone(draft.visualLayout) : undefined,
  }
}

function snapshotsEqual(a: VisualEditorSnapshot, b: VisualEditorSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function useVisualEditorHistory(
  draft: FeedConfig,
  onApply: (snapshot: VisualEditorSnapshot) => void,
  resetKey: string,
) {
  const draftRef = useRef(draft)
  draftRef.current = draft

  const pastRef = useRef<VisualEditorSnapshot[]>([])
  const futureRef = useRef<VisualEditorSnapshot[]>([])
  const pendingBeforeRef = useRef<VisualEditorSnapshot | null>(null)
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
    if (!before) return

    const last = pastRef.current[pastRef.current.length - 1]
    if (!last || !snapshotsEqual(last, before)) {
      pastRef.current.push(before)
      if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift()
      futureRef.current = []
    }
    pendingBeforeRef.current = null
    syncFlags()
  }, [syncFlags])

  const recordBeforeChange = useCallback(() => {
    if (!pendingBeforeRef.current) {
      pendingBeforeRef.current = takeSnapshot(draftRef.current)
    }
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(flushPending, DEBOUNCE_MS)
  }, [flushPending])

  const undo = useCallback(() => {
    flushPending()
    const past = pastRef.current
    if (!past.length) return false

    futureRef.current.push(takeSnapshot(draftRef.current))
    onApply(past.pop()!)
    syncFlags()
    return true
  }, [flushPending, onApply, syncFlags])

  const redo = useCallback(() => {
    flushPending()
    const future = futureRef.current
    if (!future.length) return false

    pastRef.current.push(takeSnapshot(draftRef.current))
    onApply(future.pop()!)
    syncFlags()
    return true
  }, [flushPending, onApply, syncFlags])

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

  useEffect(() => {
    resetHistory()
  }, [resetKey, resetHistory])

  useEffect(
    () => () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current)
    },
    [],
  )

  return { recordBeforeChange, undo, redo, canUndo, canRedo, resetHistory }
}
