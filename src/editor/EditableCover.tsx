import { useRef, useState } from 'react'
import type { LeafMeta } from '../model/parse'
import { coverPosition, dragCover } from '../read/cover'
import { Cover } from '../read/LeafLook'
import controls from '../ui/controls.module.css'
import styles from './LeafEditor.module.css'

const STEP: Record<string, number> = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5 }

/**
 * The editor's cover. While `moving`, drag it (or use the arrow keys) to choose which part
 * shows; "Save position" writes it to line 2 as `coverPosition`.
 */
export function EditableCover({
  repo,
  meta,
  moving,
  onSave,
  onCancel,
}: {
  repo: string
  meta: LeafMeta | null
  moving: boolean
  onSave(position: number): void
  onCancel(): void
}) {
  const [y, setY] = useState(() => coverPosition(meta))
  const drag = useRef<{ from: number; y: number } | null>(null)
  if (!moving)
    return (
      <Cover
        repo={repo}
        src={meta?.cover}
        position={coverPosition(meta)}
        className={styles.cover}
      />
    )
  return (
    <div className={styles.coverBox}>
      <Cover
        repo={repo}
        src={meta?.cover}
        position={y}
        className={styles.cover}
        data-moving=""
        draggable={false}
        role="slider"
        tabIndex={0}
        aria-label="Cover position"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={y}
        aria-valuetext={`${y}% from the top`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { from: e.clientY, y }
        }}
        onPointerMove={(e) => {
          const start = drag.current
          if (!start) return
          const img = e.currentTarget
          setY(
            dragCover(
              start.y,
              e.clientY - start.from,
              { width: img.clientWidth, height: img.clientHeight },
              { width: img.naturalWidth, height: img.naturalHeight },
            ),
          )
        }}
        onPointerUp={() => (drag.current = null)}
        onKeyDown={(e) => {
          const by = STEP[e.key]
          if (by !== undefined) setY((v) => Math.min(100, Math.max(0, v + by)))
          else if (e.key === 'Home') setY(0)
          else if (e.key === 'End') setY(100)
          else if (e.key === 'Escape') onCancel()
          else return
          e.preventDefault()
        }}
      />
      <div className={`${controls.panel} ${styles.coverBar}`}>
        <span>Drag the image to reposition</span>
        <button type="button" className={controls.ghost} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={controls.primary} onClick={() => onSave(y)}>
          Save position
        </button>
      </div>
    </div>
  )
}
