// Growth rings (design/views/screens/06, 08, 15): the Family cut across like a trunk, one ring
// per month since the first leaf, each leaf in the ring it was planted in. The panel
// holds the core sample (the rings as a timeline), "Show the Family as it was in…", the
// selected leaf and each Tree month by month. Planted dates come from git (blame), once.

import { memo, useCallback, useEffect, useId, useMemo, useState, type CSSProperties } from 'react'
import type { TreeRef } from '../github/graphql'
import { compactWords, type Graph } from '../model/graph'
import controls from '../ui/controls.module.css'
import { Glyph } from '../ui/Glyph'
import { Icon } from '../ui/icons'
import { Canvas, lift, svgEl } from './Canvas'
import { plantedIn, topOf, treeColor, type ViewProps } from './common'
import { layoutRings, type RingsLayout } from './layout/rings'
import { ThreadCurve } from './parts'
import styles from './Rings.module.css'

/** A phone fits the disc and its Tree names alone; the callouts are left out. */
const PHONE_BOX = { x0: -385, y0: -385, x1: 385, y1: 385 }

export default function Rings(props: ViewProps) {
  const { tree, graph } = props
  const [planted, setPlanted] = useState<{ graph: Graph; map: Map<string, string> } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    plantedIn(tree.repo).then(
      (map) => live && setPlanted({ graph, map }),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      live = false
    }
  }, [tree.repo, graph])
  if (!planted)
    return (
      <p className={styles.waiting} aria-busy={!error}>
        {error ?? 'Reading when each leaf was planted…'}
      </p>
    )
  return <RingsView {...props} planted={planted.map} />
}

function RingsView({
  tree,
  graph,
  selected,
  phone,
  onSelect,
  onOpen,
  planted,
}: ViewProps & { planted: Map<string, string> }) {
  const [now] = useState(() => new Date())
  const [asOf, setAsOf] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const full = useMemo(() => layoutRings(graph, planted, now), [graph, planted, now])
  const layout = useMemo(
    () => (asOf === null ? full : layoutRings(graph, planted, now, asOf)),
    [full, graph, planted, now, asOf],
  )
  const lastMonth = full.months.length - 1

  // Play: grow the rings a month at a time, from the first.
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setAsOf((m) => {
        const next = (m ?? -1) + 1
        if (next >= lastMonth) {
          setPlaying(false)
          return null
        }
        return next
      })
    }, 650)
    return () => window.clearInterval(timer)
  }, [playing, lastMonth])

  const drawSelection = useCallback(
    (layer: SVGGElement, id: string) => {
      const dot = layout.byId.get(id)
      if (!dot) return null
      const g = svgEl('g', { style: `--tree: ${treeColor(tree, dot.tree)}` }, layer)
      const ends: string[] = []
      for (const t of layout.threads)
        if (t.from === id || t.to === id) {
          svgEl('path', { d: t.d, class: styles.hotThread }, g)
          ends.push(t.from === id ? t.to : t.from)
        }
      lift(layer, ends)
      lift(layer, [id], () => 'data-sel')
      svgEl('circle', { cx: dot.x, cy: dot.y, r: dot.r + 7, class: styles.halo }, layer)
      return { x: dot.x, y: dot.y }
    },
    [layout, tree],
  )

  const node = selected !== null ? graph.nodes.get(selected) : undefined
  const panel = (
    <Panel
      tree={tree}
      graph={graph}
      layout={layout}
      full={full}
      asOf={asOf ?? lastMonth}
      playing={playing}
      phone={phone}
      selected={node?.kind === 'leaf' ? node.id : null}
      onAsOf={(m) => setAsOf(m === lastMonth ? null : m)}
      onPlay={() => {
        setAsOf(0)
        setPlaying(true)
      }}
      onSelect={onSelect}
      onOpen={onOpen}
    />
  )

  return (
    <div className={styles.wrap} data-phone={phone || undefined}>
      <div className={styles.disc}>
        <Canvas
          label={`Growth rings of ${graph.nodes.get('')!.title}`}
          bounds={phone ? PHONE_BOX : layout.bounds}
          insets={{}}
          margin={phone ? { top: 8, bottom: 8, left: 8, right: 8 } : { top: 24, bottom: 72 }}
          selected={selected}
          drawSelection={drawSelection}
          tip={(id) => {
            const d = layout.byId.get(id)
            const n = graph.nodes.get(id)
            return d && n
              ? {
                  title: n.icon ? `${n.icon} ${n.title}` : n.title,
                  meta: `Planted ${layout.months[d.month]!.long} · ${n.words.toLocaleString('en-US')} words`,
                }
              : null
          }}
          onSelect={onSelect}
          onOpen={onOpen}
          controls={!phone}
        >
          <Wood layout={layout} graph={graph} tree={tree} phone={phone} />
        </Canvas>
      </div>
      {!phone && panel}
      {phone && <div className={styles.sheet}>{panel}</div>}
    </div>
  )
}

