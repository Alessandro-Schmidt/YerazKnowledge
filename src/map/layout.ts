// The radial map of one Tree (ARCHITECTURE.md §6, development-plan.md §3.3). Pure: the
// same graph always gives the same geometry, centred on (0, 0).
//   - d3's cluster layout orders the nodes: every node without children has an angle of
//     its own, and a parent sits among its children. Each depth sits on its own ring,
//     with a gap between top-level branches.
//   - Labels never overlap each other or a dot: neighbours are spaced by their dots and
//     labels, each ring leaves room for the labels of the ring inside it, and a label
//     turns to follow the radius when it wouldn't fit horizontally.
//   - Threads are bundled through the two leaves' common ancestor (curveBundle).
//   - A donut around the core shows each top-level branch's share of the words.
//   - A leaf's emoji is drawn on its dot, so that dot is never smaller than the emoji.

import { cluster, hierarchy, type HierarchyPointNode } from 'd3-hierarchy'
import { curveBundle, line } from 'd3-shape'
import type { Graph, GraphNode, Thread } from '../model/graph'
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
  /** The leaf's emoji, drawn on its dot; null when it has none. */
  icon: string | null
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
  /** Parent to child; `depth` is the child's, so the hierarchy can thin out from the core. */
  edges: { id: string; depth: number; d: string }[]
  threads: (Thread & { d: string })[]
  segments: { id: string; d: string }[]
  /** The Tree's title in the core, on one line or two. */
  coreLines: string[]
  /** The box that holds every node and label, for fitting the map to the screen. */
  bounds: Box
}

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface LayoutOptions {
  /** Smallest gap between neighbouring leaves on the outer ring, in px at zoom 1. */
  minArc?: number
  /** Radians between top-level branches. */
  gap?: number
  beta?: number
  /** Above this many leaves, leaf labels always follow the radius. */
  radialLabelsAbove?: number
}

const DESIGN_R = 318
const DESIGN_CORE = 40
const round = (v: number) => Math.round(v * 10) / 10

/** The smallest dot that holds an emoji; the emoji's font size is ICON_SIZE × the radius. */
export const ICON_R = 9
export const ICON_SIZE = 1.9
/** A ghost's dot (a leaf not written yet): hollow, so a little larger than an empty leaf's. */
const GHOST_R = 4

export function dotRadius(node: Pick<GraphNode, 'kind' | 'words' | 'total' | 'icon'>): number {
  if (node.kind !== 'leaf') return 4 + Math.sqrt(node.total) / 11
  const r = 2.4 + Math.sqrt(node.words) / 5.6
  return node.icon ? Math.max(ICON_R, r) : r
}

// Label sizes, as map.module.css draws them: leaves 13 px, top-level branches 10.5 px
// upper case with 0.14em tracking, the core title 12 px. Widths are estimated from the
// characters, since layout runs without a DOM: within 1 % of Geist as drawn, plus 6 % so
// the selected label (bold) fits too.
const LEAF_FONT = 13
const BRANCH_FONT = 10.5
const CORE_FONT = 12

