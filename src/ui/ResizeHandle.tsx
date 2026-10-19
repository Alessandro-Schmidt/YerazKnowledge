// A panel's inner edge, dragged to make it wider or narrower (issue #80): the Explorer's
// right edge, the Peek's left one. While dragging only the page's CSS variable changes
// (no React render, so the map isn't redrawn); the width is saved on release. Arrow keys
// move it by 16 px, Home and End to its least and most; a double click puts it back.

import { useRef, useSyncExternalStore } from 'react'
import { clampWidth, PANELS, saveWidth, widthStore, widthVar, type Panel } from './panels'
import styles from './ResizeHandle.module.css'

export function ResizeHandle({
  panel,
  edge,
  label,
}: {
  panel: Panel
  /** Which edge of the panel it is: the panel grows away from it. */
  edge: 'left' | 'right'
  label: string
}) {
  const width = useSyncExternalStore(widthStore.subscribe, widthStore.get)[panel]
  const drag = useRef<{ x: number; width: number; now: number } | null>(null)
  const grow = edge === 'right' ? 1 : -1
  const show = (el: HTMLElement, w: number) =>
    el.closest<HTMLElement>('[data-panels]')?.style.setProperty(widthVar(panel), `${w}px`)
  const { min, max } = PANELS[panel]

  return (
    <div
      className={styles.edge}
      data-edge={edge}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        e.currentTarget.dataset.dragging = ''
        drag.current = { x: e.clientX, width, now: width }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        d.now = clampWidth(panel, d.width + grow * (e.clientX - d.x))
        show(e.currentTarget, d.now)
      }}
      onPointerUp={(e) => {
        const d = drag.current
        drag.current = null
        delete e.currentTarget.dataset.dragging
        if (d && d.now !== d.width) saveWidth(panel, d.now)
      }}
      onPointerCancel={(e) => {
        drag.current = null
        delete e.currentTarget.dataset.dragging
        show(e.currentTarget, width)
      }}
      onDoubleClick={() => saveWidth(panel, null)}
      onKeyDown={(e) => {
        const step = e.key === 'ArrowRight' ? 16 * grow : e.key === 'ArrowLeft' ? -16 * grow : null
        const next =
          step !== null ? width + step : e.key === 'Home' ? min : e.key === 'End' ? max : null
        if (next === null) return
        // Not the Explorer's own arrow keys, which move through its rows.
        e.preventDefault()
        e.stopPropagation()
        saveWidth(panel, next)
      }}
    />
  )
}
