// Growth rings layout (design/views/generators/rings.py). Pure and deterministic. The Family cut
// across like a trunk: one ring per month since the first leaf (oldest at the centre),
// each ring 9 px plus the words of the leaves planted that month (the owner's choice:
// planted month from git, not words written per month). Ring edges wobble with a shared
// low-frequency shape and a little noise per ring. Trees are sectors sized by their
// leaves, separated by rays; each leaf sits mid-ring at the month it was planted.

import { treesOf } from '../../map/family'
import type { Box } from '../../map/layout'
import { textWidth } from '../../map/layout'
import type { Graph, GraphNode } from '../../model/graph'

export const PITH = 15
export const R = 322
const BARK = 17
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export interface Month {
  /** `Sep 26`, `September 2026`, `S` */
  short: string
  long: string
  initial: string
  words: number
  planted: string[]
}

export interface RingDot {
  id: string
  x: number
  y: number
  r: number
  month: number
  tree: string
  sprout: boolean
  fresh: boolean
  label: { x: number; y: number; anchor: 'start' | 'end' | 'middle'; size: number; text: string }
  deep: boolean
}

export interface RingsLayout {
  months: Month[]
  /** The ring each leaf was planted in. */
  monthOf: Map<string, number>
  busiest: number
  /** Ring boundaries (radii before the wobble), PITH first. */
  edges: number[]
  bands: { d: string; tint: number }[]
  latewood: { d: string; width: number }[]
  grain: string[]
  lines: { d: string; outer: boolean }[]
  rays: string[]
  sectors: { id: string; a0: number; a1: number; ray: string; arc: string; tick: string }[]
  bark: { d: string; fissures: { d: string; w: number }[] }
  cambium: { outer: string; previous: string | null }
  borer: string
  dots: RingDot[]
  byId: Map<string, RingDot>
  threads: { from: string; to: string; d: string }[]
  knots: string[]
  callouts: {
    x: number
    y: number
    path: string
    lx: number
    ly: number
    anchor: 'start' | 'end'
    title: string
    sub: string
  }[]
  quiet: { x: number; y: number; lines: [string, string] } | null
  bounds: Box
}

/** Months since year 0: a month's index for arithmetic. */
const monthIndex = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth()

