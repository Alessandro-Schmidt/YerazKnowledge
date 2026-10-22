// Graph layout (design/views/generators/graph.py). Pure and deterministic. Leaves are a network
// of threads; each Tree is laid out on its own (a small force simulation: repulsion,
// sub-leaf springs, a pull to the middle), scaled to 34·√n + 20, then placed around the
// hub, the Tree most threads between Trees run through, and turned so its threaded
// leaves face the hub. Each Tree is a soft hull: a smoothed convex hull (Catmull-Rom).

import { FAMILY_TEXT, treesOf } from '../../map/family'
import type { Box } from '../../map/layout'
import { textWidth } from '../../map/layout'
import type { Graph, GraphNode } from '../../model/graph'
import { ROOT } from '../../model/tree'

export interface GraphDot {
  id: string
  x: number
  y: number
  r: number
  tree: string
  sprout: boolean
  label: string
  anchor: 'start' | 'end' | 'middle'
  lx: number
  ly: number
}

export interface GraphLayout {
  dots: GraphDot[]
  byId: Map<string, GraphDot>
  hulls: { id: string; d: string; label: { x: number; y: number }; members: string[] }[]
  /** Sub-leaf to its leaf. */
  struct: { from: string; to: string }[]
  threads: { from: string; to: string; d: string }[]
  hub: string | null
  bounds: Box
}

type P = [number, number]

export const graphDot = (n: Pick<GraphNode, 'words'>) => 5 + Math.sqrt(n.words) / 9
const f = (v: number) => Math.round(v * 10) / 10
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

/** A Tree's leaves on their own: sunflower start, then relaxed when small enough. */
function cluster(count: number, springs: [number, number][]): P[] {
  const q: P[] = Array.from({ length: count }, (_, i) => {
    const r = 18 * Math.sqrt(i + 0.5)
    return [Math.cos(i * GOLDEN) * r, Math.sin(i * GOLDEN) * r]
  })
  if (count > 1 && count <= 250) {
    const steps = 300
    for (let step = 0; step < steps; step++) {
      const cool = 1 - step / steps
      const force: P[] = q.map(() => [0, 0])
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const dx = q[i]![0] - q[j]![0]
          const dy = q[i]![1] - q[j]![1]
          const d2 = dx * dx + dy * dy + 1e-3
          const fx = (dx / d2) * 700
          const fy = (dy / d2) * 700
          force[i]![0] += fx
          force[i]![1] += fy
          force[j]![0] -= fx
          force[j]![1] -= fy
        }
      }
      for (const [i, j] of springs) {
        const vx = q[j]![0] - q[i]![0]
        const vy = q[j]![1] - q[i]![1]
        const len = Math.hypot(vx, vy) + 1e-6
        const k = (0.09 * (len - 64)) / len
        force[i]![0] += k * vx
        force[i]![1] += k * vy
        force[j]![0] -= k * vx
        force[j]![1] -= k * vy
      }
      for (let i = 0; i < count; i++) {
        const fx = force[i]![0] - 0.06 * q[i]![0]
        const fy = force[i]![1] - 0.06 * q[i]![1]
        const len = Math.max(Math.hypot(fx, fy), 1e-6)
        const move = Math.min(len, 10 * cool + 0.3)
        q[i]![0] += (fx / len) * move
        q[i]![1] += (fy / len) * move
      }
    }
  }
  const mx = q.reduce((s, p) => s + p[0], 0) / Math.max(1, count)
  const my = q.reduce((s, p) => s + p[1], 0) / Math.max(1, count)
  for (const p of q) {
    p[0] -= mx
    p[1] -= my
  }
  const reach = Math.max(1e-6, ...q.map((p) => Math.hypot(p[0], p[1])))
  const scale = count > 1 ? (34 * Math.sqrt(count) + 20) / reach : 0
  return q.map(([x, y]) => [x * scale, y * scale])
}

