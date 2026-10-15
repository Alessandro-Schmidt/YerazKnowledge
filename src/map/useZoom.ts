// Pan and zoom for a map. d3-zoom writes one CSS transform on the camera <g>; React never
// re-renders while you pan or zoom (ARCHITECTURE.md §6). Layout coordinates are centred
// on (0, 0).
//
// As in the design, 100 % means "fitted to the screen". Leaf labels show from 85 % of that
// (development-plan.md §3.3), but never while they would be drawn smaller than 0.6× their
// size, so a large Tree opens on its branches. The level is published as `data-zoom` on
// the host and through `onScale`, which callers use to write the percentage into the DOM.

import { select } from 'd3-selection'
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import type { Box } from './layout'

export interface ZoomControls {
  zoomBy(factor: number): void
  /** Fits a box, or a circle of that radius around (0, 0), leaving `insets` (px) free on each side. */
  fit(area: Box | number, insets?: Partial<Insets>, animate?: boolean): void
  /** Moves the camera so layout point (x, y) shows at the centre of the free area, at scale `k` if given. */
  centre(x: number, y: number, insets?: Partial<Insets>, k?: number): void
  /** True when layout point (x, y) is inside the free area. */
  isVisible(x: number, y: number, insets?: Partial<Insets>): boolean
  scale(): number
}

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
const LABEL_ZOOM = 0.85
const LEGIBLE = 0.6

export interface ScaleInfo {
  /** Percent of the fitted scale. */
  percent: number
  /** True when leaf labels are hidden. */
  far: boolean
}

/**
 * `hostRef` receives the gestures and the `data-zoom` attribute. `cameraRef` gets the
 * transform, and so does `mirrorRef` when given (the Tree map's selection layer).
 */
export function useZoom(
  hostRef: RefObject<HTMLElement | SVGSVGElement | null>,
  cameraRef: RefObject<SVGGElement | null>,
  options: { min: number; max: number; onScale?: (info: ScaleInfo) => void },
  mirrorRef?: RefObject<SVGGElement | null>,
): ZoomControls {
  const svgRef = hostRef
  const behaviour = useRef<ZoomBehavior<HTMLElement | SVGSVGElement, unknown> | null>(null)
  const fitted = useRef(1)
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  // A layout effect, so the behaviour exists before callers' layout effects fit the map.
  useLayoutEffect(() => {
    const svg = svgRef.current
    const cameras = [cameraRef.current, mirrorRef?.current].filter(
      (c) => c !== null && c !== undefined,
    )
    if (!svg || !cameras.length) return
    let far: boolean | null = null
    const z = d3zoom<HTMLElement | SVGSVGElement, unknown>()
      .scaleExtent([optionsRef.current.min, optionsRef.current.max])
      .on('zoom', (event: { transform: { x: number; y: number; k: number } }) => {
        const { x, y, k } = event.transform
        for (const camera of cameras)
          camera.style.transform = `translate(${x}px, ${y}px) scale(${k})`
        const isFar = k < Math.max(LABEL_ZOOM * fitted.current, LEGIBLE)
        if (isFar !== far) {
          far = isFar
          svg.dataset.zoom = isFar ? 'far' : 'near'
        }
        optionsRef.current.onScale?.({
          percent: Math.round((k / fitted.current) * 100),
          far: isFar,
        })
      })
    behaviour.current = z
    select(svg).call(z).on('dblclick.zoom', null)
    return () => {
      select(svg).on('.zoom', null)
      behaviour.current = null
    }
  }, [svgRef, cameraRef, mirrorRef])

  const area = useCallback(
    (insets: Partial<Insets> = {}) => {
      const svg = svgRef.current
      const i = { ...NO_INSETS, ...insets }
      const w = svg?.clientWidth ?? 0
      const h = svg?.clientHeight ?? 0
      return {
        i,
        w,
        h,
        cx: i.left + (w - i.left - i.right) / 2,
        cy: i.top + (h - i.top - i.bottom) / 2,
      }
    },
    [svgRef],
  )

  const move = useCallback(
    (x: number, y: number, k: number, animate: boolean) => {
      const svg = svgRef.current
      const camera = cameraRef.current
      const z = behaviour.current
      if (!svg || !camera || !z) return
      if (animate) {
        for (const c of [cameraRef.current, mirrorRef?.current]) {
          if (!c) continue
          c.dataset.animate = ''
          window.setTimeout(() => delete c.dataset.animate, 460)
        }
      }
      select(svg).call(z.transform, zoomIdentity.translate(x, y).scale(k))
    },
    [svgRef, cameraRef, mirrorRef],
  )

  const current = useCallback(() => {
    const camera = cameraRef.current
    const m =
      camera &&
      /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(camera.style.transform)
    return m ? { x: Number(m[1]), y: Number(m[2]), k: Number(m[3]) } : { x: 0, y: 0, k: 1 }
  }, [cameraRef])

  return useMemo<ZoomControls>(
    () => ({
      zoomBy(factor) {
        const { x, y, k } = current()
        const { w, h } = area()
        const next = Math.min(optionsRef.current.max, Math.max(optionsRef.current.min, k * factor))
        // Zoom around the centre of the view.
        const cx = (w / 2 - x) / k
        const cy = (h / 2 - y) / k
        move(w / 2 - cx * next, h / 2 - cy * next, next, true)
      },
      fit(box, insets, animate = false) {
        const { x0, y0, x1, y1 } =
          typeof box === 'number' ? { x0: -box, y0: -box, x1: box, y1: box } : box
        const { i, w, h, cx, cy } = area(insets)
        const k = Math.min(
          optionsRef.current.max,
          Math.max(
            optionsRef.current.min,
            Math.min((w - i.left - i.right) / (x1 - x0), (h - i.top - i.bottom) / (y1 - y0)),
          ),
        )
        fitted.current = k
        move(cx - ((x0 + x1) / 2) * k, cy - ((y0 + y1) / 2) * k, k, animate)
      },
      centre(x, y, insets, scale) {
        const k = scale ?? current().k
        const { cx, cy } = area(insets)
        move(cx - x * k, cy - y * k, k, true)
      },
      isVisible(x, y, insets) {
        const t = current()
        const { i, w, h } = area(insets)
        const sx = t.x + x * t.k
        const sy = t.y + y * t.k
        return (
          sx > i.left + 24 && sx < w - i.right - 24 && sy > i.top + 24 && sy < h - i.bottom - 24
        )
      },
      scale: () => current().k,
    }),
    [area, move, current],
  )
}
