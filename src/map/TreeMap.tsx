import {
  memo,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import { compactWords, neighbours, type Graph } from '../model/graph'
import { ROOT } from '../model/tree'
import { mark, markNow } from '../perf'
import controls from '../ui/controls.module.css'
import { Icon } from '../ui/icons'
import type { MapLayout } from './layout'
import styles from './map.module.css'
import ui from './TreeMap.module.css'
import { useZoom, type Insets } from './useZoom'

export interface TreeMapProps {
  /** Changes when another Tree is shown; the map fits itself once per Tree. */
  treeKey: string
  graph: Graph
  layout: MapLayout
  title: string
  color: string
  selected: string | null
  onSelect(id: string | null): void
  onOpen(id: string): void
  /** Space covered by floating panels, kept clear when fitting and following the selection. */
  insets: Partial<Insets>
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const PHONE_WIDTH = 640

/** Room for the floating controls around the map, plus whatever the panels cover. */
const padded = (area: Insets): Insets => ({
  top: 64 + area.top,
  right: 16 + area.right,
  bottom: 80 + area.bottom,
  left: 16 + area.left,
})

export function TreeMap({
  treeKey,
  graph,
  layout,
  title,
  color,
  selected,
  onSelect,
  onOpen,
  insets,
}: TreeMapProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const cameraRef = useRef<SVGGElement>(null)
  const overlayCameraRef = useRef<SVGGElement>(null)
  const overlayRef = useRef<SVGGElement>(null)
  const percentRef = useRef<HTMLSpanElement>(null)
  const levelRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const gridId = useId()

  const zoom = useZoom(
    stageRef,
    cameraRef,
    {
      min: 0.05,
      max: 4,
      onScale: ({ percent, far }) => {
        if (percentRef.current) percentRef.current.textContent = `${percent}%`
        if (levelRef.current) levelRef.current.textContent = far ? 'Branches' : 'Leaves'
      },
    },
    overlayCameraRef,
  )

  // Fit once per Tree; later layouts (content arriving) keep the camera where it is.
  const fitted = useRef<string | null>(null)
  // Panel insets, as plain values so effects re-run when a panel opens or closes.
  const {
    top: insetTop = 0,
    right: insetRight = 0,
    bottom: insetBottom = 0,
    left: insetLeft = 0,
  } = insets
  const area = useMemo(
    () => ({ top: insetTop, right: insetRight, bottom: insetBottom, left: insetLeft }),
    [insetTop, insetRight, insetBottom, insetLeft],
  )
  useLayoutEffect(() => {
    if (fitted.current === treeKey) return
    fitted.current = treeKey
    zoom.fit(layout.extent, padded(area))
    // On a phone, a Tree opened on a leaf zooms in on it (design screen 07): the whole
    // Tree above the bottom sheet would be too small to read.
    const at = selected !== null ? layout.byId.get(selected) : undefined
    if (at && (stageRef.current?.clientWidth ?? 0) <= PHONE_WIDTH)
      zoom.centre(at.x, at.y, area, Math.max(zoom.scale(), 1))
  }, [treeKey, layout, zoom, area, selected])

  // Elements by id, collected once per render of the geometry.
  const elements = useRef({
    nodes: new Map<string, Element>(),
    edges: new Map<string, Element>(),
    segments: new Map<string, Element>(),
    threads: [] as Element[],
    core: null as Element | null,
  })
  useLayoutEffect(() => {
    const svg = svgRef.current!
    const byId = (selector: string) =>
      new Map([...svg.querySelectorAll(selector)].map((el) => [el.getAttribute('data-id')!, el]))
    elements.current = {
      nodes: byId('[data-node]'),
      edges: byId('[data-edge]'),
      segments: byId('[data-segment]'),
      threads: [...svg.querySelectorAll('[data-thread]')],
      core: svg.querySelector('[data-core]'),
    }
    mark('map-painted')
  }, [layout])

  const threadsOf = useMemo(() => {
    const map = new Map<string, number[]>()
    layout.threads.forEach((t, i) => {
      map.set(t.from, [...(map.get(t.from) ?? []), i])
      map.set(t.to, [...(map.get(t.to) ?? []), i])
    })
    return map
  }, [layout])

  // Selection: one translucent veil over the map dims everything (the design's 30 %), and
  // copies of the selection's neighbourhood are drawn above it. The work depends on the
  // number of neighbours, not the size of the Tree (budget: < 50 ms to highlight).
  useLayoutEffect(() => {
    const stage = stageRef.current!
    const overlay = overlayRef.current!
    const els = elements.current
    const visible = (x: number, y: number) => zoom.isVisible(x, y, area)
    els.core?.removeAttribute('data-sel')
    overlay.replaceChildren()
    delete stage.dataset.focus
    if (selected === null || !graph.nodes.has(selected)) return

    if (selected === ROOT) {
      els.core?.setAttribute('data-sel', '')
      return
    }
    stage.dataset.focus = ''
    const at = layout.byId.get(selected)
    const follow = at && !visible(at.x, at.y)
    const add = (el: Element | null | undefined, attribute?: string) => {
      if (!el) return
      const copy = el.cloneNode(true) as Element
      if (attribute) copy.setAttribute(attribute, '')
      overlay.append(copy)
    }

    const veil = document.createElementNS(SVG_NS, 'rect')
    veil.setAttribute('class', styles.veil!)
    veil.setAttribute('x', '-100000')
    veil.setAttribute('y', '-100000')
    veil.setAttribute('width', '200000')
    veil.setAttribute('height', '200000')
    overlay.append(veil)

    const node = graph.nodes.get(selected)!
    for (const id of [selected, ...node.children]) add(els.edges.get(id), 'data-hot')
    let top = node
    while (top.parent && top.parent !== ROOT) top = graph.nodes.get(top.parent)!
    add(els.segments.get(top.id), 'data-hot')
    for (const i of threadsOf.get(selected) ?? []) {
      const path = document.createElementNS(SVG_NS, 'path')
      path.setAttribute('d', layout.threads[i]!.d)
      path.setAttribute('class', styles.hotThread!)
      overlay.append(path)
    }
    for (const id of neighbours(graph, selected)) {
      if (id === ROOT) add(els.core)
      else if (id !== selected) add(els.nodes.get(id))
    }
    add(els.nodes.get(selected), 'data-sel')
    if (at) {
      const halo = document.createElementNS(SVG_NS, 'circle')
      halo.setAttribute('cx', String(at.x))
      halo.setAttribute('cy', String(at.y))
      halo.setAttribute('r', String(at.r + 10))
      halo.setAttribute('class', styles.halo!)
      overlay.append(halo)
      if (follow) zoom.centre(at.x, at.y, area)
    }
  }, [selected, graph, layout, threadsOf, zoom, area])

  const idAt = (target: EventTarget): string | undefined => {
    const el = (target as Element).closest?.('[data-id]')
    return el?.hasAttribute('data-node') || el?.hasAttribute('data-core')
      ? (el.getAttribute('data-id') ?? undefined)
      : undefined
  }

  const showTip = (event: PointerEvent<HTMLDivElement>) => {
    const tip = tipRef.current!
    const id = event.pointerType === 'mouse' ? idAt(event.target) : undefined
    if (id === undefined || id === ROOT) {
      tip.hidden = true
      return
    }
    const node = graph.nodes.get(id)!
    const el = elements.current.nodes.get(id)!.querySelector('circle')!
    const box = el.getBoundingClientRect()
    const host = tip.parentElement!.getBoundingClientRect()
    const threadsIn = graph.in.get(id)?.length ?? 0
    tip.querySelector('strong')!.textContent = node.title
    tip.querySelector('span')!.textContent =
      node.kind === 'leaf'
        ? `${node.words.toLocaleString('en-US')} words · ${threadsIn} thread${threadsIn === 1 ? '' : 's'} in`
        : `${compactWords(node.total)} words inside · ${node.children.length} items`
    tip.style.left = `${box.right - host.left + 12}px`
    tip.style.top = `${box.bottom - host.top + 12}px`
    tip.hidden = false
  }

  return (
    <div className={ui.wrap}>
      <div
        ref={stageRef}
        className={styles.stage}
        data-map=""
        onClick={(e) => {
          markNow('select')
          const id = idAt(e.target)
          onSelect(id === undefined ? null : id)
        }}
        onDoubleClick={(e) => {
          const id = idAt(e.target)
          if (id !== undefined) onOpen(id)
        }}
        onPointerOver={showTip}
        onPointerLeave={() => {
          if (tipRef.current) tipRef.current.hidden = true
        }}
        style={{ '--tree': color } as CSSProperties}
      >
        <svg
          ref={svgRef}
          className={styles.svg}
          role="img"
          aria-label={`Knowledge map of ${title}`}
        >
          <defs>
            <pattern id={gridId} width="28" height="28" patternUnits="userSpaceOnUse">
              <circle className={styles.grid} cx="1.5" cy="1.5" r="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${CSS.escape(gridId)})`} />
          <g ref={cameraRef} className={styles.camera}>
            <Geometry layout={layout} graph={graph} />
          </g>
        </svg>
        {/* The selection layer: its own composited layer, so selecting never repaints the map. */}
        <svg className={`${styles.svg} ${styles.selection}`} aria-hidden="true">
          <g ref={overlayCameraRef} className={styles.camera}>
            <g ref={overlayRef} className={styles.overlay} data-overlay="" />
          </g>
        </svg>
      </div>
      <div ref={tipRef} className={ui.tip} hidden>
        <strong />
        <span />
        <em>Click to peek · double-click to open</em>
      </div>
      <LayerChips stageRef={stageRef} />
      <div className={ui.bottom} style={{ maxWidth: `calc(100% - ${(insets.right ?? 0) + 32}px)` }}>
        <div className={`${controls.panel} ${ui.zoom}`}>
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
            aria-label="Fit the tree"
            onClick={() =>
              zoom.fit(layout.extent, { top: 64, bottom: 80, left: 16, right: 16, ...insets }, true)
            }
          >
            <Icon name="fit" />
          </button>
          <span ref={levelRef} className={ui.level}>
            Leaves
          </span>
        </div>
        <div className={`${controls.panel} ${ui.legend}`}>
          <span>
            <span className={controls.glyph} data-kind="leaf" />
            Leaf
          </span>
          <span>
            <span className={controls.glyph} data-kind="sprout" />
            Leaf with sub-leaves
          </span>
          <span>
            <span className={controls.glyph} data-kind="branch" />
            Branch
          </span>
          <span>
            <span className={ui.threadSwatch} />
            Thread (@mention)
          </span>
          <span>Size = words written</span>
        </div>
      </div>
    </div>
  )
}

/** Branches / Threads toggles: they flip attributes on the <svg>, so the map doesn't re-render. */
function LayerChips({ stageRef }: { stageRef: React.RefObject<HTMLDivElement | null> }) {
  const toggle = (attribute: 'hideBranches' | 'hideThreads', button: HTMLButtonElement) => {
    const stage = stageRef.current!
    const hidden = attribute in stage.dataset
    if (hidden) delete stage.dataset[attribute]
    else stage.dataset[attribute] = ''
    button.setAttribute('aria-pressed', String(hidden))
  }
  return (
    <div className={ui.chips}>
      <button
        type="button"
        className={ui.chip}
        aria-pressed="true"
        onClick={(e) => toggle('hideBranches', e.currentTarget)}
      >
        <svg width="16" height="10" viewBox="0 0 16 10" aria-hidden="true">
          <path d="M1 9C5 9 6 1 15 1" className={ui.branchSwatch} />
        </svg>
        Branches
      </button>
      <button
        type="button"
        className={ui.chip}
        aria-pressed="true"
        onClick={(e) => toggle('hideThreads', e.currentTarget)}
      >
        <svg width="16" height="10" viewBox="0 0 16 10" aria-hidden="true">
          <path d="M1 9C5 9 6 1 15 1" className={ui.threadCurve} />
        </svg>
        Threads
      </button>
    </div>
  )
}

/** The map's geometry. Rendered once per layout; memoised so selection never touches it. */
const Geometry = memo(function Geometry({ layout, graph }: { layout: MapLayout; graph: Graph }) {
  const root = graph.nodes.get(ROOT)!
  return (
    <>
      {layout.rings.map((r) => (
        <circle key={r} className={styles.orbit} r={r} />
      ))}
      <g className={styles.edges}>
        {layout.edges.map((e) => (
          <path key={e.id} className={styles.edge} d={e.d} data-edge="" data-id={e.id} />
        ))}
      </g>
      <g className={styles.threads}>
        {layout.threads.map((t) => (
          <path key={`${t.from}>${t.to}`} className={styles.thread} d={t.d} data-thread="" />
        ))}
      </g>
      {layout.segments.map((s) => (
        <path key={s.id} className={styles.segment} d={s.d} data-segment="" data-id={s.id} />
      ))}
      {layout.nodes.map((n) => (
        <g
          key={n.id}
          className={styles.node}
          data-node=""
          data-id={n.id}
          data-kind={n.kind}
          data-deep={n.depth >= 2 ? '' : undefined}
        >
          <circle className={styles.hit} cx={n.x} cy={n.y} r={n.r + 8} />
          {n.kind === 'leaf' && n.hasChildren && (
            <circle className={styles.ring} cx={n.x} cy={n.y} r={n.r + 4} />
          )}
          <circle className={styles.dot} cx={n.x} cy={n.y} r={n.r} />
          <text
            className={
              n.depth === 1 && n.kind === 'branch'
                ? `${styles.label} ${styles.branchLabel}`
                : styles.label
            }
            x={n.labelX}
            y={n.labelY}
            textAnchor={n.anchor}
            dy={n.labelRotate ? '0.32em' : undefined}
            transform={
              n.labelRotate ? `rotate(${n.labelRotate} ${n.labelX} ${n.labelY})` : undefined
            }
          >
            {n.label}
          </text>
        </g>
      ))}
      <g className={styles.core} data-core="" data-id={ROOT}>
        <circle className={styles.coreCircle} r={layout.coreR} />
        <text className={styles.coreTitle} y={-1}>
          {root.title}
        </text>
        <text className={styles.coreWords} y={14}>
          {compactWords(root.total)} words
        </text>
      </g>
    </>
  )
})