/** Convex hull (Andrew's monotone chain), counter-clockwise. */
export function convexHull(points: P[]): P[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: P[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: P[] = []
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** A closed Catmull-Rom curve through the points, as cubic Béziers. */
export function smoothClosed(pts: P[]): string {
  const k = pts.length
  if (!k) return ''
  let d = `M${f(pts[0]![0])},${f(pts[0]![1])}`
  for (let i = 0; i < k; i++) {
    const p0 = pts[(i - 1 + k) % k]!
    const p1 = pts[i]!
    const p2 = pts[(i + 1) % k]!
    const p3 = pts[(i + 2) % k]!
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${f(c1[0]!)},${f(c1[1]!)} ${f(c2[0]!)},${f(c2[1]!)} ${f(p2[0])},${f(p2[1])}`
  }
  return `${d}Z`
}

export function layoutGraph(graph: Graph): GraphLayout {
  const leaves = [...graph.nodes.values()].filter((n) => n.kind === 'leaf' && n.id !== FAMILY_TEXT)
  const treeOf = new Map<string, string>()
  for (const n of leaves) {
    let t = n
    while (t.parent !== ROOT && t.parent !== null) t = graph.nodes.get(t.parent)!
    treeOf.set(n.id, t.id)
  }
  const tops = treesOf(graph).filter((id) => leaves.some((l) => treeOf.get(l.id) === id))
  const struct = leaves
    .filter((l) => l.parent !== null && graph.nodes.get(l.parent)?.kind === 'leaf')
    .map((l) => ({ from: l.id, to: l.parent! }))
  const isLeaf = new Set(leaves.map((l) => l.id))
  const threadPairs = graph.threads.filter((t) => isLeaf.has(t.from) && isLeaf.has(t.to))

  // How many threads run between each pair of Trees; the hub has the most.
  const between = new Map<string, number>()
  const key = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`)
  const crossing = new Map<string, number>()
  for (const t of threadPairs) {
    const a = treeOf.get(t.from)!
    const b = treeOf.get(t.to)!
    if (a === b) continue
    between.set(key(a, b), (between.get(key(a, b)) ?? 0) + 1)
    crossing.set(a, (crossing.get(a) ?? 0) + 1)
    crossing.set(b, (crossing.get(b) ?? 0) + 1)
  }
  const links = (a: string, b: string) => between.get(key(a, b)) ?? 0
  const hub =
    tops.length > 1
      ? [...tops].sort((a, b) => (crossing.get(b) ?? 0) - (crossing.get(a) ?? 0))[0]!
      : (tops[0] ?? null)

  // Each Tree's own layout.
  const local = new Map<string, P>()
  const reachOf = new Map<string, number>()
  for (const id of tops) {
    const members = leaves.filter((l) => treeOf.get(l.id) === id)
    const index = new Map(members.map((m, i) => [m.id, i]))
    const springs = struct
      .filter((s) => index.has(s.from) && index.has(s.to))
      .map((s) => [index.get(s.from)!, index.get(s.to)!] as [number, number])
    const q = cluster(members.length, springs)
    members.forEach((m, i) => local.set(m.id, q[i]!))
    reachOf.set(id, members.length > 1 ? 34 * Math.sqrt(members.length) + 20 : 10)
  }

  // The others around the hub, linked Trees next to each other.
  const ring: string[] = []
  const left = tops.filter((t) => t !== hub)
  let last = hub
  while (left.length) {
    left.sort((a, b) => links(b, last!) - links(a, last!) || reachOf.get(b)! - reachOf.get(a)!)
    last = left.shift()!
    ring.push(last)
  }
  const centres = new Map<string, P>()
  if (hub) centres.set(hub, [0, 0])
  if (ring.length) {
    const biggest = Math.max(...ring.map((t) => reachOf.get(t)!))
    const around = ring.reduce((s, t) => s + 2 * reachOf.get(t)! + 90, 0) / (2 * Math.PI)
    const r = Math.max(reachOf.get(hub!)! + biggest + 90, around)
    let angle = -Math.PI / 2
    const total = ring.reduce((s, t) => s + reachOf.get(t)! + 45, 0)
    for (const t of ring) {
      const share = ((reachOf.get(t)! + 45) / total) * Math.PI * 2
      const a = angle + share / 2
      centres.set(t, [Math.cos(a) * r * 1.45, Math.sin(a) * r])
      angle += share
    }
  }

  // Turn each Tree so its threaded leaves face the hub.
  const positions = new Map<string, P>()
  for (const id of tops) {
    const c = centres.get(id)!
    const members = leaves.filter((l) => treeOf.get(l.id) === id)
    let turn = 0
    if (id !== hub) {
      let px = 0
      let py = 0
      for (const t of threadPairs) {
        for (const [a, b] of [
          [t.from, t.to],
          [t.to, t.from],
        ] as const) {
          if (treeOf.get(a) === id && treeOf.get(b) !== id) {
            px += local.get(a)![0]
            py += local.get(a)![1]
          }
        }
      }
      if (Math.hypot(px, py) > 1e-6) turn = Math.atan2(-c[1], -c[0]) - Math.atan2(py, px)
    }
    const cos = Math.cos(turn)
    const sin = Math.sin(turn)
    for (const m of members) {
      const [x, y] = local.get(m.id)!
      positions.set(m.id, [c[0] + x * cos - y * sin, c[1] + x * sin + y * cos])
    }
  }

  // Labels: each takes the first side (right, left, below, above) that touches nothing.
  type B = [number, number, number, number]
  const boxes: B[] = leaves.map((l) => {
    const [x, y] = positions.get(l.id)!
    const r = graphDot(l)
    return [x - r - 2, y - r - 2, x + r + 2, y + r + 2]
  })
  const hits = (b: B) =>
    boxes.some((o) => !(b[2] < o[0] || b[0] > o[2] || b[3] < o[1] || b[1] > o[3]))
  const dots: GraphDot[] = []
  for (const l of [...leaves].sort((a, b) => b.words - a.words)) {
    const [x, y] = positions.get(l.id)!
    const r = graphDot(l)
    const label = l.icon ? `${l.icon} ${l.title}` : l.title
    const w = textWidth(label, 12.5) + 4
    const options: [GraphDot['anchor'], number, number, B][] = [
      ['start', x + r + 7, y + 4.5, [x + r + 5, y - 8, x + r + 9 + w, y + 8]],
      ['end', x - r - 7, y + 4.5, [x - r - 9 - w, y - 8, x - r - 5, y + 8]],
      ['middle', x, y + r + 16, [x - w / 2, y + r + 4, x + w / 2, y + r + 20]],
      ['middle', x, y - r - 8, [x - w / 2, y - r - 20, x + w / 2, y - r - 4]],
    ]
    const pick = options.find((o) => !hits(o[3])) ?? options[0]!
    boxes.push(pick[3])
    dots.push({
      id: l.id,
      x: f(x),
      y: f(y),
      r: f(r),
      tree: treeOf.get(l.id)!,
      sprout: l.children.length > 0,
      label,
      anchor: pick[0],
      lx: f(pick[1]),
      ly: f(pick[2]),
    })
  }
  const byId = new Map(dots.map((d) => [d.id, d]))

  const hulls = tops.map((id) => {
    const members = dots.filter((d) => d.tree === id)
    const samples = members.length > 60 ? 8 : 24
    const ringPts: P[] = []
    for (const m of members)
      for (let i = 0; i < samples; i++) {
        const a = (i / samples) * Math.PI * 2
        ringPts.push([m.x + (m.r + 30) * Math.cos(a), m.y + (m.r + 30) * Math.sin(a)])
      }
    const hull = convexHull(ringPts)
    const kept: P[] = hull.length ? [hull[0]!] : []
    for (const p of hull.slice(1))
      if (Math.hypot(p[0] - kept.at(-1)![0], p[1] - kept.at(-1)![1]) > 16) kept.push(p)
    const top = Math.min(...kept.map((p) => p[1]))
    const cx = kept.reduce((s, p) => s + p[0], 0) / Math.max(1, kept.length)
    return {
      id,
      d: smoothClosed(kept),
      label: { x: f(cx), y: f(top + 18) },
      members: members.map((m) => m.id),
    }
  })

  const threads = threadPairs.map((t) => {
    const a = byId.get(t.from)!
    const b = byId.get(t.to)!
    const mx = (a.x + b.x) / 2 - (b.y - a.y) * 0.12
    const my = (a.y + b.y) / 2 + (b.x - a.x) * 0.12
    return { from: t.from, to: t.to, d: `M${a.x},${a.y} Q${f(mx)},${f(my)} ${b.x},${b.y}` }
  })

  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const b of boxes) {
    x0 = Math.min(x0, b[0] - 30)
    y0 = Math.min(y0, b[1] - 30)
    x1 = Math.max(x1, b[2] + 30)
    y1 = Math.max(y1, b[3] + 30)
  }
  if (!dots.length) [x0, y0, x1, y1] = [-100, -100, 100, 100]
  return { dots, byId, hulls, struct, threads, hub, bounds: { x0, y0, x1, y1 } }
}
