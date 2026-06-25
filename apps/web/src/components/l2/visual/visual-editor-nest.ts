import { createContext, useContext } from 'react'

export type VisualEditorNestApi = {
  registerNestedOverlay: () => () => void
}

export const VisualEditorNestContext = createContext<VisualEditorNestApi | null>(null)

export function useVisualEditorNest(): VisualEditorNestApi | null {
  return useContext(VisualEditorNestContext)
}
