// The map of a Family (ARCHITECTURE.md §6): every Tree of the repository at once, each
// drawn by Geometry around its own core, placed by family.ts. React draws the geometry
// once per layout; pan, zoom, hover and selection never re-render it.

import {
  memo,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import { compactWords, neighbours, type Graph, type Thread } from '../model/graph'
import { ROOT } from '../model/tree'
import { mark, markNow } from '../perf'
import controls from '../ui/controls.module.css'
import { Icon } from '../ui/icons'
import { familyNodeAt, positionOf, type FamilyLayout, type PlacedTree } from './family'
import fam from './family.module.css'
import { ICON_SIZE, type Box, type MapLayout } from './layout'
import styles from './map.module.css'
import ui from './TreeMap.module.css'
import { useZoom, type Insets } from './useZoom'

export interface TreeMapProps {
  /** Changes when another Family is shown; the map fits itself once per Family. */
  treeKey: string
  /** The Family's graph: the whole repository. */
  graph: Graph
  family: FamilyLayout
  title: string
  color: string
  selected: string | null
  /** The Matches layer: the nodes a search found here, lit above the veil like a selection. */
  matches: { query: string; ids: readonly string[] } | null
  onClearMatches(): void
  onSelect(id: string | null): void
  onOpen(id: string): void
  /** Space covered by floating panels, kept clear when fitting and following the selection. */
  insets: Partial<Insets>
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const PHONE_WIDTH = 640
/** How far from a dot, in screen pixels, a click still reaches it. */
const REACH = { mouse: 10, touch: 18 }
/** A Tree is fitted as if it were at least this wide, so a small one isn't blown up. */
const SMALLEST = 330

/** Room for the floating controls around the map, plus whatever the panels cover. */
const padded = (area: Insets): Insets => ({
  top: 64 + area.top,
  right: 16 + area.right,
  bottom: 80 + area.bottom,
  left: 16 + area.left,
})

/** What the camera fits: one Tree, as it is, or (null) the whole Family. */
function boxOf(family: FamilyLayout, tree: string | null): Box {
  const t = tree === null ? undefined : family.treeOf.get(tree)
  if (!t) return family.bounds
  const b = t.layout.bounds
  return {
    x0: t.x + Math.min(b.x0, -SMALLEST),
    y0: t.y + Math.min(b.y0, -SMALLEST),
    x1: t.x + Math.max(b.x1, SMALLEST),
    y1: t.y + Math.max(b.y1, SMALLEST),
  }
}

const treeTransform = (t: PlacedTree) => `translate(${t.x} ${t.y})`

export function TreeMap({
  treeKey,
  graph,
  family,
  title,
  color,
  selected,
  matches,
  onClearMatches,
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

  // Fit once per Family: every Tree, whatever node it opens on (owner's decision). A later
  // layout (the leaves' content arriving, which sizes the dots) is fitted again only while
  // the camera is untouched: it never moves under someone who has panned, zoomed or
  // followed a selection.
  const fitted = useRef<string | null>(null)
  const fittedLayout = useRef<FamilyLayout | null>(null)
  /** The Tree the camera was last fitted to; null for the whole Family. */
  const target = useRef<string | null>(null)
  /** The Tree core whose selection was last acted on: the one opened on isn't followed. */
  const followed = useRef<string | null>(null)
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
    // A phone's bottom sheet leaves too little room to fit the Family above it: the Family
    // takes the screen, and the sheet covers its lower part until dismissed.
    const fitArea = () =>
      (stageRef.current?.clientWidth ?? 0) <= PHONE_WIDTH ? { ...area, bottom: 0 } : area
    if (fitted.current === treeKey) {
      if (fittedLayout.current !== family && zoom.untouched())
        zoom.fit(boxOf(family, target.current), padded(fitArea()), true)
      fittedLayout.current = family
      return
    }
    fitted.current = treeKey
    fittedLayout.current = family
    target.current = null
    followed.current = selected
    zoom.fit(family.bounds, padded(fitArea()))
  }, [treeKey, family, zoom, area, selected])

  // Elements by id, collected once per render of the geometry.
  const elements = useRef({
    nodes: new Map<string, Element>(),
    edges: new Map<string, Element>(),
    segments: new Map<string, Element>(),
    /** Each Tree's core, by the Tree's id. */
    cores: new Map<string, Element>(),
  })
  useLayoutEffect(() => {
    const svg = svgRef.current!
    const byId = (selector: string) =>
      new Map([...svg.querySelectorAll(selector)].map((el) => [el.getAttribute('data-id')!, el]))
    elements.current = {
      nodes: byId('[data-node]'),
      edges: byId('[data-edge]'),
      segments: byId('[data-segment]'),
      cores: new Map(
        [...svg.querySelectorAll('[data-tree]')].map((el) => [
          el.getAttribute('data-tree')!,
          el.querySelector('[data-core]')!,
        ]),
      ),
    }
    mark('map-painted')
  }, [family])

  /** Node id → its threads' paths, and the Tree they are drawn in (null: between Trees). */
  const threadsOf = useMemo(() => {
    const map = new Map<string, { d: string; tree: PlacedTree | null; ghost?: true }[]>()
    const add = (id: string, t: Thread & { d: string }, tree: PlacedTree | null) =>
      map.set(id, [...(map.get(id) ?? []), { d: t.d, tree, ghost: t.ghost }])
    for (const tree of family.trees) {
      for (const t of tree.layout.threads) {
        add(t.from === ROOT ? tree.id : t.from, t, tree)
        add(t.to === ROOT ? tree.id : t.to, t, tree)
      }
    }
    for (const t of family.between) {
      add(t.from, t, null)
      add(t.to, t, null)
    }
    return map
  }, [family])

  // Selection: one translucent veil over the map dims everything (the design's 30 %), and
  // copies of the selection's neighbourhood are drawn above it. The work depends on the
  // number of neighbours, not the size of the Family (budget: < 50 ms to highlight).
  // Selecting a Tree (its core) fits the camera to it: the Tree as it is. Search matches are
  // copied above the same veil, so they glow wherever they are in the Family.
  useLayoutEffect(() => {
    const stage = stageRef.current!
    const overlay = overlayRef.current!
    const els = elements.current
    const visible = (x: number, y: number) => zoom.isVisible(x, y, area)
    for (const core of els.cores.values()) core.removeAttribute('data-sel')
    overlay.replaceChildren()
    delete stage.dataset.focus
    const tree = selected === null ? undefined : family.treeOf.get(selected)
    const parentOf = (id: string) => (graph.nodes.get(id) ?? graph.ghosts.get(id))?.parent ?? null
    const known =
      selected !== null &&
      tree !== undefined &&
      (graph.nodes.has(selected) || graph.ghosts.has(selected))
    const onCore = known && selected === tree.id
    if (onCore) {
      els.cores.get(selected)?.setAttribute('data-sel', '')
      if (followed.current !== selected) {
        followed.current = selected
        target.current = selected
        // A phone's bottom sheet leaves too little room to fit a Tree above it: the Tree
        // takes the screen's width, and the sheet covers its lower part until dismissed.
        const phone = stage.clientWidth <= PHONE_WIDTH
        zoom.fit(boxOf(family, selected), padded(phone ? { ...area, bottom: 0 } : area), true)
      }
    }
    const lit = matches?.ids ?? []
    if ((!known || onCore) && !lit.length) return
    stage.dataset.focus = ''
    // Copies keep their Tree's place: each Tree's go in a group moved like the Tree.
    const groups = new Map<PlacedTree, Element>()
    const layer = (t: PlacedTree | null | undefined): Element => {
      if (!t) return overlay
      let g = groups.get(t)
      if (!g) {
        g = document.createElementNS(SVG_NS, 'g')
        g.setAttribute('transform', treeTransform(t))
        g.setAttribute('data-tree', t.id)
        overlay.append(g)
        groups.set(t, g)
      }
      return g
    }
    const add = (id: string, el: Element | null | undefined, attribute?: string) => {
      if (!el) return
      const copy = el.cloneNode(true) as Element
      if (attribute) copy.setAttribute(attribute, '')
      layer(family.treeOf.get(id)).append(copy)
    }

    const veil = document.createElementNS(SVG_NS, 'rect')
    veil.setAttribute('class', styles.veil!)
    veil.setAttribute('x', '-100000')
    veil.setAttribute('y', '-100000')
    veil.setAttribute('width', '200000')
    veil.setAttribute('height', '200000')
    overlay.append(veil)

    for (const id of lit) add(id, els.nodes.get(id) ?? els.cores.get(id), 'data-match')
    if (!known || onCore) {
      if (onCore) add(selected, els.cores.get(selected))
      return
    }
    const at = positionOf(family, selected)!
    const follow = !visible(at.x, at.y)
    const children = graph.nodes.get(selected)?.children ?? []
    for (const id of [selected, ...children]) add(id, els.edges.get(id), 'data-hot')
    let top = selected
    for (let up = parentOf(top); up !== null && up !== tree.id; up = parentOf(up)) top = up
    add(top, els.segments.get(top), 'data-hot')
    for (const { d, tree: drawnIn, ghost } of threadsOf.get(selected) ?? []) {
      const path = document.createElementNS(SVG_NS, 'path')
      path.setAttribute('d', d)
      path.setAttribute('class', styles.hotThread!)
      if (ghost) path.setAttribute('data-ghost', '')
      layer(drawnIn).append(path)
    }
    for (const id of neighbours(graph, selected)) {
      if (id !== ROOT && id !== selected) add(id, els.nodes.get(id) ?? els.cores.get(id))
    }
    add(selected, els.nodes.get(selected), 'data-sel')
    const dot = tree.layout.byId.get(selected)!
    const halo = document.createElementNS(SVG_NS, 'circle')
    halo.setAttribute('cx', String(dot.x))
    halo.setAttribute('cy', String(dot.y))
    halo.setAttribute('r', String(dot.r + 10))
    halo.setAttribute('class', styles.halo!)
    layer(tree).append(halo)
    if (follow) zoom.centre(at.x, at.y, area)
  }, [selected, matches, graph, family, threadsOf, zoom, area])

  /** The node a pointer event is on: a dot, or a Tree's core (the Tree's id). */
  const idAt = (target: EventTarget): string | undefined => {
    const el = (target as Element).closest?.('[data-node], [data-core]')
    if (!el) return undefined
    const id = el.hasAttribute('data-core')
      ? el.closest('[data-tree]')?.getAttribute('data-tree')
      : el.getAttribute('data-id')
    return id ?? undefined
  }

  /** Off every dot: the one nearest the pointer within a few pixels, so small dots are easy to hit. */
  const nearest = (x: number, y: number, touch: boolean): string | undefined => {
    const ctm = cameraRef.current?.getScreenCTM()
    if (!ctm) return undefined
    const p = new DOMPoint(x, y).matrixTransform(ctm.inverse())
    const reach = (touch ? REACH.touch : REACH.mouse) / ctm.a
    const id = familyNodeAt(family, p.x, p.y, reach)
    const hidden = id !== null && graph.ghosts.has(id) && 'hideGhosts' in stageRef.current!.dataset
    return id === null || hidden ? undefined : id
  }

  const showTip = (event: PointerEvent<HTMLDivElement>) => {
    const tip = tipRef.current!
    const id = event.pointerType === 'mouse' ? idAt(event.target) : undefined
    const el =
      id === undefined
        ? undefined
        : (elements.current.nodes.get(id) ?? elements.current.cores.get(id))
    if (id === undefined || !el) {
      tip.hidden = true
      return
    }
    const box = el.querySelector('circle')!.getBoundingClientRect()
    const host = tip.parentElement!.getBoundingClientRect()
    const ghost = graph.ghosts.get(id)
    // A ghost is a node only in its Tree's own graph.
    const node = graph.nodes.get(id) ?? family.treeOf.get(id)!.graph.nodes.get(id)!
    const threadsIn = ghost?.from.length ?? graph.in.get(id)?.length ?? 0
    const threads = `${threadsIn} thread${threadsIn === 1 ? '' : 's'} in`
    tip.querySelector('strong')!.textContent = `${node.icon ? `${node.icon} ` : ''}${node.title}`
    tip.querySelector('span')!.textContent = ghost
      ? `Not written yet · ${threads}`
      : node.parent === ROOT
        ? `Tree · ${compactWords(node.total)} words`
        : node.kind === 'leaf'
          ? `${node.words.toLocaleString('en-US')} words · ${threads}`
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
          const touch = (e.nativeEvent as Partial<globalThis.PointerEvent>).pointerType === 'touch'
          const id = idAt(e.target) ?? nearest(e.clientX, e.clientY, touch)
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
            <Family family={family} />
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
      <LayerChips
        stageRef={stageRef}
        ghosts={graph.ghosts.size > 0}
        matches={matches}
        onClearMatches={onClearMatches}
      />
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
            aria-label="Fit all trees"
            // The same fit as opening the Family: the panel insets plus the map's own margins.
            onClick={() => {
              target.current = null
              followed.current = null
              zoom.fit(family.bounds, padded(area), true)
            }}
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
          {graph.ghosts.size > 0 && (
            <span>
              <span className={controls.glyph} data-kind="ghost" />
              Not written yet
            </span>
          )}
          <span>Size = words written</span>
        </div>
      </div>
    </div>
  )
}

/** Every Tree around its own core, the threads between them, and their names. */
const Family = memo(function Family({ family }: { family: FamilyLayout }) {
  return (
    <>
      <g className={styles.threads}>
        {family.between.map((t, i) => (
          <path
            key={i}
            className={styles.thread}
            d={t.d}
            data-thread=""
            data-between=""
            data-ghost={t.ghost ? '' : undefined}
          />
        ))}
      </g>
      {family.trees.map((t) => (
        <g key={t.id} data-tree={t.id} transform={treeTransform(t)}>
          <Geometry layout={t.layout} graph={t.graph} />
          <text className={fam.name} y={t.name.y} fontSize={t.name.size}>
            {t.graph.nodes.get(ROOT)!.title}
          </text>
        </g>
      ))}
    </>
  )
})

/**
 * Branches / Threads toggles: they flip attributes on the <svg>, so the map doesn't re-render.
 * The Matches chip shows while a search is lit, and clears it.
 */
function LayerChips({
  stageRef,
  ghosts,
  matches,
  onClearMatches,
}: {
  stageRef: React.RefObject<HTMLDivElement | null>
  /** Links to leaves not written yet are on the map: they get a chip of their own. */
  ghosts: boolean
  matches: TreeMapProps['matches']
  onClearMatches(): void
}) {
  const toggle = (
    attribute: 'hideBranches' | 'hideThreads' | 'hideGhosts',
    button: HTMLButtonElement,
  ) => {
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
      {ghosts && (
        <button
          type="button"
          className={ui.chip}
          aria-pressed="true"
          onClick={(e) => toggle('hideGhosts', e.currentTarget)}
        >
          <span className={controls.glyph} data-kind="ghost" aria-hidden="true" />
          Not written
        </button>
      )}
      {matches && (
        <button
          type="button"
          className={ui.chip}
          aria-label={`Clear matches for “${matches.query}”`}
          onClick={onClearMatches}
        >
          <Icon name="search" size={14} />
          Matches · {matches.ids.length}
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  )
}

/** A leaf's emoji, centred on its dot and sized to fill it. */
export function MapIcon({ x, y, r, icon }: { x: number; y: number; r: number; icon: string }) {
  return (
    <text className={styles.icon} x={x} y={y} dy="0.35em" fontSize={Math.round(r * ICON_SIZE)}>
      {icon}
    </text>
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
      <g className={styles.threads}>
        {layout.threads.map((t) => (
          <path
            key={`${t.from}>${t.to}`}
            className={styles.thread}
            d={t.d}
            data-thread=""
            data-ghost={t.ghost ? '' : undefined}
          />
        ))}
      </g>
      <g className={styles.edges}>
        {layout.edges.map((e) => (
          <path
            key={e.id}
            className={styles.edge}
            d={e.d}
            data-edge=""
            data-id={e.id}
            data-depth={Math.min(e.depth, 3)}
            data-ghost={graph.ghosts.has(e.id) ? '' : undefined}
          />
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
          data-icon={n.icon ? '' : undefined}
          data-ghost={graph.ghosts.has(n.id) ? '' : undefined}
        >
          <circle className={styles.hit} cx={n.x} cy={n.y} r={n.r + 8} />
          {n.kind === 'leaf' && n.hasChildren && (
            <circle className={styles.ring} cx={n.x} cy={n.y} r={n.r + 4} />
          )}
          <circle className={styles.dot} cx={n.x} cy={n.y} r={n.r} />
          {n.icon && <MapIcon x={n.x} y={n.y} r={n.r} icon={n.icon} />}
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
        {layout.coreLines.map((line, i) => (
          <text
            key={i}
            className={styles.coreTitle}
            y={-1 + 14 * i - 7 * (layout.coreLines.length - 1)}
          >
            {line}
          </text>
        ))}
        <text className={styles.coreWords} y={14 + 7 * (layout.coreLines.length - 1)}>
          {compactWords(root.total)} words
        </text>
      </g>
    </>
  )
})
