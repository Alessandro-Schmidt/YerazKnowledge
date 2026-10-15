// Every Tree on one map (ARCHITECTURE.md §6, "Home"): each laid out on its own, scaled by
// √(total words), and placed with d3.packSiblings. Only branch labels are drawn here.

import { packEnclose, packSiblings } from 'd3-hierarchy'
import { memo, useId, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import type { TreeRef } from '../github/graphql'
import { compactWords, treeThreads, type Graph } from '../model/graph'
import controls from '../ui/controls.module.css'
import { Icon } from '../ui/icons'
import { colorVar } from '../ui/theme'
import { layoutFor, type MapLayout } from './layout'
import styles from './map.module.css'
import ui from './HomeMap.module.css'
import { useZoom } from './useZoom'

export interface HomeEntry {
  tree: TreeRef
  graph: Graph
}

const LARGEST = 190
const SMALLEST = 70

export function HomeMap({
  entries,
  selected,
  onSelect,
  onOpen,
}: {
  entries: HomeEntry[]
  selected: string | null
  onSelect(repo: string | null): void
  onOpen(repo: string): void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
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
    return { circles, between, extent: enclosing.r }
  }, [entries])

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
        onClick={(e) => {
          const el = (e.target as Element).closest('[data-tree]')
          onSelect(el ? el.getAttribute('data-tree') : null)
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
      <g transform={`scale(${scale})`}>
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
          <g key={n.id} className={ui.node} data-kind={n.kind}>
            {n.kind === 'leaf' && n.hasChildren && (
              <circle className={styles.ring} cx={n.x} cy={n.y} r={n.r + 3.5} />
            )}
            <circle className={styles.dot} cx={n.x} cy={n.y} r={n.r} />
          </g>
        ))}
        <circle className={styles.coreCircle} r={layout.coreR} />
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