/** The disc. Drawn once per layout (a month chosen, or the Family changing). */
const Wood = memo(function Wood({
  layout,
  graph,
  tree,
  phone,
}: {
  layout: RingsLayout
  graph: Graph
  tree: TreeRef
  phone: boolean
}) {
  const id = useId().replace(/:/g, '')
  return (
    <g className={styles.wood} data-phone={phone || undefined}>
      <defs>
        {layout.sectors.map((s) => (
          <path key={s.id} id={`${id}-${CSS.escape(s.id)}`} d={s.arc} />
        ))}
      </defs>
      <path className={styles.bark} d={layout.bark.d} fillRule="evenodd" />
      {layout.bark.fissures.map((x, i) => (
        <path key={i} className={styles.fissure} d={x.d} strokeWidth={x.w} />
      ))}
      {layout.bands.map((b, i) => (
        <path
          key={i}
          d={b.d}
          fillRule="evenodd"
          className={styles.band}
          style={{ '--tint': `${b.tint}%` } as CSSProperties}
        />
      ))}
      {layout.latewood.map((l, i) => (
        <path key={i} className={styles.latewood} d={l.d} strokeWidth={l.width} />
      ))}
      {layout.grain.map((d, i) => (
        <path key={i} className={styles.grain} d={d} />
      ))}
      {layout.lines.map((l, i) => (
        <path key={i} className={styles.line} d={l.d} data-outer={l.outer || undefined} />
      ))}
      <circle className={styles.pith} r={15} />
      <circle className={styles.pithDot} r={3} />
      {layout.rays.map((d, i) => (
        <path key={i} className={styles.ray} d={d} />
      ))}
      {layout.sectors.map((s) => (
        <g key={s.id}>
          <path className={styles.sectorGap} d={s.ray} />
          <path className={styles.sectorRay} d={s.ray} />
        </g>
      ))}
      <path className={styles.borerGap} d={layout.borer} />
      <path className={styles.borer} d={layout.borer} />
      <path className={styles.cambium} d={layout.cambium.outer} />
      {layout.cambium.previous && (
        <path className={styles.cambiumPrev} d={layout.cambium.previous} />
      )}
      {layout.knots.map((d, i) => (
        <path key={i} className={styles.knot} d={d} />
      ))}
      {layout.threads.map((t) => (
        <path key={`${t.from}>${t.to}`} className={styles.thread} d={t.d} />
      ))}
      {layout.dots.map((d) => (
        <g
          key={d.id}
          className={styles.node}
          data-id={d.id}
          data-group=""
          style={{ '--tree': treeColor(tree, d.tree) } as CSSProperties}
        >
          <circle className={styles.hit} cx={d.x} cy={d.y} r={d.r + 6} />
          {d.sprout && <circle className={styles.ring} cx={d.x} cy={d.y} r={d.r + 3.2} />}
          <circle className={styles.dot} cx={d.x} cy={d.y} r={d.r} />
          {d.fresh && <circle className={styles.fresh} cx={d.x} cy={d.y} r={d.r + 3} />}
          <text
            className={styles.label}
            x={d.label.x}
            y={d.label.y}
            textAnchor={d.label.anchor}
            fontSize={d.label.size}
            data-deep={d.deep || undefined}
          >
            {d.label.text}
          </text>
        </g>
      ))}
      {layout.sectors.map((s) => (
        <g key={s.id} style={{ '--tree': treeColor(tree, s.id) } as CSSProperties}>
          <path className={styles.tick} d={s.tick} />
          <text className={styles.sectorLabel}>
            <textPath href={`#${id}-${CSS.escape(s.id)}`} startOffset="50%" textAnchor="middle">
              {graph.nodes.get(s.id)!.title.toUpperCase()}
            </textPath>
          </text>
        </g>
      ))}
      {layout.callouts.map((c) => (
        <g key={c.title} className={styles.callout}>
          <circle cx={c.x} cy={c.y} r={2.6} />
          <path d={c.path} />
          <text x={c.lx} y={c.ly} textAnchor={c.anchor}>
            {c.title}
          </text>
          <text className={styles.calloutSub} x={c.lx} y={c.ly + 16} textAnchor={c.anchor}>
            {c.sub}
          </text>
        </g>
      ))}
      {layout.quiet && (
        <text className={styles.quiet} x={layout.quiet.x} y={layout.quiet.y} textAnchor="middle">
          <tspan x={layout.quiet.x}>{layout.quiet.lines[0]}</tspan>
          <tspan x={layout.quiet.x} dy={17}>
            {layout.quiet.lines[1]}
          </tspan>
        </text>
      )}
    </g>
  )
})

