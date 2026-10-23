// Atlas (design/views/screens/07, 09, 16): each Tree an island, each leaf a peak as high as its
// words (1 word = 1 m), threads as sea routes: dashed over sea, dotted over land (one path,
// split by a mask and a clip made from the coastline). The selected peak has its card.

import { memo, useCallback, useId, useMemo, type CSSProperties } from 'react'
import type { TreeRef } from '../github/graphql'
import type { Graph } from '../model/graph'
import controls from '../ui/controls.module.css'
import { Icon } from '../ui/icons'
import { Canvas, svgEl } from './Canvas'
import { plural, treeColor, type ViewProps } from './common'
import { layoutAtlas, type AtlasLayout } from './layout/atlas'
import styles from './Atlas.module.css'

export default function Atlas({
  tree,
  graph,
  selected,
  phone,
  insets,
  onSelect,
  onOpen,
}: ViewProps) {
  const layout = useMemo(() => layoutAtlas(graph), [graph])
  const ids = useId().replace(/:/g, '')

  const drawSelection = useCallback(
    (layer: SVGGElement, id: string) => {
      const peak = layout.byId.get(id)
      if (!peak) {
        const island = layout.islands.find((i) => i.id === id)
        if (!island) return null
        const g = svgEl('g', { style: `--tree: ${treeColor(tree, id)}` }, layer)
        svgEl('path', { d: island.coast, class: styles.hotCoast }, g)
        return { x: island.name.x, y: island.name.y }
      }
      const g = svgEl('g', { style: `--tree: ${treeColor(tree, peak.island)}` }, layer)
      for (const r of layout.routes)
        if (r.from === id || r.to === id) {
          svgEl('path', { d: r.d, class: styles.hotSea, mask: `url(#${ids}-sea)` }, g)
          svgEl('path', { d: r.d, class: styles.hotLand, 'clip-path': `url(#${ids}-land)` }, g)
        }
      const s = peak.big ? 6 : 4.5
      svgEl(
        'path',
        {
          d: `M${peak.x},${peak.y - s} L${peak.x + s * 0.95},${peak.y + s * 0.7} L${peak.x - s * 0.95},${peak.y + s * 0.7}Z`,
          class: styles.hotPeak,
        },
        g,
      )
      svgEl('circle', { cx: peak.x, cy: peak.y, r: 13, class: styles.halo }, g)
      const label = svgEl(
        'text',
        {
          x: peak.label.x,
          y: peak.label.y,
          'text-anchor': peak.label.anchor,
          'font-size': peak.label.size,
          class: `${styles.peakName} ${styles.hotName}`,
          'data-big': peak.big ? '' : undefined,
        },
        g,
      )
      label.textContent = peak.label.text
      return { x: peak.x, y: peak.y }
    },
    [layout, tree, ids],
  )

  const peak = selected !== null ? layout.byId.get(selected) : undefined
  const node = peak ? graph.nodes.get(peak.id) : undefined
  const island = peak ? graph.nodes.get(peak.island) : undefined
  const ends = node
    ? [...new Set([...(graph.out.get(node.id) ?? []), ...(graph.in.get(node.id) ?? [])])]
    : []
  const root = graph.nodes.get('')!
  const charted = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className={styles.wrap}>
      <Canvas
        label={`Atlas of ${root.title}`}
        bounds={layout.bounds}
        insets={insets}
        margin={phone ? { top: 8, left: 8, right: 8, bottom: 8 } : { top: 16, bottom: 76 }}
        min={0.05}
        selected={selected}
        drawSelection={drawSelection}
        tip={(id) => {
          const p = layout.byId.get(id)
          const n = graph.nodes.get(id)
          return p && n
            ? {
                title: p.label.text,
                meta: `▲ ${n.words.toLocaleString('en-US')}\u00a0m · ${graph.nodes.get(p.island)!.title}`,
              }
            : null
        }}
        onSelect={onSelect}
        onOpen={onOpen}
        controls={!phone}
        chips={
          !phone && (
            <div className={styles.cartouche}>
              <div>
                <span className={controls.eyebrow}>An atlas of the Family</span>
                <strong>{root.title.toUpperCase()}</strong>
                <span className={styles.rule} />
                <em>
                  {plural(layout.islands.length, 'island')}, {plural(layout.peaks.length, 'peak')},{' '}
                  {root.total.toLocaleString('en-US')} words
                </em>
                <span className={controls.mono}>Charted {charted} · 1 word = 1&nbsp;m</span>
              </div>
            </div>
          )
        }
        legend={
          <>
            <span>
              <span className={controls.mono}>0</span>
              <span className={styles.ramp}>
                {Array.from({ length: Math.min(9, layout.levels) }, (_, i) => (
                  <span key={i} style={{ '--tint': `${7 + i * 5.5}%` } as CSSProperties} />
                ))}
              </span>
              <span className={controls.mono}>{Math.round(layout.top / 1000)}k</span>
              Height: words written
            </span>
            <span>
              <svg
                width="12"
                height="11"
                viewBox="0 0 12 11"
                aria-hidden="true"
                className={styles.legendPeak}
              >
                <path d="M6 1l5 9H1z" />
              </svg>
              Peak: a leaf
            </span>
            <span>
              <span className={styles.legendRoute} />
              Sea route: a thread
            </span>
          </>
        }
      >
        <Chart layout={layout} graph={graph} tree={tree} ids={ids} />
      </Canvas>
      {node && peak && island && !phone && (
        <section
          className={`${controls.panel} ${styles.card}`}
          aria-label="Selected peak"
          style={
            {
              right: 16 + (insets.right ?? 0),
              '--tree': treeColor(tree, peak.island),
            } as CSSProperties
          }
        >
          <div className={styles.cardHead}>
            {node.icon && <span aria-hidden="true">{node.icon}</span>}
            <strong>{node.title}</strong>
            <span className={controls.mono}>▲ {node.words.toLocaleString('en-US')}&nbsp;m</span>
          </div>
          <em className={styles.cardNote}>{describe(layout, graph, peak.id)}</em>
          {ends.length > 0 && (
            <div className={styles.routes}>
              <span className={controls.eyebrow}>Routes from here</span>
              {ends.map((id) => {
                const other = layout.byId.get(id)
                const bySea = other ? other.island !== peak.island : false
                return (
                  <button key={id} type="button" onClick={() => onSelect(id)}>
                    <span className={styles.routeSwatch} data-sea={bySea || undefined} />
                    <span>{graph.nodes.get(id)?.title}</span>
                    <span className={controls.mono}>
                      {bySea ? `by sea · ${graph.nodes.get(other!.island)!.title}` : 'on foot'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          <button
            type="button"
            className={`${controls.ghost} ${styles.open}`}
            onClick={() => onOpen(node.id)}
          >
            Open leaf
            <Icon name="arrowRight" size={15} />
          </button>
        </section>
      )}
    </div>
  )
}

/** "Highest peak of Identity, with two foothills: Realms and Tokens." */
function describe(layout: AtlasLayout, graph: Graph, id: string): string {
  const peak = layout.byId.get(id)!
  const island = graph.nodes.get(peak.island)!
  const others = layout.peaks.filter((p) => p.island === peak.island)
  const rank = [...others].sort((a, b) => b.words - a.words).findIndex((p) => p.id === id)
  const where =
    rank === 0
      ? `Highest peak of ${island.title}`
      : `A peak of ${island.title}, ${ordinal(rank + 1)} highest`
  const hills = graph.nodes
    .get(id)!
    .children.map((c) => graph.nodes.get(c)?.title)
    .filter(Boolean) as string[]
  if (!hills.length) return `${where}.`
  const list =
    hills.length === 1 ? hills[0] : `${hills.slice(0, -1).join(', ')} and ${hills.at(-1)}`
  return `${where}, with ${hills.length === 1 ? 'a foothill' : `${words(hills.length)} foothills`}: ${list}.`
}
const ordinal = (n: number) => ['', 'first', 'second', 'third', 'fourth', 'fifth'][n] ?? `${n}th`
const words = (n: number) => ['', 'one', 'two', 'three', 'four', 'five', 'six'][n] ?? String(n)

/** The chart: drawn once per layout. */
const Chart = memo(function Chart({
  layout,
  graph,
  tree,
  ids,
}: {
  layout: AtlasLayout
  graph: Graph
  tree: TreeRef
  ids: string
}) {
  const { frame } = layout
  const coasts = layout.islands.map((i) => i.coast).join('')
  return (
    <g className={styles.chart}>
      <defs>
        <clipPath id={`${ids}-land`}>
          <path d={coasts} clipRule="evenodd" />
        </clipPath>
        <mask
          id={`${ids}-sea`}
          maskUnits="userSpaceOnUse"
          x={frame.x0}
          y={frame.y0}
          width={frame.x1 - frame.x0}
          height={frame.y1 - frame.y0}
        >
          <rect
            x={frame.x0}
            y={frame.y0}
            width={frame.x1 - frame.x0}
            height={frame.y1 - frame.y0}
            fill="white"
          />
          <path d={coasts} fill="black" fillRule="evenodd" />
        </mask>
      </defs>
      <rect
        className={styles.sea}
        x={frame.x0}
        y={frame.y0}
        width={frame.x1 - frame.x0}
        height={frame.y1 - frame.y0}
      />
      {layout.graticule.x.map((x) => (
        <path
          key={`x${x}`}
          className={styles.graticule}
          d={`M${x},${frame.y0 + 4} V${frame.y1 - 4}`}
        />
      ))}
      {layout.graticule.y.map((y) => (
        <path
          key={`y${y}`}
          className={styles.graticule}
          d={`M${frame.x0 + 4},${y} H${frame.x1 - 4}`}
        />
      ))}
      {layout.islands.map((island) => (
        <g
          key={island.id}
          data-group=""
          style={{ '--tree': treeColor(tree, island.id) } as CSSProperties}
        >
          {island.water.map((w, i) => (
            <path key={i} className={styles.water} d={w.d} strokeOpacity={w.opacity} />
          ))}
          {island.bands.map((b, i) => (
            <path
              key={i}
              className={styles.band}
              d={b.d}
              fillRule="evenodd"
              style={{ '--tint': `${b.tint}%` } as CSSProperties}
            />
          ))}
          {island.hachures.map((h, i) => (
            <path key={i} className={styles.hachure} d={h.d} strokeOpacity={h.opacity} />
          ))}
          {island.lines.map((l, i) => (
            <path key={i} className={styles.contour} d={l.d} data-index={l.index || undefined} />
          ))}
          <path className={styles.coast} d={island.coast} />
        </g>
      ))}
      <g mask={`url(#${ids}-sea)`}>
        {layout.routes.map((r) => (
          <path key={`s${r.from}>${r.to}`} className={styles.routeSea} d={r.d} />
        ))}
      </g>
      <g clipPath={`url(#${ids}-land)`}>
        {layout.routes.map((r) => (
          <path key={`l${r.from}>${r.to}`} className={styles.routeLand} d={r.d} />
        ))}
      </g>
      <text
        className={styles.seaName}
        transform={`translate(${frame.x0 + 40} ${(frame.y0 + frame.y1) / 2 + 100}) rotate(-90)`}
      >
        The Unwritten Sea
      </text>
      {layout.islands.map((island) => (
        <g key={island.id} className={styles.islandName} data-id={island.id}>
          <text
            x={island.name.x}
            y={island.name.y}
            fontSize={island.name.size}
            letterSpacing={island.name.size * 0.32}
          >
            {island.name.text}
          </text>
          <text className={styles.islandSub} x={island.name.x} y={island.name.y + 15}>
            {island.name.sub}
          </text>
        </g>
      ))}
      {layout.peaks.map((p) => {
        const s = p.big ? 6 : 4.5
        return (
          <g key={p.id} className={styles.peak} data-id={p.id}>
            <circle className={styles.hit} cx={p.x} cy={p.y} r={12} />
            <path
              className={styles.mark}
              d={`M${p.x},${p.y - s} L${p.x + s * 0.95},${p.y + s * 0.7} L${p.x - s * 0.95},${p.y + s * 0.7}Z`}
            />
            <text
              className={styles.peakName}
              x={p.label.x}
              y={p.label.y}
              textAnchor={p.label.anchor}
              fontSize={p.label.size}
              data-big={p.big || undefined}
            >
              {p.label.text}
            </text>
            <text
              className={styles.height}
              x={p.label.x}
              y={p.label.y + 11}
              textAnchor={p.label.anchor}
            >
              {graph.nodes.get(p.id)!.words.toLocaleString('en-US')}
            </text>
          </g>
        )
      })}
      <Rose x={layout.rose.x} y={layout.rose.y} />
      <rect
        className={styles.neat}
        x={frame.x0}
        y={frame.y0}
        width={frame.x1 - frame.x0}
        height={frame.y1 - frame.y0}
      />
      <rect
        className={styles.neatInner}
        x={frame.x0 + 4}
        y={frame.y0 + 4}
        width={frame.x1 - frame.x0 - 8}
        height={frame.y1 - frame.y0 - 8}
      />
      {layout.graticule.x.map((x, i) => (
        <g key={`t${x}`}>
          <path
            className={styles.neat}
            d={`M${x},${frame.y0} V${frame.y0 + 4} M${x},${frame.y1 - 4} V${frame.y1}`}
          />
          <text className={styles.degree} x={x + 4} y={frame.y0 + 14}>
            {i * 10}°
          </text>
        </g>
      ))}
    </g>
  )
})

/** The compass rose: eight points, north in the Family's colour. */
function Rose({ x, y }: { x: number; y: number }) {
  const points = Array.from({ length: 8 }, (_, k) => {
    const a = (k * Math.PI) / 4
    const long = k % 2 === 0
    const r = long ? 44 : 26
    const w = long ? 6 : 4
    const tip = [Math.sin(a) * r, -Math.cos(a) * r]
    const l = [Math.sin(a - Math.PI / 2) * w, -Math.cos(a - Math.PI / 2) * w]
    const rr = [Math.sin(a + Math.PI / 2) * w, -Math.cos(a + Math.PI / 2) * w]
    const p = (v: number[]) => `${Math.round(v[0]! * 10) / 10},${Math.round(v[1]! * 10) / 10}`
    return { k, long, dark: `M0,0 L${p(l)} L${p(tip)}Z`, light: `M0,0 L${p(rr)} L${p(tip)}Z` }
  })
  return (
    <g className={styles.rose} transform={`translate(${x} ${y})`} aria-hidden="true">
      <circle r={34} className={styles.roseRing} />
      <circle r={28} className={styles.roseRingInner} />
      {points.map((p) => (
        <g key={p.k}>
          <path d={p.dark} className={styles.roseDark} data-long={p.long || undefined} />
          <path d={p.light} className={styles.roseLight} />
        </g>
      ))}
      <text y={-50} className={styles.north}>
        N
      </text>
      <circle r={2.5} className={styles.roseDot} />
    </g>
  )
}
