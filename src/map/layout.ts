// The radial map of one Tree (ARCHITECTURE.md §6, development-plan.md §3.3). Pure: the
// same graph always gives the same geometry, centred on (0, 0).
//   - d3's tidy tree orders and spaces the nodes; each depth sits on its own ring,
//     with a gap between top-level branches.
//   - Threads are bundled through the two leaves' common ancestor (curveBundle).
//   - A donut around the core shows each top-level branch's share of the words.

import { hierarchy, tree, type HierarchyPointNode } from 'd3-hierarchy'
import { curveBundle, line } from 'd3-shape'
import type { Graph, GraphNode } from '../model/graph'
import { ROOT } from '../model/tree'

export interface LaidNode {
  id: string
  kind: 'branch' | 'leaf'
  depth: number
  angle: number
  x: number
  y: number
  /** Dot radius: area grows with words. */
  r: number
  hasChildren: boolean
  label: string
  /** Horizontal label (small Trees, as in the design) or rotated along the radius. */
  labelX: number
  labelY: number
  anchor: 'start' | 'middle' | 'end'
  /** Degrees, for radial labels; 0 for horizontal ones. */
  labelRotate: number
}

export interface MapLayout {
  /** Radius of the outer ring. */
  R: number
  coreR: number
  rings: number[]
  nodes: LaidNode[]
  byId: Map<string, LaidNode>
  edges: { id: string; d: string }[]
  threads: { from: string; to: string; d: string }[]
  segments: { id: string; d: string }[]
  /** Radius that holds every node and label, for fitting the map to the screen. */
  extent: number
}

export interface LayoutOptions {
  /** Smallest gap between neighbouring leaves on the outer ring, in px at zoom 1. */
  minArc?: number
  /** Radians between top-level branches. */
  gap?: number
  beta?: number
  /** Above this many leaves, labels turn to follow the radius so they can't overlap. */
  radialLabelsAbove?: number
}

const DESIGN_R = 318
const DESIGN_CORE = 40
const round = (v: number) => Math.round(v * 10) / 10

export function dotRadius(node: GraphNode): number {
  return node.kind === 'leaf' ? 2.4 + Math.sqrt(node.words) / 5.6 : 4 + Math.sqrt(node.total) / 11
}

