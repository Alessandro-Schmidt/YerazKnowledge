// Mind map layout (design/views/generators/mindmap.py, mobile_a.py). Pure. The Family's Trees
// are the pills either side of the core, balanced by how many rows each needs; every
// level after them is a column, as far from the last as its widest label. Each leaf
// without shown children is a row; a parent sits level with the middle of its rows.
// On a phone the map is one-sided and vertical: the core is a card on top and the Trees
// are pills on a spine down the left.

import { treesOf } from '../../map/family'
import type { Box } from '../../map/layout'
import { textWidth } from '../../map/layout'
import { compactWords, type Graph, type GraphNode } from '../../model/graph'
import { ROOT } from '../../model/tree'

export interface MindNode {
  id: string
  /** 1 for a Tree (a pill), then one more per level. */
  depth: number
  x: number
  y: number
  /** +1 right of the core, -1 left. */
  side: 1 | -1
  r: number
  kind: 'tree' | 'branch' | 'leaf'
  sprout: boolean
  label: string
  words: string
  /** Where its label ends, away from the core: children's edges start here. */
  end: number
  /** A pill's width (Trees only). */
  pill: number
  tree: string
}

export interface MindLayout {
  nodes: MindNode[]
  byId: Map<string, MindNode>
  edges: { id: string; d: string; depth: number; tree: string }[]
  core: { x: number; y: number; w: number; h: number }
  /** The phone's spine, from the core down to the last pill. */
  spine: string | null
  bounds: Box
}

export interface MindOptions {
  phone: boolean
  /** Deepest level shown (Trees are 1); a node on the way to `open` is always shown. */
  depth: number
  open: string | null
}

const PILL_H = 26
const LABEL = { 2: 13, deep: 12.5 } as const

export const mindDot = (n: Pick<GraphNode, 'kind' | 'words'>, phone = false) =>
  n.kind === 'leaf' ? (phone ? 3 + Math.sqrt(n.words) / 22 : 3.2 + Math.sqrt(n.words) / 18) : 4.5

export const curve = (x0: number, y0: number, x1: number, y1: number) => {
  const dx = (x1 - x0) * 0.5
  const f = (v: number) => Math.round(v * 10) / 10
  return `M${f(x0)},${f(y0)} C${f(x0 + dx)},${f(y0)} ${f(x1 - dx)},${f(y1)} ${f(x1)},${f(y1)}`
}

