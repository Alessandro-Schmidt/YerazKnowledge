// Every Tree on one map (ARCHITECTURE.md §6, "Home"): each laid out on its own, scaled by
// √(total words), and placed with d3.packSiblings. Only branch labels are drawn here.
// Every dot opens straight into its Tree (issue #16): the dot nearest the pointer, within
// a few pixels, so even the smallest are easy to reach. Elsewhere a click selects the Tree.

import { packEnclose, packSiblings } from 'd3-hierarchy'
import {
  memo,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type MouseEvent,
} from 'react'
import type { TreeRef } from '../github/graphql'
import { compactWords, treeThreads, type Graph } from '../model/graph'
import { ROOT } from '../model/tree'
import controls from '../ui/controls.module.css'
import { Icon } from '../ui/icons'
import { colorVar } from '../ui/theme'
import { layoutFor, nodeAt, type MapLayout } from './layout'
import styles from './map.module.css'
import ui from './HomeMap.module.css'
import tips from './TreeMap.module.css'
import { useZoom } from './useZoom'

export interface HomeEntry {
  tree: TreeRef
  graph: Graph
}

const LARGEST = 190
const SMALLEST = 70
/** How far from a dot, in screen pixels, a pointer still reaches it. */
const REACH = { mouse: 10, touch: 18 }

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

export function HomeMap({
  entries,
  selected,
  onSelect,
  onOpen,
}: {
  entries: HomeEntry[]
  selected: string | null
  onSelect(repo: string | null): void
  /** Opens a Tree; with a node id, opens it at that node ('' is the Tree itself). */
  onOpen(repo: string, id?: string): void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const hot = useRef<Element[]>([])
  const frame = useRef(0)
  const cameraRef = useRef<SVGGElement>(null)
  const percentRef = useRef<HTMLSpanElement>(null)
  const gridId = useId()
  const zoom = useZoom(svgRef, cameraRef, {
    min: 0.1,
    max: 4,
    onScale: ({ percent }) => {
      if (percentRef.current) percentRef.current.textContent = `${percent}%`
    },
  })

  const placed = useMemo(() => {
    const most = Math.max(1, ...entries.map((e) => e.graph.stats.words))
    const circles = entries.map((e) => {
      const radius = Math.max(SMALLEST, LARGEST * Math.sqrt(e.graph.stats.words / most))
      return { ...e, layout: layoutFor(e.graph), radius, r: radius + 70, x: 0, y: 0 }
    })
    packSiblings(circles)
    const enclosing = circles.length ? packEnclose(circles) : { x: 0, y: 0, r: 1 }
    for (const c of circles) {
      c.x -= enclosing.x
      c.y -= enclosing.y
    }
    // Threads between Trees: dashed curves between cores, bowed to one side, so the two
    // directions between a pair don't overlap (ARCHITECTURE.md §6).
    const at = new Map(circles.map((c) => [c.tree.repo, c]))
    const between = treeThreads(entries.map((e) => ({ repo: e.tree.repo, graph: e.graph }))).map(
      (t) => {
        const a = at.get(t.from)!
        const b = at.get(t.to)!
        const bow = 0.18
        const cx = (a.x + b.x) / 2 - (b.y - a.y) * bow
        const cy = (a.y + b.y) / 2 + (b.x - a.x) * bow
        const label = `${a.tree.title} → ${b.tree.title} · ${t.count} thread${t.count === 1 ? '' : 's'}`
        return { ...t, label, d: `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}` }
      },
    )
    return { circles, between, extent: enclosing.r, byRepo: at }
  }, [entries])

  /** The Tree under the pointer, and the node it reaches (null: none within reach). */
  const hitAt = (target: EventTarget, x: number, y: number, reach: number) => {
    const treeEl = (target as Element).closest?.('[data-tree]')
    if (!treeEl) return null
    const repo = treeEl.getAttribute('data-tree')!
    const ctm = treeEl.querySelector<SVGGElement>('[data-layout]')?.getScreenCTM()
    const circle = placed.byRepo.get(repo)
    if (!ctm || !circle) return { repo, treeEl, id: null }
    const p = new DOMPoint(x, y).matrixTransform(ctm.inverse())
    return { repo, treeEl, id: nodeAt(circle.layout, p.x, p.y, reach / ctm.a) }
  }

  // Hover: the reached dot lights up and a tip names it. Attributes only, never a render.
  const clearHot = () => {
    for (const el of hot.current) el.removeAttribute('data-hot')
    hot.current = []
    if (tipRef.current) tipRef.current.hidden = true
  }
  const showHot = (target: EventTarget, x: number, y: number) => {
    clearHot()
    const hit = hitAt(target, x, y, REACH.mouse)
    if (!hit || hit.id === null) return
    const graph = placed.byRepo.get(hit.repo)!.graph
    const node = graph.nodes.get(hit.id)!
    const dot =
      hit.id === ROOT
        ? hit.treeEl.querySelector('[data-core]')
        : hit.treeEl.querySelector(`[data-id="${CSS.escape(hit.id)}"]`)
    hot.current = [hit.treeEl, ...(dot ? [dot] : [])]
    for (const el of hot.current) el.setAttribute('data-hot', '')
    const tip = tipRef.current!
    const host = tip.parentElement!.getBoundingClientRect()
    tip.querySelector('strong')!.textContent = `${node.icon ? `${node.icon} ` : ''}${node.title}`
    tip.querySelector('span')!.textContent =
      node.kind === 'root'
        ? `Tree · ${plural(graph.stats.leaves, 'leaf', 'leaves')}`
        : node.kind === 'branch'
          ? `Branch · ${plural(node.children.length, 'item')}`
          : `Leaf · ${plural(node.words, 'word')}`
    tip.style.left = `${x - host.left + 14}px`
    tip.style.top = `${y - host.top + 14}px`
    tip.hidden = false
  }

  const click = (e: MouseEvent<SVGSVGElement>) => {
    const touch = (e.nativeEvent as Partial<PointerEvent>).pointerType === 'touch'
    const hit = hitAt(e.target, e.clientX, e.clientY, touch ? REACH.touch : REACH.mouse)
    if (hit && hit.id !== null) onOpen(hit.repo, hit.id)
    else onSelect(hit ? hit.repo : null)
  }

  const count = placed.circles.length
  useLayoutEffect(() => {
    zoom.fit(placed.extent, { top: 24, bottom: 80, left: 24, right: 24 })
  }, [count, placed.extent, zoom])

  return (
    <div className={ui.wrap}>
      <svg
        ref={svgRef}
        className={styles.svg}
        data-focus={selected ? '' : undefined}
        role="img"
        aria-label="Map of every connected tree"
        onClick={click}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return
          const { target, clientX, clientY } = e
          cancelAnimationFrame(frame.current)
          frame.current = requestAnimationFrame(() => showHot(target, clientX, clientY))
        }}
        onPointerLeave={() => {
          cancelAnimationFrame(frame.current)
          clearHot()
        }}
        onDoubleClick={(e) => {
          const el = (e.target as Element).closest('[data-tree]')
          if (el) onOpen(el.getAttribute('data-tree')!)
        }}
      >
        <defs>
          <pattern id={gridId} width="28" height="28" patternUnits="userSpaceOnUse">
            <circle className={styles.grid} cx="1.5" cy="1.5" r="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${CSS.escape(gridId)})`} />
        <g ref={cameraRef} className={styles.camera}>
          {placed.between.map((t) => (
            <path
              key={`${t.from}>${t.to}`}
              className={ui.between}
              d={t.d}
              data-between={`${t.from}>${t.to}`}
            >
              <title>{t.label}</title>
            </path>
          ))}
          {placed.circles.map((c) => (
            <g
              key={c.tree.repo}
              className={styles.tree}
              data-tree={c.tree.repo}
              data-sel={selected === c.tree.repo ? '' : undefined}
              transform={`translate(${Math.round(c.x)} ${Math.round(c.y)})`}
              style={{ '--tree': colorVar(c.tree.color) } as CSSProperties}
            >
              <circle className={styles.hit} r={c.radius + 18} />
              <circle className={styles.treeOrbit} r={c.radius + 16} />
              <MiniTree
                layout={c.layout}
                scale={c.radius / c.layout.R}
                words={c.graph.stats.words}
              />
              <text className={styles.treeName} y={c.radius + 38}>
                {c.tree.title}
              </text>
              <text className={styles.treeMeta} y={c.radius + 56}>
                {c.tree.repo} · {c.graph.stats.leaves} leaves
              </text>
            </g>
          ))}
        </g>
      </svg>
      <div ref={tipRef} className={tips.tip} hidden>
        <strong />
        <span />
        <em>Click to open</em>
      </div>
      <div className={`${controls.panel} ${ui.zoom}`}>
        <button
          type="button"
          className={controls.iconButton}
          aria-label="Zoom out"
          onClick={() => zoom.zoomBy(1 / 1.25)}
        >
          <Icon name="minus" />
        </button>
        <span ref={percentRef} className={ui.percent}>
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
          onClick={() =>
            zoom.fit(placed.extent, { top: 24, bottom: 80, left: 24, right: 24 }, true)
          }
        >
          <Icon name="fit" />
        </button>
      </div>
    </div>
  )
}