export function layoutTree(graph: Graph, options: LayoutOptions = {}): MapLayout {
  const { minArc = 15, gap: topGap = 0.16, beta = 0.85, radialLabelsAbove = 60 } = options
  const get = (id: string) => graph.nodes.get(id)!
  const root = hierarchy(get(ROOT), (n) => n.children.map(get))
  // Rings: the design's 0.35R, 0.70R, R for three levels, generalised to any depth.
  const maxDepth = Math.max(1, root.height)
  const fraction = (depth: number) =>
    depth === 0 ? 0 : maxDepth === 1 ? 1 : 0.35 + (0.65 * (depth - 1)) / (maxDepth - 1)
  // Inner rings are shorter, so neighbours there get proportionally more room: every ring
  // then has the same smallest gap (ARCHITECTURE.md §6: separation divided by depth).
  const laid = tree<GraphNode>()
    .nodeSize([1, 1])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.5) / fraction(a.depth))(root)

  const all = laid.descendants()
  const top = laid.children ?? []
  // Gaps separate groups at the top level: each branch or leaf with sub-leaves is a group,
  // and a run of plain leaves at the root shares one.
  const groupOf = new Map<HierarchyPointNode<GraphNode>, number>()
  let groups = 0
  top.forEach((t, i) => {
    const plain = !t.children
    if (i === 0 || !plain || top[i - 1]!.children) groups++
    t.each((d) => void groupOf.set(d as HierarchyPointNode<GraphNode>, groups - 1))
  })

  // Angles: the tidy tree's x order, spread over the circle minus the gaps.
  const xs = all.filter((d) => d.depth > 0).map((d) => d.x)
  const minX = xs.length ? Math.min(...xs) : 0
  const span = xs.length ? Math.max(...xs) - minX + 1 : 1
  // Gaps never take more than a quarter of the circle.
  const gap = groups > 1 ? Math.min(topGap, Math.PI / 2 / groups) : 0
  const unit = (2 * Math.PI - gap * groups) / span
  const angleOf = (d: HierarchyPointNode<GraphNode>) =>
    d.depth === 0 ? 0 : gap / 2 + (groupOf.get(d) ?? 0) * gap + (d.x - minX + 0.5) * unit

  const R = Math.max(DESIGN_R, minArc / unit)
  const ringOf = (depth: number) => R * fraction(depth)
  const coreR = DESIGN_CORE * Math.sqrt(R / DESIGN_R)
  const point = (angle: number, radius: number): [number, number] => [
    radius * Math.sin(angle),
    -radius * Math.cos(angle),
  ]

  const radialLabels = graph.stats.leaves > radialLabelsAbove
  const nodes: LaidNode[] = []
  const byId = new Map<string, LaidNode>()
  const pos = new Map<HierarchyPointNode<GraphNode>, [number, number]>([[laid, [0, 0]]])
  let extent = coreR
  for (const d of all) {
    if (d.depth === 0) continue
    const g = d.data
    const angle = angleOf(d)
    const ring = ringOf(d.depth)
    const [x, y] = point(angle, ring)
    pos.set(d, [x, y])
    const r = dotRadius(g)
    const s = Math.sin(angle)
    const c = Math.cos(angle)
    const offset = r + (g.children.length && g.kind === 'leaf' ? 9 : 6) + 2
    const label = g.kind === 'branch' && d.depth === 1 ? g.title.toUpperCase() : g.title
    let anchor: LaidNode['anchor']
    let labelX: number
    let labelY: number
    let labelRotate = 0
    if (radialLabels && g.kind === 'leaf') {
      // Along the radius, reading outward; flipped on the left so text is never upside down.
      const deg = (angle * 180) / Math.PI - 90
      const left = s < 0
      anchor = left ? 'end' : 'start'
      labelRotate = left ? deg + 180 : deg
      labelX = x + s * offset
      labelY = y - c * offset
    } else {
      anchor = s > 0.2 ? 'start' : s < -0.2 ? 'end' : 'middle'
      labelX = x + s * offset
      labelY = y - c * offset + (anchor === 'middle' ? (c > 0 ? -4 : 13) : 4)
    }
    const node: LaidNode = {
      id: g.id,
      kind: g.kind === 'branch' ? 'branch' : 'leaf',
      depth: d.depth,
      angle,
      x: round(x),
      y: round(y),
      r: round(r),
      hasChildren: g.children.length > 0,
      label,
      labelX: round(labelX),
      labelY: round(labelY),
      anchor,
      labelRotate: round(labelRotate),
    }
    nodes.push(node)
    byId.set(g.id, node)
    extent = Math.max(extent, ring + offset + (radialLabels ? 8 * Math.min(label.length, 28) : 0))
  }
  if (!radialLabels) extent += 120 // horizontal labels reach sideways

  const edges = all
    .filter((d) => d.depth > 0)
    .map((d) => {
      const [x, y] = pos.get(d)!
      const parent = d.parent!
      if (parent.depth === 0) {
        const [sx, sy] = point(angleOf(d), coreR + 13)
        return { id: d.data.id, d: `M${round(sx)},${round(sy)}L${round(x)},${round(y)}` }
      }
      const [px, py] = pos.get(parent)!
      const mid = (ringOf(parent.depth) + ringOf(d.depth)) / 2
      const [c1x, c1y] = point(angleOf(parent), mid)
      const [c2x, c2y] = point(angleOf(d), mid)
      return {
        id: d.data.id,
        d: `M${round(px)},${round(py)}C${round(c1x)},${round(c1y)} ${round(c2x)},${round(c2y)} ${round(x)},${round(y)}`,
      }
    })

  const byGraphId = new Map(all.map((d) => [d.data.id, d]))
  const bundle = line().curve(curveBundle.beta(beta))
  const threads = graph.threads.flatMap(({ from, to }) => {
    const a = byGraphId.get(from)
    const b = byGraphId.get(to)
    if (!a || !b) return []
    const route = a.path(b)
    const points = route.map((d) => pos.get(d)!)
    // Through the core, aim for a point between the two branches instead of the centre,
    // so threads between branches arc rather than all crossing at one point.
    const at = route.indexOf(laid)
    if (at > 0 && at < route.length - 1) {
      const [ux, uy] = points[at - 1]!
      const [vx, vy] = points[at + 1]!
      points[at] = [(ux + vx) / 4, (uy + vy) / 4]
    }
    const d = bundle(points)
    return d ? [{ from, to, d: d.replace(/\d+\.\d{2,}/g, (n) => String(round(Number(n)))) }] : []
  })

  const total = graph.stats.words || 1
  const ringR = coreR + 7
  let acc = 0
  const segments = top.map((t) => {
    const share = (t.data.total / total) * 2 * Math.PI
    const a0 = acc + 0.04
    const a1 = Math.max(a0, acc + share - 0.04)
    acc += share
    const [sx, sy] = point(a0, ringR)
    const [ex, ey] = point(a1, ringR)
    return {
      id: t.data.id,
      d: `M${round(sx)},${round(sy)}A${round(ringR)},${round(ringR)} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${round(ex)},${round(ey)}`,
    }
  })

  return {
    R: round(R),
    coreR: round(coreR),
    rings: Array.from({ length: maxDepth }, (_, i) => round(ringOf(i + 1))),
    nodes,
    byId,
    edges,
    threads,
    segments,
    extent: round(extent),
  }
}

/** The ids a thread passes through: source, ancestors up to the common one, down to target. */
export function threadRoute(graph: Graph, from: string, to: string): string[] {
  const up = (id: string) => {
    const chain: string[] = []
    for (let n: string | null = id; n !== null; n = graph.nodes.get(n)!.parent) chain.push(n)
    return chain
  }
  const a = up(from)
  const b = up(to)
  const common = a.find((id) => b.includes(id))!
  return [...a.slice(0, a.indexOf(common) + 1), ...b.slice(0, b.indexOf(common)).reverse()]
}

const layouts = new WeakMap<Graph, MapLayout>()

/** The layout of a graph, computed once per graph object (Home and the Tree view share it). */
export function layoutFor(graph: Graph): MapLayout {
  let layout = layouts.get(graph)
  if (!layout) layouts.set(graph, (layout = layoutTree(graph)))
  return layout
}
