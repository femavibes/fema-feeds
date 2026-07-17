import { useRef } from 'react'

const SWIPE_CLOSE_PX = 72

/**
 * Drag handle for mobile bottom sheets. Swipe down past the threshold closes
 * the sheet. Hidden on desktop via CSS (`.l2-sheet-handle` is display:none
 * outside the mobile media query).
 */
export function MobileSheetHandle({ onClose }: { onClose: () => void }) {
  const startY = useRef(0)
  const armed = useRef(false)

  return (
    <div
      className="l2-sheet-handle"
      aria-hidden
      onTouchStart={(e) => {
        const t = e.touches[0]
        if (!t) return
        startY.current = t.clientY
        armed.current = true
      }}
      onTouchMove={(e) => {
        if (!armed.current) return
        const t = e.touches[0]
        if (!t) return
        if (t.clientY - startY.current > SWIPE_CLOSE_PX) {
          armed.current = false
          onClose()
        }
      }}
      onTouchEnd={() => {
        armed.current = false
      }}
      onTouchCancel={() => {
        armed.current = false
      }}
    >
      <span className="l2-sheet-handle-bar" />
    </div>
  )
}
