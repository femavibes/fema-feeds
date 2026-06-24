import { useLayoutEffect, useRef } from 'react'

/** Size a term list scroller to the space left in the inspector panel. */
export function useTermListScrollHeight(enabled: boolean, remeasureKey = '') {
  const panelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!enabled) return

    const apply = () => {
      const scrollEl = scrollRef.current
      const panelEl = panelRef.current
      if (!scrollEl || !panelEl) return

      const inspectorBody = panelEl.closest('.l2-inspector-body') as HTMLElement | null
      if (!inspectorBody) return

      const bottom = inspectorBody.getBoundingClientRect().bottom
      const top = scrollEl.getBoundingClientRect().top
      const maxHeight = Math.floor(bottom - top - 8)
      scrollEl.style.maxHeight = `${Math.max(96, maxHeight)}px`
    }

    const sync = () => requestAnimationFrame(apply)

    sync()
    const ro = new ResizeObserver(sync)
    const body = panelRef.current?.closest('.l2-inspector-body')
    const inspector = panelRef.current?.closest('.l2-visual-inspector')
    if (body) ro.observe(body)
    if (inspector) ro.observe(inspector)
    if (panelRef.current) ro.observe(panelRef.current)
    window.addEventListener('resize', sync)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sync)
    }
  }, [enabled, remeasureKey])

  return { panelRef, scrollRef }
}
