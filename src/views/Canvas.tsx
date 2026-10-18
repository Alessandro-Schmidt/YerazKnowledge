// The stage the drawn views share (Mind map, Graph, Rings, Atlas): a dotted ground, one
// camera that d3-zoom pans and zooms (useZoom), fitting, hover tips, and a selection
// layer. The geometry is the caller's, memoised, so it is drawn once per layout; the
// selection is drawn into the layer by `drawSelection`, never by re-rendering the
// geometry (the map rule, design/views/README.md).

import {
  useId,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type PointerEvent,
} from 'react'
import type { Box } from '../map/layout'
import ui from '../map/TreeMap.module.css'
import map from '../map/map.module.css'
import { useZoom, type Insets } from '../map/useZoom'
import { markNow } from '../perf'
import controls from '../ui/controls.module.css'
import { Icon } from '../ui/icons'
import styles from './Canvas.module.css'

export const SVG_NS = 'http://www.w3.org/2000/svg'

export interface CanvasProps {
  label: string
  /** What the camera fits. A new box is fitted again while nobody has moved the camera. */
  bounds: Box
  insets: Partial<Insets>
  /** Room kept for the canvas's own floating parts, on top of the insets. */
  margin?: Partial<Insets>
  min?: number
  max?: number
  selected: string | null
  /** Draws the selection into `layer`; returns where it is, to bring it into view. */
  drawSelection?(layer: SVGGElement, id: string): { x: number; y: number } | null
  /** Hover text for a node. */
  tip?(id: string): { title: string; meta: string } | null
  onSelect(id: string | null): void
  onOpen(id: string): void
  /** Floating parts: chips at the top left, a panel at the top right, the legend. */
  chips?: ReactNode
  corner?: ReactNode
  legend?: ReactNode
  /** The geometry, memoised by the caller. */
  children: ReactNode
  /** False leaves out the zoom controls (a phone view that shows only its shape). */
  controls?: boolean
  className?: string
  style?: CSSProperties
}

const PHONE_WIDTH = 640
const DEFAULT_MARGIN: Insets = { top: 64, right: 16, bottom: 80, left: 16 }