/** A small seeded random number generator (mulberry32). */
function seeded(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const f = (v: number) => Math.round(v * 10) / 10

export function layoutRings(
  graph: Graph,
  planted: ReadonlyMap<string, string>,
  now: Date,
  /** Show the Family as it was at the end of this ring (an index into the months). */
  asOf?: number,
): RingsLayout {
  const leaves = [...graph.nodes.values()].filter((n) => n.kind === 'leaf')
  const nowIndex = monthIndex(now)
  const dateOf = (id: string) => {
    const d = planted.get(id)
    return d ? new Date(d) : now
  }
  const first = Math.min(nowIndex, ...leaves.map((l) => monthIndex(dateOf(l.id))))
  const allMonths = nowIndex - first + 1
  const last = Math.min(allMonths - 1, asOf ?? allMonths - 1)
  const count = last + 1
  const monthOf = new Map<string, number>()
  for (const l of leaves) monthOf.set(l.id, monthIndex(dateOf(l.id)) - first)
  const shown = leaves.filter((l) => monthOf.get(l.id)! <= last)

  const months: Month[] = Array.from({ length: count }, (_, m) => {
    const i = first + m
    const month = i % 12
    const year = Math.floor(i / 12)
    const planted = shown.filter((l) => monthOf.get(l.id) === m)
    return {
      short: `${SHORT[month]} ${String(year).slice(2)}`,
      long: `${LONG[month]} ${year}`,
      initial: SHORT[month]![0]!,
      words: planted.reduce((s, l) => s + l.words, 0),
      planted: planted.map((l) => l.id),
    }
  })
  const busiest = months.reduce((b, m, i) => (m.words > months[b]!.words ? i : b), 0)

  // Ring boundaries.
  const total = months.reduce((s, m) => s + m.words, 0)
  const minW = Math.min(9, ((R - PITH) * 0.45) / count)
  const k = total ? (R - PITH - minW * count) / total : 0
  const edges = [PITH]
  for (const m of months)
    edges.push(edges.at(-1)! + minW + (total ? m.words * k : (R - PITH - minW * count) / count))

  const rnd = seeded(11)
  const SHAPE: [number, number, number][] = [
    [2, 0.022, 0.7],
    [3, 0.016, 2.1],
    [5, 0.007, 4.0],
  ]
  const noise = edges.map(() =>
    [6, 9, 13].map((h) => [h, 0.35 + rnd() * 0.75, rnd() * 6.28] as [number, number, number]),
  )
  const radius = (i: number, th: number) => {
    const r = edges[i]!
    const shape =
      1 + SHAPE.reduce((s, [h, a, p]) => s + a * Math.sin(h * th + p), 0) * Math.min(1, r / 120)
    return (
      r * shape +
      noise[i]!.reduce((s, [h, a, p]) => s + a * Math.sin(h * th + p), 0) * Math.min(1, r / 80)
    )
  }
  const at = (rr: number, th: number): [number, number] => [rr * Math.cos(th), rr * Math.sin(th)]
  const loop = (fn: (th: number) => number, steps = 240) => {
    const pts: string[] = []
    for (let s = 0; s < steps; s++) {
      const th = (2 * Math.PI * s) / steps
      const [x, y] = at(fn(th), th)
      pts.push(`${f(x)},${f(y)}`)
    }
    return `M${pts.join(' L')}Z`
  }
  const mid = (m: number, th: number) => (radius(m, th) + radius(m + 1, th)) / 2

  // Wood: bands tinted from plain heartwood to the accent's sapwood.
  const bands: RingsLayout['bands'] = []
  const latewood: RingsLayout['latewood'] = []
  const grain: string[] = []
  for (let m = 0; m < count; m++) {
    bands.push({
      d: `${loop((th) => radius(m + 1, th))} ${loop((th) => radius(m, th))}`,
      tint: Math.round(3 + 19 * (count > 1 ? m / (count - 1) : 1) ** 1.4),
    })
    const w = edges[m + 1]! - edges[m]!
    latewood.push({ d: loop((th) => radius(m + 1, th) - w * 0.13), width: f(w * 0.26) })
    if (w > 6)
      for (const g of [0.38, 0.62])
        grain.push(loop((th) => radius(m, th) + (radius(m + 1, th) - radius(m, th)) * g))
  }
  const lines = Array.from({ length: count }, (_, i) => ({
    d: loop((th) => radius(i + 1, th)),
    outer: i === count - 1,
  }))
  const outerAt = (th: number) => radius(count, th)

  const rays: string[] = []
  for (let s = 0; s < 360; s += 3) {
    const th = ((s + (rnd() * 2 - 1)) * Math.PI) / 180
    const [x0, y0] = at(PITH + 6 + rnd() * (R * 0.6 - PITH - 6), th)
    const [x1, y1] = at(outerAt(th) - 2, th)
    rays.push(`M${f(x0)},${f(y0)} L${f(x1)},${f(y1)}`)
  }

  // Trees: sectors clockwise from the top, sized by how many leaves they hold.
  const tops = treesOf(graph)
  const flat = (id: string): GraphNode[] => {
    const out: GraphNode[] = []
    const walk = (n: GraphNode) => {
      for (const c of n.children) {
        const child = graph.nodes.get(c)
        if (!child) continue
        if (child.kind === 'leaf' && monthOf.get(child.id)! <= last) out.push(child)
        walk(child)
      }
    }
    const top = graph.nodes.get(id)!
    if (top.kind === 'leaf' && monthOf.get(top.id)! <= last) out.push(top)
    walk(top)
    return out
  }
  const groups = tops.map((id) => ({ id, leaves: flat(id) })).filter((g) => g.leaves.length)
  const GAP = (7 * Math.PI) / 180
  const unit = (2 * Math.PI - GAP) / Math.max(1, shown.length + 0.6 * groups.length)
  const sectors: RingsLayout['sectors'] = []
  const position = new Map<string, { x: number; y: number; th: number }>()
  let a = -Math.PI / 2 + GAP / 2
  const LR = R + 44
  for (const g of groups) {
    const a0 = a
    const a1 = a + unit * (g.leaves.length + 0.6)
    g.leaves.forEach((n, i) => {
      const th = a0 + unit * (0.3 + i + 0.5)
      const [x, y] = at(mid(monthOf.get(n.id)!, th), th)
      position.set(n.id, { x, y, th })
    })
    const [rx0, ry0] = at(PITH + 2, a0)
    const [rx1, ry1] = at(outerAt(a0), a0)
    const middle = (a0 + a1) / 2
    const bottom = Math.sin(middle) > 0.15
    const rt = LR + (bottom ? 8 : 0)
    const [p0, p1] = bottom ? [at(rt, a1), at(rt, a0)] : [at(rt, a0), at(rt, a1)]
    const large = a1 - a0 > Math.PI ? 1 : 0
    const [tx0, ty0] = at(R + 30, a0)
    const [tx1, ty1] = at(R + 40, a0)
    sectors.push({
      id: g.id,
      a0,
      a1,
      ray: `M${f(rx0)},${f(ry0)} L${f(rx1)},${f(ry1)}`,
      arc: `M${f(p0[0])},${f(p0[1])} A${rt},${rt} 0 ${large} ${bottom ? 0 : 1} ${f(p1[0])},${f(p1[1])}`,
      tick: `M${f(tx0)},${f(ty0)} L${f(tx1)},${f(ty1)}`,
    })
    a = a1
  }

  // The borer hole at the top, where the core sample was taken.
  const [bx0, by0] = at(PITH + 3, -Math.PI / 2)
  const [bx1, by1] = at(outerAt(-Math.PI / 2) + 22, -Math.PI / 2)
  const borer = `M${f(bx0)},${f(by0)} L${f(bx1)},${f(by1)}`

  // Bark: a rough outer band with fissures.
  const outer = loop(
    (th) =>
      outerAt(th) +
      3 +
      BARK +
      2.2 * Math.sin(23 * th) +
      1.6 * Math.sin(37 * th + 1) +
      1.1 * Math.sin(61 * th + 2),
    480,
  )
  const fissures: { d: string; w: number }[] = []
  for (let s = 0; s < 360; s += 2) {
    const th = ((s + (rnd() * 1.6 - 0.8)) * Math.PI) / 180
    if (Math.abs(th + Math.PI / 2) < 0.06 || Math.abs(th - (3 * Math.PI) / 2) < 0.06) continue
    const r0 = outerAt(th) + 4 + rnd() * 4
    const r1 = r0 + 6 + rnd() * (BARK - 7)
    const [x0, y0] = at(r0, th)
    const [x1, y1] = at(r1, th + (rnd() * 0.02 - 0.01))
    fissures.push({ d: `M${f(x0)},${f(y0)} L${f(x1)},${f(y1)}`, w: f(0.6 + rnd() * 0.8) })
  }
  const bark = { d: `${outer} ${loop((th) => outerAt(th) + 2)}`, fissures }
  const cambium = {
    outer: loop(outerAt),
    previous: count > 1 ? loop((th) => radius(count - 1, th)) : null,
  }

  // Leaves, then their labels, placed so none covers another label or a dot.
  const dotR = (n: GraphNode) => 2.6 + Math.sqrt(n.words) / 17
  type B = [number, number, number, number]
  const boxes: B[] = shown.map((n) => {
    const p = position.get(n.id)!
    const r = dotR(n)
    return [p.x - r - 2, p.y - r - 2, p.x + r + 2, p.y + r + 2]
  })
  const free = (b: B) =>
    !boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])
  const dots: RingDot[] = []
  for (const n of [...shown].sort((x, y) => y.words - x.words)) {
    const p = position.get(n.id)!
    const r = dotR(n)
    const deep = n.depth > 2
    const size = deep ? 10.5 : 11.5
    const text = n.icon ? `${n.icon} ${n.title}` : n.title
    const tw = textWidth(text, size) + (n.icon ? 6 : 0)
    const hh = size + 2
    const right = Math.cos(p.th) >= 0
    const candidates: [number, number, 'start' | 'end' | 'middle', B][] = []
    for (const side of right ? [1, -1] : [-1, 1])
      for (const dy of [0, -9, 9, -16, 16])
        candidates.push(
          side > 0
            ? [
                p.x + r + 5,
                p.y + dy,
                'start',
                [p.x + r + 4, p.y + dy - hh / 2 - 1, p.x + r + 6 + tw, p.y + dy + hh / 2],
              ]
            : [
                p.x - r - 5,
                p.y + dy,
                'end',
                [p.x - r - 6 - tw, p.y + dy - hh / 2 - 1, p.x - r - 4, p.y + dy + hh / 2],
              ],
        )
    candidates.push([
      p.x,
      p.y - r - 6,
      'middle',
      [p.x - tw / 2 - 1, p.y - r - 6 - hh, p.x + tw / 2 + 1, p.y - r - 4],
    ])
    const pick = candidates.find((c) => free(c[3])) ?? candidates[0]!
    boxes.push(pick[3])
    const baseline = pick[2] === 'middle' ? pick[1] : pick[1] + size * 0.36
    const month = monthOf.get(n.id)!
    dots.push({
      id: n.id,
      x: f(p.x),
      y: f(p.y),
      r: f(r),
      month,
      tree: groups.find((g) => g.leaves.includes(n))!.id,
      sprout: n.children.length > 0,
      fresh: month === allMonths - 1 && month === last,
      label: { x: f(pick[0]), y: f(baseline), anchor: pick[2], size, text },
      deep,
    })
  }
  const byId = new Map(dots.map((d) => [d.id, d]))

  // Threads curve through the inside: the control point is pulled 70 % of the way from
  // the chord's middle to the centre.
  const threads = graph.threads
    .filter((t) => byId.has(t.from) && byId.has(t.to))
    .map((t) => {
      const p = byId.get(t.from)!
      const q = byId.get(t.to)!
      const cx = ((p.x + q.x) / 2) * 0.3
      const cy = ((p.y + q.y) / 2) * 0.3
      return { from: t.from, to: t.to, d: `M${p.x},${p.y} Q${f(cx)},${f(cy)} ${q.x},${q.y}` }
    })
  const knots = dots
    .map((d) => {
      const parent = graph.nodes.get(graph.nodes.get(d.id)!.parent ?? '')
      const p = parent && byId.get(parent.id)
      return p ? `M${p.x},${p.y} L${d.x},${d.y}` : null
    })
    .filter((d): d is string => d !== null)

  // Callouts: the busiest month, and the living edge.
  const callouts: RingsLayout['callouts'] = []
  const callout = (
    th: number,
    rr: number,
    side: 1 | -1,
    title: string,
    sub: string,
    below: boolean,
  ) => {
    const [x, y] = at(rr, th)
    const lx = side * (R + 70)
    const ly = below ? R + 60 : -R * 0.42
    const ex = lx - side * 6
    callouts.push({
      x: f(x),
      y: f(y),
      path: `M${f(x)},${f(y)} L${f(ex)},${f(ly - 4)} L${f(ex + side * 6)},${f(ly - 4)}`,
      lx: f(lx),
      ly: f(ly),
      anchor: side > 0 ? 'start' : 'end',
      title,
      sub,
    })
  }
  const compact = (w: number) => (w >= 1000 ? `${(w / 1000).toFixed(1)}k` : String(w))
  if (months[busiest]!.words > 0) {
    const th = (-19 * Math.PI) / 180
    callout(
      th,
      mid(busiest, th),
      1,
      `Busiest month · ${LONG[(first + busiest) % 12]}`,
      `${compact(months[busiest]!.words)} words · ${months[busiest]!.planted.length} planted`,
      false,
    )
  }
  {
    const th = (52 * Math.PI) / 180
    const m = months[last]!
    const growing = last === allMonths - 1
    callout(
      th,
      outerAt(th) + 1,
      1,
      `${growing ? 'Growing now' : 'As it was'} · ${LONG[(first + last) % 12]}`,
      growing ? `${compact(m.words)} words so far` : `${shown.length} leaves then`,
      true,
    )
  }
  // The quiet Tree: the one that has planted nothing the longest, if over three months.
  let quiet: RingsLayout['quiet'] = null
  const stale = groups
    .map((g) => ({ g, latest: Math.max(...g.leaves.map((l) => monthOf.get(l.id)!)) }))
    .sort((x, y) => x.latest - y.latest)[0]
  if (stale && last - stale.latest > 3) {
    const s = sectors.find((x) => x.id === stale.g.id)!
    const th = (s.a0 + s.a1) / 2
    const [x, y] = at(R * 0.8, th)
    quiet = {
      x: f(x),
      y: f(y),
      lines: [
        `${graph.nodes.get(stale.g.id)!.title} has planted nothing`,
        `since ${LONG[(first + stale.latest) % 12]}`,
      ],
    }
  }

  const reach = R + BARK + 70
  const bounds: Box = { x0: -reach, y0: -reach, x1: reach + 200, y1: reach + 30 }
  return {
    months,
    monthOf,
    busiest,
    edges,
    bands,
    latewood,
    grain,
    lines,
    rays,
    sectors,
    bark,
    cambium,
    borer,
    dots,
    byId,
    threads,
    knots,
    callouts,
    quiet,
    bounds,
  }
}
