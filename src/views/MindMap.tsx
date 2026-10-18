// Mind map (design/views/screens/01, 10): the Family as a horizontal map, its Trees either side
// of the core, leaves and sub-leaves in rows. The selection's threads arc over the map.
// On a phone it is one-sided and vertical, scrolled with the thumb.

import { memo, useCallback, useMemo, useState, type CSSProperties } from 'react'
import { compactWords, type Graph } from '../model/graph'
import controls from '../ui/controls.module.css'
import { Canvas, svgEl } from './Canvas'
import { degree, plural, treeColor, type ViewProps } from './common'
import { layoutMind, type MindLayout } from './layout/mindmap'
import ui from '../map/TreeMap.module.css'
import styles from './MindMap.module.css'
import type { TreeRef } from '../github/graphql'

/** Levels shown before "Expand all": the Trees, their children and grandchildren. */
const DEPTH = 3

export default function MindMap({
  tree,
  graph,
  selected,
  phone,
  insets,
  onSelect,
  onOpen,
}: ViewProps) {
  const [all, setAll] = useState(false)
  const [threads, setThreads] = useState(true)
  // The way to the selection opens with it; other levels follow "Expand all".
  const open = selected !== null && graph.nodes.has(selected) ? selected : null
  const layout = useMemo(
    () => layoutMind(graph, { phone, depth: all ? Infinity : DEPTH, open }),
    // A new selection re-lays out only when it is hidden at the current depth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, phone, all, open !== null && (graph.nodes.get(open)?.depth ?? 0) > DEPTH ? open : null],
  )

  const drawSelection = useCallback(
    (layer: SVGGElement, id: string) => {
      const n = layout.byId.get(id)
      if (!n) return null
      const g = svgEl('g', { style: `--tree: ${treeColor(tree, n.tree)}` }, layer)
      if (threads) {
        const ends = [...(graph.out.get(id) ?? []), ...(graph.in.get(id) ?? [])]
        for (const other of new Set(ends)) {
          const m = layout.byId.get(other)
          if (!m) continue
          const d = threadPath(layout, n, m, phone)
          svgEl('path', { d, class: styles.hotThread }, g)
          svgEl('circle', { cx: m.x, cy: m.y, r: m.r + 4, class: styles.end }, g)
        }
      }
      if (n.depth === 1) {
        const x0 = n.side > 0 ? n.x : n.x - n.pill
        svgEl(
          'rect',
          { x: x0 - 4, y: n.y - 17, width: n.pill + 8, height: 34, rx: 17, class: styles.halo },
          g,
        )
        return { x: n.x, y: n.y }
      }
      svgEl('circle', { cx: n.x, cy: n.y, r: n.r + 7, class: styles.halo }, g)
      svgEl('circle', { cx: n.x, cy: n.y, r: n.r, class: styles.selDot }, g)
      const label = svgEl(
        'text',
        {
          x: n.x + n.side * (n.r + 8),
          y: n.y + 4.5,
          'text-anchor': n.side > 0 ? 'start' : 'end',
          'font-size': n.depth === 2 ? (phone ? 13.5 : 13) : 12.5,
          class: styles.selLabel,
        },
        g,
      )
      label.textContent = n.label
      if (n.words) svgEl('tspan', { dx: 7, class: styles.words }, label).textContent = n.words
      return { x: n.x, y: n.y }
    },
    [layout, graph, tree, threads, phone],
  )

  const tip = useCallback(
    (id: string) => {
      const node = graph.nodes.get(id)
      if (!node) return null
      const t = degree(graph, id)
      return {
        title: node.icon ? `${node.icon} ${node.title}` : node.title,
        meta:
          node.kind === 'leaf'
            ? [
                `${node.words.toLocaleString('en-US')} words`,
                ...(node.children.length
                  ? [plural(node.children.length, 'sub-leaf', 'sub-leaves')]
                  : []),
                plural(t, 'thread'),
              ].join(' · ')
            : `${compactWords(node.total)} words inside · ${plural(node.children.length, 'item')}`,
      }
    },
    [graph],
  )

  const bounds = useMemo(() => {
    const b = layout.bounds
    // A phone fills its width and starts at the top, scrolled with the thumb.
    return phone ? { ...b, y1: b.y0 + (b.x1 - b.x0) * 1.2 } : b
  }, [layout, phone])

  return (
    <Canvas
      label={`Mind map of ${graph.nodes.get('')!.title}`}
      bounds={bounds}
      insets={insets}
      margin={phone ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
      selected={selected}
      drawSelection={drawSelection}
      tip={tip}
      onSelect={onSelect}
      onOpen={onOpen}
      corner={
        !phone && (
          <div className={ui.chips} style={{ position: 'static' }}>
            <button
              type="button"
              className={ui.chip}
              aria-pressed={threads}
              onClick={() => setThreads((t) => !t)}
            >
              <span className={ui.threadSwatch} />
              Threads of the selection
            </button>
            <button
              type="button"
              className={ui.chip}
              aria-pressed={all}
              onClick={() => setAll((a) => !a)}
            >
              {all ? 'Collapse' : 'Expand all'}
            </button>
          </div>
        )
      }
      legend={
        <>
          <span>
            <span className={controls.glyph} data-kind="leaf" />
            Leaf
          </span>
          <span>
            <span className={controls.glyph} data-kind="sprout" />
            With sub-leaves
          </span>
          <span>
            <span className={controls.glyph} data-kind="branch" />
            Branch
          </span>
          <span>
            <span className={ui.threadSwatch} />
            Thread
          </span>
        </>
      }
    >
      <Geometry layout={layout} graph={graph} tree={tree} phone={phone} />
    </Canvas>
  )
}

/** A thread from the selection: long ones travel above the map, short ones bow aside. */
function threadPath(
  layout: MindLayout,
  a: { x: number; y: number },
  b: { x: number; y: number },
  phone: boolean,
) {
  const f = (v: number) => Math.round(v * 10) / 10
  if (phone) {
    const bend = 118
    return `M${f(a.x)},${f(a.y)} C${bend},${f(a.y + (b.y - a.y) * 0.3)} ${bend},${f(a.y + (b.y - a.y) * 0.7)} ${f(b.x - 1)},${f(b.y)}`
  }
  if (Math.abs(b.x - a.x) > 300) {
    const top = Math.max(layout.bounds.y0 - 40, Math.min(a.y, b.y) - 170)
    const out = Math.sign(b.x - a.x) * 120
    return `M${f(a.x)},${f(a.y)} C${f(a.x + out)},${f(top)} ${f(b.x - out / 3)},${f(top)} ${f(b.x)},${f(b.y)}`
  }
  return `M${f(a.x)},${f(a.y)} Q${f(a.x + 34 * Math.sign(a.x || 1))},${f((a.y + b.y) / 2)} ${f(b.x)},${f(b.y)}`
}

const Geometry = memo(function Geometry({
  layout,
  graph,
  tree,
  phone,
}: {
  layout: MindLayout
  graph: Graph
  tree: TreeRef
  phone: boolean
}) {
  const root = graph.nodes.get('')!
  const groups = new Map<string, MindLayout['nodes']>()
  for (const n of layout.nodes) groups.set(n.tree, [...(groups.get(n.tree) ?? []), n])
  return (
    <g className={styles.map} data-phone={phone || undefined}>
      {layout.spine && <path className={styles.spine} d={layout.spine} />}
      {[...groups].map(([id, nodes]) => (
        <g key={id} data-group="" style={{ '--tree': treeColor(tree, id) } as CSSProperties}>
          {layout.edges
            .filter((e) => e.tree === id)
            .map((e) => (
              <path key={e.id} className={styles.edge} d={e.d} data-depth={Math.min(e.depth, 3)} />
            ))}
          {nodes.map((n) =>
            n.depth === 1 ? (
              <g key={n.id} className={styles.node} data-id={n.id}>
                <rect
                  className={styles.pill}
                  x={n.side > 0 ? n.x : n.x - n.pill}
                  y={n.y - (phone ? 12 : 13)}
                  width={n.pill}
                  height={phone ? 24 : 26}
                  rx={phone ? 12 : 13}
                />
                <text
                  className={styles.pillLabel}
                  x={n.side > 0 ? n.x + n.pill / 2 : n.x - n.pill / 2}
                  y={n.y + 3.8}
                >
                  {n.label}
                </text>
              </g>
            ) : (
              <g key={n.id} className={styles.node} data-id={n.id} data-kind={n.kind}>
                <circle className={styles.hit} cx={n.x} cy={n.y} r={n.r + 8} />
                {n.sprout && <circle className={styles.ring} cx={n.x} cy={n.y} r={n.r + 3.5} />}
                <circle className={styles.dot} cx={n.x} cy={n.y} r={n.r} />
                <text
                  className={styles.label}
                  x={n.x + n.side * (n.r + 8)}
                  y={n.y + 4.5}
                  textAnchor={n.side > 0 ? 'start' : 'end'}
                  fontSize={n.depth === 2 ? (phone ? 13.5 : 13) : 12.5}
                  data-deep={n.depth > 2 || undefined}
                >
                  {n.label}
                  {n.words && (
                    <tspan className={styles.words} dx="7">
                      {n.words}
                    </tspan>
                  )}
                </text>
              </g>
            ),
          )}
        </g>
      ))}
      <g className={styles.core} data-id="">
        <rect
          className={styles.coreBox}
          x={layout.core.x}
          y={layout.core.y}
          width={layout.core.w}
          height={layout.core.h}
          rx={phone ? 14 : 16}
        />
        {phone ? (
          <>
            <text
              className={styles.coreTitle}
              x={layout.core.x + 16}
              y={layout.core.y + 29}
              fontSize={16}
            >
              {root.title}
            </text>
            <text
              className={styles.coreWords}
              x={layout.core.x + layout.core.w - 16}
              y={layout.core.y + 28}
              textAnchor="end"
            >
              {compactWords(root.total)} words · {plural(graph.stats.leaves, 'leaf', 'leaves')}
            </text>
          </>
        ) : (
          <>
            <text className={styles.coreTitle} x={0} y={-3} textAnchor="middle" fontSize={17}>
              {root.title}
            </text>
            <text className={styles.coreWords} x={0} y={17} textAnchor="middle">
              {compactWords(root.total)} words · {plural(graph.stats.leaves, 'leaf', 'leaves')}
            </text>
          </>
        )}
      </g>
    </g>
  )
})