/** One Tree, drawn small: no leaf labels, branch labels only when there is room. */
const MiniTree = memo(function MiniTree({
  layout,
  scale,
  words,
}: {
  layout: MapLayout
  scale: number
  words: number
}) {
  const showLabels = layout.R * scale >= 110
  return (
    <>
      <g transform={`scale(${scale})`} data-layout="">
        {layout.edges.map((e) => (
          <path key={e.id} className={styles.edge} d={e.d} />
        ))}
        {layout.threads.map((t) => (
          <path key={`${t.from}>${t.to}`} className={styles.thread} d={t.d} />
        ))}
        {layout.segments.map((s) => (
          <path key={s.id} className={styles.segment} d={s.d} />
        ))}
        {layout.nodes.map((n) => (
          <g key={n.id} className={ui.node} data-kind={n.kind} data-id={n.id}>
            {n.kind === 'leaf' && n.hasChildren && (
              <circle className={styles.ring} cx={n.x} cy={n.y} r={n.r + 3.5} />
            )}
            <circle className={styles.dot} cx={n.x} cy={n.y} r={n.r} />
          </g>
        ))}
        <circle className={styles.coreCircle} r={layout.coreR} data-core="" />
      </g>
      {showLabels &&
        layout.nodes
          .filter((n) => n.depth === 1 && n.kind === 'branch')
          .map((n) => (
            <text
              key={n.id}
              className={`${styles.label} ${styles.branchLabel} ${ui.label}`}
              x={n.labelX * scale}
              y={n.labelY * scale}
              textAnchor={n.anchor}
            >
              {n.label}
            </text>
          ))}
      <text className={styles.coreWords} y={3.5}>
        {compactWords(words)}
      </text>
    </>
  )
})