export function textWidth(text: string, size: number, tracking = 0): number {
  let em = 0
  for (const ch of text) {
    if (ch === ' ') em += 0.3
    else if (/[iljtfrI.,:;'!|()[\]]/.test(ch)) em += 0.36
    else if (/[mwMW@%]/.test(ch)) em += 0.86
    else if (/[A-Z0-9&#?]/.test(ch)) em += 0.68
    else if (/[a-z]/.test(ch)) em += 0.56
    else em += 1 // emoji, CJK and the rest
  }
  return (em + tracking * text.length) * size * 1.06
}

/** A line segment with a radius: a dot (zero length) or a line of text. */
interface Capsule {
  x1: number
  y1: number
  x2: number
  y2: number
  r: number
}

/** The space a node's dot takes, its sub-leaf ring included. */
const dotCapsule = (n: LaidNode): Capsule => {
  const r = n.r + (n.kind === 'leaf' && n.hasChildren ? 4 : 0) + 1
  return { x1: n.x, y1: n.y, x2: n.x, y2: n.y, r }
}

/** The space a node's label takes. */
function labelCapsule(n: LaidNode): Capsule {
  const branch = n.depth === 1 && n.kind === 'branch'
  const size = branch ? BRANCH_FONT : LEAF_FONT
  const w = textWidth(n.label, size, branch ? 0.14 : 0)
  const r = size / 2 + 0.75 // a little air between lines
  const length = Math.max(0, w - 2 * r)
  if (n.labelRotate !== 0) {
    // Rotated about (labelX, labelY) and centred on it vertically (dy 0.32em): the text
    // runs outward along the radius from there.
    const ux = Math.sin(n.angle)
    const uy = -Math.cos(n.angle)
    const x1 = n.labelX + ux * r
    const y1 = n.labelY + uy * r
    return { x1, y1, x2: x1 + ux * length, y2: y1 + uy * length, r }
  }
  const left =
    n.anchor === 'start' ? n.labelX : n.anchor === 'end' ? n.labelX - w : n.labelX - w / 2
  const y = n.labelY - size * 0.33
  return { x1: left + r, y1: y, x2: left + r + length, y2: y, r }
}

const side = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
  (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)

function pointToSegment(px: number, py: number, s: Capsule): number {
  const dx = s.x2 - s.x1
  const dy = s.y2 - s.y1
  const length = dx * dx + dy * dy
  const t = length ? Math.min(1, Math.max(0, ((px - s.x1) * dx + (py - s.y1) * dy) / length)) : 0
  return Math.hypot(px - s.x1 - t * dx, py - s.y1 - t * dy)
}

function touch(a: Capsule, b: Capsule): boolean {
  const reach = a.r + b.r
  if (
    Math.min(a.x1, a.x2) - Math.max(b.x1, b.x2) > reach ||
    Math.min(b.x1, b.x2) - Math.max(a.x1, a.x2) > reach ||
    Math.min(a.y1, a.y2) - Math.max(b.y1, b.y2) > reach ||
    Math.min(b.y1, b.y2) - Math.max(a.y1, a.y2) > reach
  )
    return false
  const crossing =
    side(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1) * side(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2) < 0 &&
    side(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1) * side(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2) < 0
  if (crossing) return true
  return (
    Math.min(
      pointToSegment(a.x1, a.y1, b),
      pointToSegment(a.x2, a.y2, b),
      pointToSegment(b.x1, b.y1, a),
      pointToSegment(b.x2, b.y2, a),
    ) < reach
  )
}

/** Labels that overlap another label or a dot, as pairs of node ids (label first). */
export function overlaps(layout: MapLayout): [string, string][] {
  const found: [string, string][] = []
  const labels = layout.nodes.map(labelCapsule)
  const dots = layout.nodes.map(dotCapsule)
  layout.nodes.forEach((a, i) => {
    layout.nodes.forEach((b, j) => {
      if (i === j) return
      if (j > i && touch(labels[i]!, labels[j]!)) found.push([a.id, b.id])
      if (touch(labels[i]!, dots[j]!)) found.push([a.id, b.id])
    })
  })
  return found
}

/** Splits a long title into two balanced lines. */
function coreLinesOf(title: string): string[] {
  const words = title.split(' ')
  if (words.length < 2 || textWidth(title, CORE_FONT) <= 2 * (DESIGN_CORE - 8)) return [title]
  let best = [title]
  let widest = Infinity
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')]
    const w = Math.max(...lines.map((l) => textWidth(l, CORE_FONT)))
    if (w < widest) [best, widest] = [lines, w]
  }
  return best
}

export function layoutTree(graph: Graph, options: LayoutOptions = {}): MapLayout {
  const { minArc = 15, gap: topGap = 0.16, beta = 0.7, radialLabelsAbove = 60 } = options
  const get = (id: string) => graph.nodes.get(id)!
  const root = hierarchy(get(ROOT), (n) => n.children.map(get))
  // Rings: the design's 0.35R, 0.70R, R for three levels, generalised to any depth. These
  // are the smallest radii; a ring moves out when the labels inside it need room.
  const maxDepth = Math.max(1, root.height)
  const fraction = (depth: number) =>
    depth === 0 ? 0 : maxDepth === 1 ? 1 : 0.35 + (0.65 * (depth - 1)) / (maxDepth - 1)

  // Half the room a node needs beside it on its ring: its dot, or a line of label text.
  const half = (d: HierarchyPointNode<GraphNode>) =>
    Math.max(minArc / 2, dotRadius(d.data) + (d.data.kind === 'leaf' && d.children ? 4 : 0) + 2)
  // Neighbouring nodes without children, a and b. Going out from the ring where their
  // ancestors part, each ring has two nodes (or a node and a label passing through) that
  // must sit far enough apart; inner rings are shorter, so they need more of the angle.
  // In units where 1 is minArc on the outer ring.
  const separation = (a: HierarchyPointNode<GraphNode>, b: HierarchyPointNode<GraphNode>) => {
    const as = a.ancestors().reverse()
    const bs = b.ancestors().reverse()
    let k = 1
    while (k < as.length && k < bs.length && as[k] === bs[k]) k++
    let units = 0
    for (; k < Math.max(as.length, bs.length); k++) {
      const room =
        (k < as.length ? half(as[k]!) : minArc / 2) + (k < bs.length ? half(bs[k]!) : minArc / 2)
      units = Math.max(units, room / (minArc * fraction(k)))
    }
    return units
  }
  const laid = cluster<GraphNode>().nodeSize([1, 1]).separation(separation)(root)

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

  // Angles: the cluster's x order, spread over the circle minus the gaps. The last and
  // first nodes are neighbours too.
  const ends = laid.leaves()
  const xs = all.filter((d) => d.depth > 0).map((d) => d.x)
  const minX = xs.length ? Math.min(...xs) : 0
  const around = ends.length > 1 ? separation(ends.at(-1)!, ends[0]!) : 1
  const span = xs.length ? Math.max(...xs) - minX + around : 1
  // Gaps never take more than a quarter of the circle.
  const gap = groups > 1 ? Math.min(topGap, Math.PI / 2 / groups) : 0
  const unit = (2 * Math.PI - gap * groups) / span
  const angleOf = (d: HierarchyPointNode<GraphNode>) =>
    d.depth === 0 ? 0 : gap / 2 + (groupOf.get(d) ?? 0) * gap + (d.x - minX + around / 2) * unit

  const R = Math.max(DESIGN_R, minArc / unit)
  const coreLines = coreLinesOf(get(ROOT).title)
  const coreR = Math.max(
    DESIGN_CORE * Math.sqrt(R / DESIGN_R),
    Math.max(...coreLines.map((l) => textWidth(l, CORE_FONT))) / 2 + 12,
  )
  const point = (angle: number, radius: number): [number, number] => [
    radius * Math.sin(angle),
    -radius * Math.cos(angle),
  ]

  const labelOf = (g: GraphNode, depth: number) =>
    g.kind === 'branch' && depth === 1 ? g.title.toUpperCase() : g.title
  const offsetOf = (g: GraphNode) =>
    dotRadius(g) + (g.children.length && g.kind === 'leaf' ? 9 : 6) + 2
  const widthOf = (d: HierarchyPointNode<GraphNode>) => {
    const branch = d.depth === 1 && d.data.kind === 'branch'
    return textWidth(labelOf(d.data, d.depth), branch ? BRANCH_FONT : LEAF_FONT, branch ? 0.14 : 0)
  }
  // Rings start at the design's radii, the first one clear of the core.
  const rings = [0]
  for (let depth = 1; depth <= maxDepth; depth++)
    rings.push(
      Math.max(R * fraction(depth), depth === 1 ? coreR + 20 + Math.max(...top.map(half)) : 0),
    )

  const radialLeaves = graph.stats.leaves > radialLabelsAbove
  const inner = all.filter((d) => d.depth > 0)
  const pos = new Map<HierarchyPointNode<GraphNode>, [number, number]>([[laid, [0, 0]]])
  let nodes: LaidNode[] = []
  let labels: Capsule[] = []
  for (;;) {
    nodes = inner.map((d) => {
      const g = d.data
      const angle = angleOf(d)
      const [x, y] = point(angle, rings[d.depth]!)
      pos.set(d, [x, y])
      return {
        id: g.id,
        kind: g.kind === 'branch' ? 'branch' : 'leaf',
        depth: d.depth,
        angle,
        x: round(x),
        y: round(y),
        r: round(graph.ghosts.has(g.id) ? GHOST_R : dotRadius(g)),
        hasChildren: g.children.length > 0,
        icon: g.kind === 'leaf' ? g.icon : null,
        label: labelOf(g, d.depth),
        labelX: 0,
        labelY: 0,
        anchor: 'middle',
        labelRotate: 0,
      }
    })
    const radial = inner.map((d) => radialLeaves && d.data.kind === 'leaf')
    nodes.forEach((n, i) => placeLabel(n, offsetOf(inner[i]!.data), radial[i]!))

    // Horizontal labels that would touch a dot or another label turn to follow the
    // radius, where the spacing above leaves them room. Repeat until nothing turns.
    const dots = nodes.map(dotCapsule)
    labels = nodes.map(labelCapsule)
    for (let turned = true; turned;) {
      turned = false
      nodes.forEach((n, i) => {
        if (radial[i]) return
        const mine = labels[i]!
        if (!nodes.some((_, j) => j !== i && (touch(mine, labels[j]!) || touch(mine, dots[j]!))))
          return
        radial[i] = true
        placeLabel(n, offsetOf(inner[i]!.data), true)
        labels[i] = labelCapsule(n)
        turned = true
      })
    }

    // A parent's label along the radius runs out between its children's edges, so it must
    // end before their ring. Where one doesn't, move that ring (and those outside it) out
    // and lay out again. Rings only grow, so this ends.
    const short = rings.map(() => 0)
    inner.forEach((d, i) => {
      if (!radial[i] || !d.children) return
      const need = offsetOf(d.data) + widthOf(d) + 6 + Math.max(...d.children.map(half))
      const have = rings[d.depth + 1]! - rings[d.depth]!
      short[d.depth + 1] = Math.max(short[d.depth + 1]!, need - have)
    })
    if (short.every((v) => v < 0.5)) break
    let moved = 0
    for (let depth = 1; depth <= maxDepth; depth++) {
      moved += Math.max(0, short[depth]!)
      rings[depth]! += moved
    }
  }
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const ringOf = (depth: number) => rings[depth]!

  const bounds: Box = { x0: -coreR, y0: -coreR, x1: coreR, y1: coreR }
  for (const c of [...labels, ...nodes.map(dotCapsule)]) {
    bounds.x0 = Math.min(bounds.x0, c.x1 - c.r, c.x2 - c.r)
    bounds.y0 = Math.min(bounds.y0, c.y1 - c.r, c.y2 - c.r)
    bounds.x1 = Math.max(bounds.x1, c.x1 + c.r, c.x2 + c.r)
    bounds.y1 = Math.max(bounds.y1, c.y1 + c.r, c.y2 + c.r)
  }

  const edges = all
    .filter((d) => d.depth > 0)
    .map((d) => {
      const [x, y] = pos.get(d)!
      const parent = d.parent!
      if (parent.depth === 0) {
        const [sx, sy] = point(angleOf(d), coreR + 13)
        return {
          id: d.data.id,
          depth: d.depth,
          d: `M${round(sx)},${round(sy)}L${round(x)},${round(y)}`,
        }
      }
      const [px, py] = pos.get(parent)!
      const mid = (ringOf(parent.depth) + ringOf(d.depth)) / 2
      const [c1x, c1y] = point(angleOf(parent), mid)
      const [c2x, c2y] = point(angleOf(d), mid)
      return {
        id: d.data.id,
        depth: d.depth,
        d: `M${round(px)},${round(py)}C${round(c1x)},${round(c1y)} ${round(c2x)},${round(c2y)} ${round(x)},${round(y)}`,
      }
    })

  const byGraphId = new Map(all.map((d) => [d.data.id, d]))
  const bundle = line().curve(curveBundle.beta(beta))
  const threads = graph.threads.flatMap(({ from, to, ghost }) => {
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
    if (!d) return []
    return [
      {
        from,
        to,
        d: d.replace(/\d+\.\d{2,}/g, (n) => String(round(Number(n)))),
        ...(ghost && { ghost }),
      },
    ]
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
    rings: rings.slice(1).map(round),
    nodes,
    byId,
    edges,
    threads,
    segments,
    coreLines,
    bounds: {
      x0: round(bounds.x0 - 8),
      y0: round(bounds.y0 - 8),
      x1: round(bounds.x1 + 8),
      y1: round(bounds.y1 + 8),
    },
  }
}

/** Puts a node's label beside its dot: horizontal, or along the radius reading outward. */
function placeLabel(node: LaidNode, offset: number, radial: boolean) {
  const s = Math.sin(node.angle)
  const c = Math.cos(node.angle)
  // Flipped on the left so text is never upside down.
  const deg = (node.angle * 180) / Math.PI - 90
  const rotate = round(s < 0 ? deg + 180 : deg)
  node.labelX = round(node.x + s * offset)
  // At 3 o'clock the radius is horizontal, and so is the label.
  if (radial && rotate !== 0) {
    node.anchor = s < 0 ? 'end' : 'start'
    node.labelRotate = rotate
    node.labelY = round(node.y - c * offset)
  } else {
    node.anchor = s > 0.2 ? 'start' : s < -0.2 ? 'end' : 'middle'
    node.labelRotate = 0
    node.labelY = round(node.y - c * offset + (node.anchor === 'middle' ? (c > 0 ? -4 : 13) : 4))
  }
}

/** The ids a thread passes through: source, ancestors up to the common one, down to target. */
/**
 * The node at a point in layout units: the one whose dot edge is nearest, within `reach`.
 * The core is the Tree itself (ROOT). Null over empty space. Used where dots are too small
 * to aim at, such as the Trees drawn small on Home.
 */
export function nodeAt(layout: MapLayout, x: number, y: number, reach: number): string | null {
  const fromCore = Math.hypot(x, y) - layout.coreR
  if (fromCore <= 0) return ROOT
  let best: string | null = fromCore <= reach ? ROOT : null
  let gap = Math.min(fromCore, reach)
  for (const n of layout.nodes) {
    const d = Math.hypot(n.x - x, n.y - y) - n.r
    if (d <= gap) {
      gap = d
      best = n.id
    }
  }
  return best
}

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
