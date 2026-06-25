import { useCallback, useEffect, useState, type CSSProperties, type MouseEvent } from 'react'
import type { BuilderSection } from '../lib/global-nav'

const COLLAPSED_WIDTH = 40
export const DEFAULT_PROJECT_SIDEBAR_WIDTH = 260

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = sessionStorage.getItem(key)
    if (v === 'open') return true
    if (v === 'collapsed') return false
  } catch {
    // ignore
  }
  return fallback
}

function writeBool(key: string, open: boolean): void {
  try {
    sessionStorage.setItem(key, open ? 'open' : 'collapsed')
  } catch {
    // ignore
  }
}

function readWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const v = sessionStorage.getItem(key)
    if (v) {
      const n = Number.parseInt(v, 10)
      if (Number.isFinite(n)) return clamp(n, min, max)
    }
  } catch {
    // ignore
  }
  return fallback
}

function writeWidth(key: string, width: number): void {
  try {
    sessionStorage.setItem(key, String(width))
  } catch {
    // ignore
  }
}

function isGlobalBuilderSection(section: BuilderSection): boolean {
  return section === 'marketplace' || section === 'collection' || section === 'settings'
}

export function useProjectSidebarRail(builderSection: BuilderSection) {
  const [projectsOpen, setProjectsOpen] = useState(() =>
    readBool('cfb.project-sidebar.projects.open', true),
  )
  const [width, setWidth] = useState(() =>
    readWidth('cfb.project-sidebar.width', DEFAULT_PROJECT_SIDEBAR_WIDTH, 200, 360),
  )

  useEffect(() => {
    if (isGlobalBuilderSection(builderSection)) {
      setProjectsOpen(false)
    } else if (builderSection === 'project') {
      setProjectsOpen(readBool('cfb.project-sidebar.projects.open', true))
    }
  }, [builderSection])

  const toggleProjects = useCallback(() => {
    setProjectsOpen((open) => {
      const next = !open
      writeBool('cfb.project-sidebar.projects.open', next)
      return next
    })
  }, [])

  const persistWidth = useCallback((w: number) => {
    const next = clamp(w, 200, 360)
    setWidth(next)
    writeWidth('cfb.project-sidebar.width', next)
  }, [])

  const startResize = useCallback(
    (e: MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = width
      const onMove = (ev: globalThis.MouseEvent) => {
        persistWidth(startW + (ev.clientX - startX))
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [width, persistWidth],
  )

  const sidebarStyle = {
    '--project-sidebar-width': projectsOpen ? `${width}px` : `${COLLAPSED_WIDTH}px`,
  } as CSSProperties

  return {
    projectsOpen,
    toggleProjects,
    sidebarStyle,
    startResize,
  }
}