export function Canvas({
  label,
  bounds,
  insets,
  margin,
  min = 0.1,
  max = 4,
  selected,
  drawSelection,
  tip,
  onSelect,
  onOpen,
  chips,
  corner,
  legend,
  children,
  controls: showControls = true,
  className,
  style,
}: CanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<SVGGElement>(null)
  const layerRef = useRef<SVGGElement>(null)
  const percentRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const gridId = useId()
  const zoom = useZoom(stageRef, cameraRef, {
    min,
    max,
    onScale: ({ percent }) => {
      if (percentRef.current) percentRef.current.textContent = `${percent}%`
    },
  })

  const m = { ...DEFAULT_MARGIN, ...margin }
  const area: Insets = {
    top: m.top + (insets.top ?? 0),
    right: m.right + (insets.right ?? 0),
    bottom: m.bottom + (insets.bottom ?? 0),
    left: m.left + (insets.left ?? 0),
  }
  const areaKey = `${area.top} ${area.right} ${area.bottom} ${area.left}`

  // A phone's bottom sheet leaves too little room to fit anything above it: the view takes
  // the screen, and the sheet covers its lower part until dismissed (as on the map).
  const fitArea = () =>
    (stageRef.current?.clientWidth ?? 0) <= PHONE_WIDTH ? { ...area, bottom: m.bottom } : area

  // Fit once, then again for a new layout while the camera is untouched.
  const fitted = useRef<Box | null>(null)
  useLayoutEffect(() => {
    if (fitted.current === bounds) return
    const first = fitted.current === null
    if (first || zoom.untouched()) zoom.fit(bounds, fitArea(), !first)
    fitted.current = bounds
    // eslint-disable-next-line react-hooks/exhaustive-deps -- area is read through areaKey
  }, [bounds, zoom, areaKey])

  // The selection layer: cleared and drawn again for each selection.
  useLayoutEffect(() => {
    const stage = stageRef.current!
    const layer = layerRef.current!
    layer.replaceChildren()
    for (const el of stage.querySelectorAll('[data-sel]')) el.removeAttribute('data-sel')
    delete stage.dataset.focus
    if (selected === null || !drawSelection) return
    const at = drawSelection(layer, selected)
    if (!at) return
    stage.dataset.focus = ''
    zoom.follow(at.x, at.y, area)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- area is read through areaKey
  }, [selected, drawSelection, zoom, areaKey])

  const idAt = (target: EventTarget) =>
    (target as Element).closest?.('[data-id]')?.getAttribute('data-id') ?? undefined

  const showTip = (event: PointerEvent<HTMLDivElement>) => {
    const el = tipRef.current!
    const id = event.pointerType === 'mouse' && tip ? idAt(event.target) : undefined
    const text = id === undefined ? null : tip!(id)
    if (!text) {
      el.hidden = true
      return
    }
    const box = (event.target as Element).getBoundingClientRect()
    const host = el.parentElement!.getBoundingClientRect()
    el.querySelector('strong')!.textContent = text.title
    el.querySelector('span')!.textContent = text.meta
    el.style.left = `${box.right - host.left + 12}px`
    el.style.top = `${box.bottom - host.top + 12}px`
    el.hidden = false
  }

  return (
    <div className={`${ui.wrap} ${className ?? ''}`} style={style}>
      <div
        ref={stageRef}
        className={`${map.stage} ${styles.stage}`}
        data-canvas=""
        onClick={(e) => {
          markNow('select')
          const id = idAt(e.target)
          onSelect(id ?? null)
        }}
        onDoubleClick={(e) => {
          const id = idAt(e.target)
          if (id !== undefined) onOpen(id)
        }}
        onPointerOver={showTip}
        onPointerLeave={() => {
          if (tipRef.current) tipRef.current.hidden = true
        }}
      >
        <svg className={map.svg} role="img" aria-label={label}>
          <defs>
            <pattern id={gridId} width="28" height="28" patternUnits="userSpaceOnUse">
              <circle className={map.grid} cx="1.5" cy="1.5" r="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${CSS.escape(gridId)})`} />
          <g ref={cameraRef} className={map.camera}>
            {children}
            <g ref={layerRef} className={styles.layer} data-overlay="" />
          </g>
        </svg>
      </div>
      <div ref={tipRef} className={ui.tip} hidden>
        <strong />
        <span />
        <em>Click to peek · double-click to open</em>
      </div>
      {chips && <div className={ui.chips}>{chips}</div>}
      {corner && (
        <div className={styles.corner} style={{ right: 16 + (insets.right ?? 0) }}>
          {corner}
        </div>
      )}
      <div className={ui.bottom} style={{ maxWidth: `calc(100% - ${(insets.right ?? 0) + 32}px)` }}>
        <div
          className={`${controls.panel} ${ui.zoom}`}
          style={showControls ? undefined : { display: 'none' }}
        >
          <button
            type="button"
            className={controls.iconButton}
            aria-label="Zoom out"
            onClick={() => zoom.zoomBy(1 / 1.25)}
          >
            <Icon name="minus" />
          </button>
          <span ref={percentRef} className={ui.percent} aria-live="off">
            100%
          </span>
          <button
            type="button"
            className={controls.iconButton}
            aria-label="Zoom in"
            onClick={() => zoom.zoomBy(1.25)}
          >
            <Icon name="plus" />
          </button>
          <span className={ui.sep} aria-hidden="true" />
          <button
            type="button"
            className={controls.iconButton}
            aria-label="Fit to screen"
            onClick={() => zoom.fit(bounds, fitArea(), true)}
          >
            <Icon name="fit" />
          </button>
        </div>
        {legend && <div className={`${controls.panel} ${ui.legend}`}>{legend}</div>}
      </div>
    </div>
  )
}

/** An SVG element for a selection layer, with attributes. */
export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | undefined>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, String(v))
  parent?.append(el)
  return el
}

/** Copies drawn elements (by `data-id`) into the selection layer, above the veil. */
export function lift(
  layer: SVGGElement,
  ids: Iterable<string>,
  attribute?: (id: string) => string | undefined,
) {
  const root = layer.ownerSVGElement!
  for (const id of ids) {
    for (const el of root.querySelectorAll(`[data-id="${CSS.escape(id)}"]`)) {
      if (layer.contains(el)) continue
      const copy = el.cloneNode(true) as Element
      const extra = attribute?.(id)
      if (extra) copy.setAttribute(extra, '')
      // A copy keeps the colour its group gave it.
      const tree = el.closest('[data-group]')
      if (tree instanceof SVGElement && tree.style.cssText)
        copy.setAttribute('style', `${tree.style.cssText};${copy.getAttribute('style') ?? ''}`)
      layer.append(copy)
    }
  }
}

/** The dimming veil the selection layer starts with (the design's 30 %). */
export function veil(layer: SVGGElement) {
  svgEl(
    'rect',
    {
      class: styles.veil,
      x: -100000,
      y: -100000,
      width: 200000,
      height: 200000,
    },
    layer,
  )
}
