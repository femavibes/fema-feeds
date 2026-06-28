import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../api/client'

interface NsfwBlurContextValue {
  blurNsfw: boolean
  setBlurNsfw: (v: boolean) => void
}

const NsfwBlurContext = createContext<NsfwBlurContextValue>({
  blurNsfw: true,
  setBlurNsfw: () => {},
})

export function NsfwBlurProvider({ children }: { children: ReactNode }) {
  const [blurNsfw, setBlurNsfwState] = useState(true)

  useEffect(() => {
    api.getUserPreferences().then((r) => setBlurNsfwState(r.prefs.blurNsfw)).catch(() => {})
  }, [])

  const setBlurNsfw = (v: boolean) => {
    setBlurNsfwState(v)
    api.saveUserPreferences({ blurNsfw: v }).catch(() => {})
  }

  return (
    <NsfwBlurContext.Provider value={{ blurNsfw, setBlurNsfw }}>
      {children}
    </NsfwBlurContext.Provider>
  )
}

export function useNsfwBlur() {
  return useContext(NsfwBlurContext)
}

const NSFW_LABELS = new Set(['porn', 'sexual', 'nudity', 'graphic-media'])

export function isNsfwPost(labelVals?: string[]): boolean {
  if (!labelVals || labelVals.length === 0) return false
  return labelVals.some((l) => NSFW_LABELS.has(l))
}
