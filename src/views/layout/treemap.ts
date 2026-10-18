// Treemap layout (design/views/generators/treemap.py). Pure. A two-level squarified treemap
// (Bruls et al.): the Family's Trees by their totals, then each Tree's leaves by their
// words, each leaf followed by its sub-leaves, largest first.

import { treesOf } from '../../map/family'
import type { Graph, GraphNode } from '../../model/graph'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Squarified rectangles for `values`, in their order, filling the rectangle. */
export function squarify(
  values: readonly number[],
  x: number,
  y: number,
  w: number,
  h: number,
): Rect[] {
  const total = values.reduce((s, v) => s + v, 0)
  if (total <= 0 || w <= 0 || h <= 0) return values.map(() => ({ x, y, w: 0, h: 0 }))
  const areas = values.map((v) => (v * w * h) / total)
  const rects: Rect[] = []
  const worst = (row: number[], side: number) => {
    const s = row.reduce((a, b) => a + b, 0)
    return Math.max(
      ...row.map((r) => Math.max((side * side * r) / (s * s), (s * s) / (side * side * r))),
    )
  }
  let i = 0
  while (i < areas.length) {
    const side = Math.min(w, h)
    const row = [areas[i++]!]
    while (i < areas.length && worst([...row, areas[i]!], side) <= worst(row, side))
      row.push(areas[i++]!)
    const s = row.reduce((a, b) => a + b, 0)
    if (w >= h) {
      // Down the left side.
      const rw = s / h
      let yy = y
      for (const a of row) {
        rects.push({ x, y: yy, w: rw, h: a / rw })
        yy += a / rw
      }
      x += rw
      w -= rw
    } else {
      // Along the top.
      const rh = s / w
      let xx = x
      for (const a of row) {
        rects.push({ x: xx, y, w: a / rh, h: rh })
        xx += a / rh
      }
      y += rh
      h -= rh
    }
  }
  return rects
}

export interface Tile extends Rect {
  id: string
  /** The leaf it sits in, for a sub-leaf ("in Keycloak"). */
  within: string | null
}

export interface Group extends Rect {
  id: string
  leaves: number
  total: number
  tiles: Tile[]
}

export type SizeBy = 'words' | 'equal'

const HEAD = 34

/** A Tree's leaves: each leaf followed by its sub-leaves, largest first, all levels down. */
export function leavesInOrder(graph: Graph, id: string): GraphNode[] {
  const out: GraphNode[] = []
  const walk = (node: GraphNode) => {
    const kids = node.children
      .map((c) => graph.nodes.get(c))
      .filter((n): n is GraphNode => n !== undefined)
      .sort((a, b) => b.total - a.total)
    for (const k of kids) {
      if (k.kind === 'leaf') out.push(k)
      walk(k)
    }
  }
  const top = graph.nodes.get(id)!
  if (top.kind === 'leaf') out.push(top)
  walk(top)
  return out
}

export function layoutTreemap(
  graph: Graph,
  box: Rect,
  sizeBy: SizeBy = 'words',
  phone = false,
): Group[] {
  const size = (n: GraphNode) => (sizeBy === 'equal' ? 1 : Math.max(1, n.words))
  const tops = treesOf(graph)
    .map((id) => ({ node: graph.nodes.get(id)!, leaves: leavesInOrder(graph, id) }))
    .filter((t) => t.leaves.length)
    .map((t) => ({ ...t, value: t.leaves.reduce((s, l) => s + size(l), 0) }))
    .sort((a, b) => b.value - a.value)
  const outer = squarify(
    tops.map((t) => t.value),
    box.x,
    box.y,
    box.w,
    box.h,
  )
  const pad = phone ? 3 : 4
  return tops.map((t, i) => {
    const r = outer[i]!
    const g = { x: r.x + pad, y: r.y + pad, w: r.w - 2 * pad, h: r.h - 2 * pad }
    const inner = squarify(
      t.leaves.map(size),
      g.x + 6,
      g.y + HEAD,
      Math.max(0, g.w - 12),
      Math.max(0, g.h - HEAD - 6),
    )
    return {
      id: t.node.id,
      ...g,
      leaves: t.leaves.length,
      total: t.node.total,
      tiles: t.leaves.map((l, j) => {
        const q = inner[j]!
        const parent = l.parent !== null ? graph.nodes.get(l.parent) : undefined
        return {
          id: l.id,
          x: q.x + 2,
          y: q.y + 2,
          w: Math.max(0, q.w - 4),
          h: Math.max(0, q.h - 4),
          within: parent?.kind === 'leaf' ? parent.id : null,
        }
      }),
    }
  })
}
