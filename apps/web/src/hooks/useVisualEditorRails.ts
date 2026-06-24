import { useCallback, useEffect, useState, type CSSProperties, type MouseEvent } from 'react'

const COLLAPSED_WIDTH = 40

export const DEFAULT_RAIL_WIDTHS = {
  palette: 300,
  props: 280,
  preview: 300,
} as const

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

export interface VisualEditorRailWidths {
  palette: number
  props: number
  preview: number
}

export function useVisualEditorRails() {
  const [paletteOpen, setPaletteOpen] = useState(() => readBool('cfb.l2.rail.palette.open', true))
  const [propsOpen, setPropsOpen] = useState(() => readBool('cfb.l2.rail.props.open', true))
  const [previewOpen, setPreviewOpen] = useState(() => {
    try {
      const v = sessionStorage.getItem('cfb.l2.rail.preview.open')
      if (v === 'open') return true
      if (v === 'collapsed') return false
      const legacy = sessionStorage.getItem('cfb.l2.preview-rail')
      if (legacy === 'collapsed') return false
      if (legacy === 'open') return true
    } catch {
      // ignore
    }
    return true
  })

  const [paletteWidth, setPaletteWidth] = useState(() =>
    readWidth('cfb.l2.rail.palette.width', DEFAULT_RAIL_WIDTHS.palette, 200, 420),
  )
  const [propsWidth, setPropsWidth] = useState(() =>
    readWidth('cfb.l2.rail.props.width', DEFAULT_RAIL_WIDTHS.props, 220, 420),
  )
  const [previewWidth, setPreviewWidth] = useState(() =>
    readWidth('cfb.l2.rail.preview.width', DEFAULT_RAIL_WIDTHS.preview, 240, 480),
  )

  const togglePalette = useCallback(() => {
    setPaletteOpen((open) => {
      const next = !open
      writeBool('cfb.l2.rail.palette.open', next)
      return next
    })
  }, [])

  const toggleProps = useCallback(() => {
    setPropsOpen((open) => {
      const next = !open
      writeBool('cfb.l2.rail.props.open', next)
      return next
    })
  }, [])

  const togglePreview = useCallback(() => {
    setPreviewOpen((open) => {
      const next = !open
      writeBool('cfb.l2.rail.preview.open', next)
      return next
    })
  }, [])

  const persistPaletteWidth = useCallback((w: number) => {
    const next = clamp(w, 200, 420)
    setPaletteWidth(next)
    writeWidth('cfb.l2.rail.palette.width', next)
  }, [])

  const persistPropsWidth = useCallback((w: number) => {
    const next = clamp(w, 220, 420)
    setPropsWidth(next)
    writeWidth('cfb.l2.rail.props.width', next)
  }, [])

  const persistPreviewWidth = useCallback((w: number) => {
    const next = clamp(w, 240, 480)
    setPreviewWidth(next)
    writeWidth('cfb.l2.rail.preview.width', next)
  }, [])

  const startResize =
    (kind: 'palette' | 'props' | 'preview', getWidth: () => number, persist: (w: number) => void) =>
    (e: MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = getWidth()
      const onMove = (ev: globalThis.MouseEvent) => {
        const delta = ev.clientX - startX
        const next = kind === 'palette' ? startW + delta : startW - delta
        persist(next)
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }

  const resetPanels = useCallback(() => {
    setPaletteOpen(true)
    setPropsOpen(true)
    setPreviewOpen(true)
    setPaletteWidth(DEFAULT_RAIL_WIDTHS.palette)
    setPropsWidth(DEFAULT_RAIL_WIDTHS.props)
    setPreviewWidth(DEFAULT_RAIL_WIDTHS.preview)
    writeBool('cfb.l2.rail.palette.open', true)
    writeBool('cfb.l2.rail.props.open', true)
    writeBool('cfb.l2.rail.preview.open', true)
    writeWidth('cfb.l2.rail.palette.width', DEFAULT_RAIL_WIDTHS.palette)
    writeWidth('cfb.l2.rail.props.width', DEFAULT_RAIL_WIDTHS.props)
    writeWidth('cfb.l2.rail.preview.width', DEFAULT_RAIL_WIDTHS.preview)
  }, [])

  const gridStyle = {
    '--l2-palette-w': paletteOpen ? `${paletteWidth}px` : `${COLLAPSED_WIDTH}px`,
    '--l2-props-w': propsOpen ? `${propsWidth}px` : `${COLLAPSED_WIDTH}px`,
    '--l2-preview-w': previewOpen ? `${previewWidth}px` : `${COLLAPSED_WIDTH}px`,
  } as CSSProperties

  useEffect(() => {
    writeBool('cfb.l2.rail.preview.open', previewOpen)
  }, [previewOpen])

  return {
    paletteOpen,
    propsOpen,
    previewOpen,
    togglePalette,
    toggleProps,
    togglePreview,
    gridStyle,
    startResizePalette: startResize('palette', () => paletteWidth, persistPaletteWidth),
    startResizeProps: startResize('props', () => propsWidth, persistPropsWidth),
    startResizePreview: startResize('preview', () => previewWidth, persistPreviewWidth),
    resetPanels,
  }
}