export function layoutMind(graph: Graph, options: MindOptions): MindLayout {
  const { phone } = options
  const ROW = phone ? 34 : 40
  const GAP = phone ? 16 : 24
  const coreTitle = graph.nodes.get(ROOT)!.title
  const coreW = phone ? 360 : Math.max(196, textWidth(coreTitle, 17) + 56)

  // The nodes shown: down to `depth`, and the way to the selection.
  const keep = new Set<string>()
  for (let id = options.open; id !== null && id !== ROOT; id = graph.nodes.get(id)?.parent ?? null)
    keep.add(id)
  const shown = (n: GraphNode) =>
    n.children.filter((c) => graph.nodes.has(c) && (n.depth < options.depth || keep.has(c)))

  const tops = treesOf(graph).map((id) => graph.nodes.get(id)!)
  const rowsOf = (n: GraphNode): number => {
    const kids = shown(n)
    return kids.length ? kids.reduce((s, c) => s + rowsOf(graph.nodes.get(c)!), 0) : 1
  }

  // Sides: the largest Trees first, each to the side with fewer rows so far.
  const sides = new Map<string, 1 | -1>()
  if (phone) for (const t of tops) sides.set(t.id, 1)
  else {
    let right = 0
    let left = 0
    for (const t of [...tops].sort((a, b) => rowsOf(b) - rowsOf(a))) {
      const rows = rowsOf(t)
      if (right <= left) {
        sides.set(t.id, 1)
        right += rows
      } else {
        sides.set(t.id, -1)
        left += rows
      }
    }
  }

  // Rows: y for each node, a parent level with the middle of its rows.
  const ys = new Map<string, number>()
  const depthOf = new Map<string, number>()
  const place = (ids: GraphNode[], startY: number) => {
    let y = startY
    let first = true
    for (const t of ids) {
      if (!first) y += GAP
      first = false
      const visit = (n: GraphNode, depth: number): [number, number] => {
        depthOf.set(n.id, depth)
        const kids = shown(n)
        if (!kids.length) {
          ys.set(n.id, y)
          y += ROW
          return [y - ROW, y - ROW]
        }
        let lo = Infinity
        let hi = -Infinity
        for (const c of kids) {
          const [a, b] = visit(graph.nodes.get(c)!, depth + 1)
          lo = Math.min(lo, a)
          hi = Math.max(hi, b)
        }
        ys.set(n.id, (lo + hi) / 2)
        return [lo, hi]
      }
      visit(t, 1)
    }
    return y
  }
  for (const side of [1, -1] as const) {
    const group = tops.filter((t) => sides.get(t.id) === side)
    if (!group.length) continue
    if (phone) place(group, 96)
    else {
      const rows = group.reduce((s, t) => s + rowsOf(t), 0)
      const total = rows * ROW + (group.length - 1) * GAP
      place(group, -total / 2 + ROW / 2)
    }
  }

  // Columns: each level starts past the widest label of the one before.
  const labelOf = (n: GraphNode) => (n.icon ? `${n.icon} ${n.title}` : n.title)
  const sizeOf = (depth: number) => (depth === 2 ? (phone ? 13.5 : LABEL[2]) : LABEL.deep)
  const pillW = (n: GraphNode) =>
    textWidth(n.title.toUpperCase(), phone ? 10 : 10.5, 0.14) + (phone ? 22 : 26)
  const widest = new Map<number, number>()
  for (const [id, depth] of depthOf) {
    const n = graph.nodes.get(id)!
    const w =
      depth === 1
        ? pillW(n)
        : mindDot(n, phone) +
          8 +
          textWidth(labelOf(n), sizeOf(depth)) +
          (n.kind === 'leaf' ? 7 + textWidth(compactWords(n.words), 10.5) : 0)
    widest.set(depth, Math.max(widest.get(depth) ?? 0, w))
  }
  const columnX = new Map<number, number>()
  columnX.set(1, phone ? 22 : coreW / 2 + 52)
  const maxDepth = Math.max(1, ...widest.keys())
  for (let d = 2; d <= maxDepth; d++) {
    const prev = columnX.get(d - 1)!
    const gap = phone ? 28 : 64
    columnX.set(d, prev + (widest.get(d - 1) ?? 0) + gap + (d === 2 && !phone ? 40 : 0))
  }

  const nodes: MindNode[] = []
  const byId = new Map<string, MindNode>()
  for (const [id, depth] of depthOf) {
    const n = graph.nodes.get(id)!
    let tree = n
    while (tree.parent !== ROOT && tree.parent !== null) tree = graph.nodes.get(tree.parent)!
    const side = sides.get(tree.id)!
    const x = side * columnX.get(depth)!
    const r = depth === 1 ? 0 : mindDot(n, phone)
    const label = depth === 1 ? n.title.toUpperCase() : labelOf(n)
    const words = depth > 1 && n.kind === 'leaf' ? compactWords(n.words) : ''
    const pill = depth === 1 ? pillW(n) : 0
    const end =
      depth === 1
        ? x + side * pill
        : x +
          side *
            (r +
              8 +
              textWidth(label, sizeOf(depth)) +
              (words && !phone ? 7 + textWidth(words, 10.5) : 0))
    const node: MindNode = {
      id,
      depth,
      x,
      y: ys.get(id)!,
      side,
      r,
      kind: depth === 1 ? 'tree' : n.kind === 'branch' ? 'branch' : 'leaf',
      sprout: n.kind === 'leaf' && n.children.length > 0,
      label,
      words: phone ? '' : words,
      end,
      pill,
      tree: tree.id,
    }
    nodes.push(node)
    byId.set(id, node)
  }

  const core = phone
    ? { x: 12, y: 14, w: coreW, h: 48 }
    : { x: -coreW / 2, y: -34, w: coreW, h: 68 }
  const edges: MindLayout['edges'] = []
  for (const node of nodes) {
    const n = graph.nodes.get(node.id)!
    if (node.depth === 1) {
      if (!phone)
        edges.push({
          id: node.id,
          d: curve((node.side * coreW) / 2, 0, node.x, node.y),
          depth: 1,
          tree: node.tree,
        })
      continue
    }
    const p = byId.get(n.parent!)!
    const x0 = p.end + p.side * (p.depth === 1 ? 0 : 8)
    edges.push({
      id: node.id,
      d: curve(x0, p.y, node.x - node.side * (node.r + 1), node.y),
      depth: node.depth,
      tree: node.tree,
    })
  }

  const pills = nodes.filter((n) => n.depth === 1)
  const spine =
    phone && pills.length ? `M${22 + 12},62 V${Math.max(...pills.map((p) => p.y))}` : null

  let x0 = core.x
  let x1 = core.x + core.w
  let y0 = core.y
  let y1 = core.y + core.h
  for (const n of nodes) {
    x0 = Math.min(x0, n.x - n.r - 8, n.end)
    x1 = Math.max(x1, n.x + n.r + 8, n.end)
    y0 = Math.min(y0, n.y - PILL_H)
    y1 = Math.max(y1, n.y + PILL_H)
  }
  return { nodes, byId, edges, core, spine, bounds: { x0, y0, x1, y1 } }
}