function Panel({
  tree,
  graph,
  layout,
  full,
  asOf,
  playing,
  phone,
  selected,
  onAsOf,
  onPlay,
  onSelect,
  onOpen,
}: {
  tree: TreeRef
  graph: Graph
  layout: RingsLayout
  full: RingsLayout
  asOf: number
  playing: boolean
  phone: boolean
  selected: string | null
  onAsOf(month: number): void
  onPlay(): void
  onSelect(id: string): void
  onOpen(id: string): void
}) {
  const months = full.months
  const title = graph.nodes.get('')!.title
  const span =
    months.length >= 11 && months.length <= 13
      ? 'A year'
      : `${months.length} month${months.length === 1 ? '' : 's'}`
  const leaf = selected ? graph.nodes.get(selected) : undefined
  const dot = selected ? full.byId.get(selected) : undefined
  const ends = leaf
    ? [...new Set([...(graph.out.get(leaf.id) ?? []), ...(graph.in.get(leaf.id) ?? [])])]
    : []
  const trees = full.sectors.map((s) => graph.nodes.get(s.id)!)
  const perTree = trees.map((t) =>
    months.map((m) =>
      m.planted
        .filter((id) => topOf(graph, id) === t.id)
        .reduce((s, id) => s + graph.nodes.get(id)!.words, 0),
    ),
  )
  const peak = Math.max(1, ...perTree.flat())

  return (
    <aside className={styles.panel} aria-label="Growth rings">
      {/* On a phone only its heading stays, for screen readers: the sheet is short. */}
      {
        <div className={phone ? controls.visuallyHidden : styles.intro}>
          <span className={`${controls.eyebrow} ${styles.accent}`}>Growth rings</span>
          <h2>
            {span} of {title}
          </h2>
          <p>
            One ring for every month since your first leaf. Wide rings are months you planted a lot;
            every leaf sits in the ring it was planted in.
          </p>
        </div>
      }
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h3 className={controls.eyebrow}>Core sample</h3>
          <span className={controls.mono}>
            {phone
              ? `busiest: ${months[full.busiest]!.long.split(' ')[0]} · ${compactWords(months[full.busiest]!.words)}`
              : `${months[0]!.short.replace(' ', ' 20')} → today`}
          </span>
        </div>
        <CoreSample layout={full} asOf={asOf} onPick={onAsOf} />
        <div className={styles.picker}>
          <label>
            <span>{phone ? 'As it was in' : 'Show the Family as it was in'}</span>
            <span className={styles.select}>
              <select
                value={asOf}
                onChange={(e) => onAsOf(Number(e.target.value))}
                disabled={playing}
              >
                {months.map((m, i) => (
                  <option key={m.long} value={i}>
                    {phone ? m.long : m.short.replace(' ', ' 20')}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={13} />
            </span>
          </label>
          <button
            type="button"
            className={styles.play}
            aria-label="Grow the rings, month by month"
            disabled={playing || months.length < 2}
            onClick={onPlay}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 1.5v9l7.5-4.5z" />
            </svg>
          </button>
        </div>
      </section>

      {leaf && dot && (
        <section
          className={styles.card}
          aria-label="Selected leaf"
          style={{ '--tree': treeColor(tree, dot.tree) } as CSSProperties}
        >
          <div className={styles.cardHead}>
            {leaf.icon && <span aria-hidden="true">{leaf.icon}</span>}
            <strong>{leaf.title}</strong>
            <span className={controls.mono}>{graph.nodes.get(dot.tree)!.title}</span>
          </div>
          <div className={styles.chips}>
            <span className={`${controls.mono} ${styles.planted}`}>
              Planted {months[dot.month]!.long}
            </span>
            <span className={`${controls.mono} ${styles.chip}`}>
              {leaf.words.toLocaleString('en-US')} words
            </span>
          </div>
          {leaf.children.length > 0 && (
            <span className={styles.note}>
              {subLeaves(
                leaf.children.map((c) => full.monthOf.get(c) ?? dot.month),
                dot.month,
              )}
            </span>
          )}
          {ends.length > 0 && (
            <div className={styles.threads}>
              {ends.map((id) => {
                const m = full.monthOf.get(id)
                return (
                  <button key={id} type="button" onClick={() => onSelect(id)}>
                    <ThreadCurve dashed />
                    <span>{graph.nodes.get(id)?.title}</span>
                    <span className={controls.mono}>
                      {m === undefined ? '' : `ring of ${months[m]!.short}`}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          <button
            type="button"
            className={`${controls.ghost} ${styles.open}`}
            onClick={() => onOpen(leaf.id)}
          >
            Open leaf
            <Icon name="arrowRight" size={15} />
          </button>
        </section>
      )}

      {!phone && (
        <section className={styles.section}>
          <h3 className={controls.eyebrow}>Each Tree, month by month</h3>
          {trees.map((t, i) => (
            <div
              key={t.id}
              className={styles.heatRow}
              style={{ '--tree': treeColor(tree, t.id) } as CSSProperties}
            >
              <span className={styles.heatName}>{t.title}</span>
              <span className={styles.cells}>
                {perTree[i]!.map((v, m) => (
                  <span
                    key={m}
                    title={`${months[m]!.long}: ${v.toLocaleString('en-US')} words planted`}
                    style={{ '--heat': `${Math.min(100, 6 + (v / peak) * 94)}%` } as CSSProperties}
                  />
                ))}
              </span>
              <span className={controls.mono}>{compactWords(t.total)}</span>
            </div>
          ))}
        </section>
      )}

      {!phone && (
        <div className={styles.legend}>
          <span>
            <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
              <path d="M1 11C1 5 5 1 17 1M1 11C1 8 4 5 17 5" />
            </svg>
            Ring: a month
          </span>
          <span>
            <Glyph node={{ kind: 'leaf', children: [] }} />
            Leaf, sized by words
          </span>
          <span>
            <span className={styles.raySwatch} />
            Ray: between Trees
          </span>
          <span>
            <span className={styles.threadSwatch} />
            Thread
          </span>
        </div>
      )}
      {layout !== full && (
        <span className={controls.visuallyHidden} role="status">
          As it was in {months[asOf]!.long}
        </span>
      )}
    </aside>
  )
}

/** The rings laid out as a timeline, oldest on the left; a month is a button. */
function CoreSample({
  layout,
  asOf,
  onPick,
}: {
  layout: RingsLayout
  asOf: number
  onPick(m: number): void
}) {
  const W = 316
  const total = layout.edges.at(-1)! - layout.edges[0]!
  const clip = useId().replace(/:/g, '')
  const at = (edge: number) => ((layout.edges[edge]! - layout.edges[0]!) / total) * W
  const segments = layout.months.map((m, i) => ({
    x: at(i),
    w: at(i + 1) - at(i),
    m,
    i,
    tint: layout.bands[i]!.tint,
  }))
  return (
    <svg
      className={styles.core}
      viewBox={`-6 -6 ${W + 20} 60`}
      aria-label="Core sample, one band per month"
    >
      <defs>
        <clipPath id={clip}>
          <rect width={W} height={34} rx={17} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        {segments.map((s) => (
          <g
            key={s.i}
            className={styles.segment}
            data-later={s.i > asOf || undefined}
            onClick={() => onPick(s.i)}
          >
            <title>{s.m.long}</title>
            <rect
              className={styles.segBand}
              x={s.x}
              width={s.w}
              height={34}
              style={{ '--tint': `${s.tint}%` } as CSSProperties}
            />
            <rect className={styles.segLate} x={s.x + s.w * 0.74} width={s.w * 0.26} height={34} />
            {s.i > 0 && <path className={styles.segEdge} d={`M${s.x},0 V34`} />}
          </g>
        ))}
        {segments[layout.busiest] && (
          <rect
            className={styles.busiest}
            x={segments[layout.busiest]!.x + 0.5}
            y={0.5}
            width={Math.max(0, segments[layout.busiest]!.w - 1)}
            height={33}
          />
        )}
      </g>
      <rect className={styles.coreFrame} width={W} height={34} rx={17} />
      <circle
        className={styles.borerMark}
        cx={(segments[asOf]?.x ?? 0) + (segments[asOf]?.w ?? 0) - 12}
        cy={17}
        r={10}
      />
      <circle
        className={styles.borerDot}
        cx={(segments[asOf]?.x ?? 0) + (segments[asOf]?.w ?? 0) - 12}
        cy={17}
        r={3}
      />
      {segments.map((s) => (
        <text
          key={s.i}
          className={styles.initial}
          data-hot={s.i === layout.busiest || undefined}
          x={s.x + s.w / 2}
          y={52}
        >
          {s.w > 9 ? s.m.initial : ''}
        </text>
      ))}
    </svg>
  )
}

/** Where a leaf's sub-leaves grew, against the ring the leaf was planted in. */
function subLeaves(months: number[], own: number): string {
  const its = months.length === 1 ? 'Its sub-leaf' : `Its ${months.length} sub-leaves`
  if (months.every((m) => m > own)) return `${its} sprouted in the rings after.`
  if (months.every((m) => m === own)) return `${its} sprouted in the same ring.`
  if (months.every((m) => m < own)) return `${its} were planted before it.`
  return `${its} grew in the rings around it.`
}
