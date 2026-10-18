// Graph (design/views/screens/05, 14): the leaves as a network of threads, each Tree a soft
// dashed hull, dot size = words. The selected leaf has its own card: its threads and
// "Open leaf". Layers (threads, sub-leaves, hulls) are classes on the canvas.

import { memo, useCallback, useMemo, useState, type CSSProperties } from 'react'
import type { TreeRef } from '../github/graphql'
import { neighbours, type Graph as Model } from '../model/graph'
import ui from '../map/TreeMap.module.css'
import controls from '../ui/controls.module.css'
import { Icon } from '../ui/icons'
import { Canvas, lift, svgEl, veil } from './Canvas'
import { degree, plural, topOf, treeColor, type ViewProps } from './common'
import { layoutGraph, type GraphLayout } from './layout/graph'
import { ThreadCurve } from './parts'
import styles from './Graph.module.css'

type Layer = 'threads' | 'struct' | 'hulls'

export default function Graph({
  tree,
  graph,
  selected,
  phone,
  insets,
  onSelect,
  onOpen,
}: ViewProps) {
  const layout = useMemo(() => layoutGraph(graph), [graph])
  const [hidden, setHidden] = useState<ReadonlySet<Layer>>(new Set())
  const toggle = (layer: Layer) =>
    setHidden((h) => {
      const next = new Set(h)
      if (next.has(layer)) next.delete(layer)
      else next.add(layer)
      return next
    })

  const drawSelection = useCallback(
    (layer: SVGGElement, id: string) => {
      const dot = layout.byId.get(id)
      const hull = layout.hulls.find((h) => h.id === id || h.id === topOf(graph, id))
      if (!dot && !hull) return null
      veil(layer)
      const near = dot ? neighbours(graph, id) : new Set(hull!.members)
      const g = svgEl('g', { style: `--tree: ${treeColor(tree, hull?.id ?? null)}` }, layer)
      if (hull) svgEl('path', { d: hull.d, class: styles.hotHull }, g)
      if (dot) {
        for (const s of layout.struct)
          if (s.from === id || s.to === id) {
            const a = layout.byId.get(s.from)!
            const b = layout.byId.get(s.to)!
            svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: styles.hotStruct }, g)
          }
        for (const t of layout.threads)
          if (t.from === id || t.to === id) svgEl('path', { d: t.d, class: styles.hotThread }, g)
      }
      lift(
        layer,
        [...near].filter((n) => layout.byId.has(n) && n !== id),
      )
      if (dot) {
        lift(layer, [id], () => 'data-sel')
        svgEl('circle', { cx: dot.x, cy: dot.y, r: dot.r + 8, class: styles.halo }, g)
        return { x: dot.x, y: dot.y }
      }
      const members = hull!.members.map((m) => layout.byId.get(m)!)
      return {
        x: members.reduce((s, m) => s + m.x, 0) / members.length,
        y: members.reduce((s, m) => s + m.y, 0) / members.length,
      }
    },
    [layout, graph, tree],
  )

  const tip = useCallback(
    (id: string) => {
      const n = graph.nodes.get(id)
      if (!n || n.kind !== 'leaf') return null
      return {
        title: n.icon ? `${n.icon} ${n.title}` : n.title,
        meta: `${n.words.toLocaleString('en-US')} words · ${plural(degree(graph, id), 'thread')}`,
      }
    },
    [graph],
  )

  const node = selected !== null ? graph.nodes.get(selected) : undefined
  const ends = node
    ? [...new Set([...(graph.out.get(node.id) ?? []), ...(graph.in.get(node.id) ?? [])])]
    : []

  return (
    <Canvas
      label="Graph of leaves and threads"
      bounds={layout.bounds}
      insets={insets}
      margin={node && !phone ? { right: 16 + 290 } : undefined}
      min={0.05}
      selected={selected}
      drawSelection={drawSelection}
      tip={tip}
      onSelect={onSelect}
      onOpen={onOpen}
      className={[...hidden].map((l) => styles[`hide-${l}`]).join(' ')}
      chips={
        !phone && (
          <>
            <button
              type="button"
              className={ui.chip}
              aria-pressed={!hidden.has('threads')}
              onClick={() => toggle('threads')}
            >
              <span className={ui.threadSwatch} />
              Threads
            </button>
            <button
              type="button"
              className={ui.chip}
              aria-pressed={!hidden.has('struct')}
              onClick={() => toggle('struct')}
            >
              <span className={styles.structSwatch} />
              Sub-leaves
            </button>
            <button
              type="button"
              className={ui.chip}
              aria-pressed={!hidden.has('hulls')}
              onClick={() => toggle('hulls')}
            >
              <span className={styles.hullSwatch} />
              Trees
            </button>
          </>
        )
      }
      corner={
        node &&
        !phone && (
          <section
            className={`${controls.panel} ${styles.card}`}
            aria-label="Selected leaf"
            style={{ '--tree': treeColor(tree, topOf(graph, node.id)) } as CSSProperties}
          >
            <span className={`${controls.eyebrow} ${styles.cardKind}`}>
              Selected {node.kind === 'leaf' ? 'leaf' : node.parent === '' ? 'tree' : node.kind}
            </span>
            <div className={styles.cardTitle}>
              {node.icon && <span aria-hidden="true">{node.icon}</span>}
              <strong>{node.title}</strong>
            </div>
            <span className={`${controls.mono} ${styles.cardMeta}`}>
              {node.parent === ''
                ? `${node.total.toLocaleString('en-US')} words`
                : `${graph.nodes.get(topOf(graph, node.id)!)!.title} · ${(node.kind === 'leaf' ? node.words : node.total).toLocaleString('en-US')} words`}
            </span>
            {ends.length > 0 && (
              <div className={styles.cardThreads}>
                <span className={controls.eyebrow}>Threads · {ends.length}</span>
                {ends.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={styles.cardThread}
                    onClick={() => onSelect(id)}
                  >
                    <ThreadCurve />
                    <span>{graph.nodes.get(id)?.title}</span>
                    <span className={controls.mono}>
                      {graph.nodes.get(topOf(graph, id) ?? '')?.title}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              className={`${controls.ghost} ${styles.open}`}
              onClick={() => onOpen(node.id)}
            >
              Open {node.kind === 'leaf' ? 'leaf' : 'page'}
              <Icon name="arrowRight" size={15} />
            </button>
          </section>
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
            <span className={ui.threadSwatch} />
            Thread
          </span>
          <span>
            <span className={styles.hullSwatch} />
            Tree
          </span>
          <span>Size = words</span>
        </>
      }
    >
      <Geometry layout={layout} graph={graph} tree={tree} />
    </Canvas>
  )
}

const Geometry = memo(function Geometry({
  layout,
  graph,
  tree,
}: {
  layout: GraphLayout
  graph: Model
  tree: TreeRef
}) {
  return (
    <g>
      <g className={styles.hulls}>
        {layout.hulls.map((h) => (
          <g key={h.id} data-group="" style={{ '--tree': treeColor(tree, h.id) } as CSSProperties}>
            <path className={styles.hull} d={h.d} />
            <text className={styles.hullLabel} x={h.label.x} y={h.label.y} data-id={h.id}>
              {graph.nodes.get(h.id)!.title.toUpperCase()}
            </text>
          </g>
        ))}
      </g>
      <g className={styles.struct}>
        {layout.struct.map((s) => {
          const a = layout.byId.get(s.from)!
          const b = layout.byId.get(s.to)!
          return (
            <line key={s.from} className={styles.structLine} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          )
        })}
      </g>
      <g className={styles.threads}>
        {layout.threads.map((t) => (
          <path
            key={`${t.from}>${t.to}`}
            className={styles.thread}
            d={t.d}
            style={{ '--tree': treeColor(tree, layout.byId.get(t.from)!.tree) } as CSSProperties}
          />
        ))}
      </g>
      {layout.hulls.map((h) => (
        <g key={h.id} data-group="" style={{ '--tree': treeColor(tree, h.id) } as CSSProperties}>
          {h.members.map((id) => {
            const d = layout.byId.get(id)!
            return (
              <g key={id} className={styles.node} data-id={id}>
                <circle className={styles.hit} cx={d.x} cy={d.y} r={d.r + 6} />
                {d.sprout && <circle className={styles.ring} cx={d.x} cy={d.y} r={d.r + 3.5} />}
                <circle className={styles.dot} cx={d.x} cy={d.y} r={d.r} />
                <text className={styles.label} x={d.lx} y={d.ly} textAnchor={d.anchor}>
                  {d.label}
                </text>
              </g>
            )
          })}
        </g>
      ))}
    </g>
  )
})
