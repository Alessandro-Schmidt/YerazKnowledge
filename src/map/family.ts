// The map of a Family (ARCHITECTURE.md §2, §6): one repository, where every entry at the
// top (a folder, or a leaf with its sibling folder) is a Tree of its own. Pure: each Tree
// gets the single-Tree layout (layout.ts), centred on its core; d3.packSiblings places
// the Trees side by side; threads between Trees run from leaf to leaf through both cores.

import { packEnclose, packSiblings } from 'd3-hierarchy'
import { curveBundle, line } from 'd3-shape'
import type { Graph, GraphNode, Thread } from '../model/graph'
import { BRANCH_TEXT, ROOT } from '../model/tree'
import { layoutTree, nodeAt, textWidth, type Box, type MapLayout } from './layout'

export interface PlacedTree {
  /** The Tree's id in the Family: its top-level folder or leaf. */
  id: string
  /** The Tree on its own, rooted at its top-level entry, as its drawing needs it. */
  graph: Graph
  layout: MapLayout
  /** Centre (the core) in Family coordinates. */
  x: number
  y: number
  /** Radius of the circle the Tree and its name are packed in. */
  r: number
  /** The Tree's name under it, sized with the Tree, read when the whole Family is shown. */
  name: { y: number; size: number }
}

export interface FamilyLayout {
  trees: PlacedTree[]
  /** Every node id (each Tree's own included) → the Tree that holds it. */
  treeOf: Map<string, PlacedTree>
  /** Threads between leaves of two different Trees, in Family coordinates. */
  between: (Thread & { d: string })[]
  /** The box around every Tree and its name, for fitting the whole Family. */
  bounds: Box
}

/** Room between Trees, in layout units. */
const GAP = 48
const BOW = 0.18
const round = (v: number) => Math.round(v * 10) / 10

/**
 * One Tree of a Family as a graph of its own: its top-level entry is the root (and the
 * core), and only the threads inside it are kept. Nodes keep their Family ids.
 */
export function treeGraph(family: Graph, id: string): Graph {
  const top = family.nodes.get(id)!
  const nodes = new Map<string, GraphNode>([
    [ROOT, { ...top, id: ROOT, kind: 'root', parent: null, depth: 0 }],
  ])
  let leaves = 0
  let branches = 0
  const walk = (node: GraphNode) => {
    for (const child of node.children) {
      const c = family.nodes.get(child)!
      nodes.set(child, c.parent === id ? { ...c, parent: ROOT, depth: c.depth - 1 } : c)
      if (c.kind === 'leaf') leaves++
      else branches++
      walk(c)
    }
  }
  walk(top)
  const local = (n: string) => (n === id ? ROOT : n)
  const threads = family.threads
    .filter((t) => t.from !== ROOT && t.to !== ROOT)
    .map((t) => ({ from: local(t.from), to: local(t.to) }))
    .filter((t) => nodes.has(t.from) && nodes.has(t.to))
  return {
    nodes,
    threads,
    out: new Map(),
    in: new Map(),
    external: [],
    stats: { leaves, branches, threads: threads.length, words: top.total },
  }
}

/**
 * The Family's own text: the repository's README.md, which describes the repository. It
 * stays a leaf (ARCHITECTURE.md §4), but it is shown in the Family's Peek, not as a Tree.
 */
export const FAMILY_TEXT = BRANCH_TEXT

/** The ids of a Family's Trees: every entry at its top but its README.md. */
export const treesOf = (graph: Graph): string[] =>
  graph.nodes.get(ROOT)!.children.filter((id) => id !== FAMILY_TEXT)

const families = new WeakMap<Graph, FamilyLayout>()

/** The layout of a Family's graph, computed once per graph object. */
export function familyLayout(graph: Graph): FamilyLayout {
  let family = families.get(graph)
  if (!family) families.set(graph, (family = layoutFamily(graph)))
  return family
}

function layoutFamily(graph: Graph): FamilyLayout {
  const trees: PlacedTree[] = treesOf(graph).map((id) => {
    const tree = treeGraph(graph, id)
    const full = layoutTree(tree)
    // A Tree of one leaf is its core alone: no rings around nothing.
    const layout = full.nodes.length ? full : { ...full, rings: [] }
    const { x0, y0, x1, y1 } = layout.bounds
    const reach = Math.max(-x0, x1, -y0, y1)
    const size = Math.round(Math.max(16, reach / 10))
    const nameY = round(y1 + size * 1.1)
    const half = textWidth(graph.nodes.get(id)!.title, size) / 2
    const r = Math.max(reach, Math.hypot(half, nameY + size * 0.3)) + GAP
    return { id, graph: tree, layout, x: 0, y: 0, r, name: { y: nameY, size } }
  })

  // The largest Trees first, so they sit in the middle.
  packSiblings([...trees].sort((a, b) => b.r - a.r))
  const centre = trees.length ? packEnclose(trees) : { x: 0, y: 0 }
  const bounds: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  const treeOf = new Map<string, PlacedTree>()
  for (const t of trees) {
    t.x = Math.round(t.x - centre.x)
    t.y = Math.round(t.y - centre.y)
    for (const id of t.graph.nodes.keys()) treeOf.set(id === ROOT ? t.id : id, t)
    const half = textWidth(graph.nodes.get(t.id)!.title, t.name.size) / 2
    const b = t.layout.bounds
    bounds.x0 = Math.min(bounds.x0, t.x + b.x0, t.x - half)
    bounds.y0 = Math.min(bounds.y0, t.y + b.y0)
    bounds.x1 = Math.max(bounds.x1, t.x + b.x1, t.x + half)
    bounds.y1 = Math.max(bounds.y1, t.y + t.name.y + t.name.size * 0.3)
  }
  if (!trees.length) Object.assign(bounds, { x0: -100, y0: -100, x1: 100, y1: 100 })

  const family = { trees, treeOf, between: [], bounds } as FamilyLayout
  // From a leaf up its Tree to the core, across to the other core (bowed to one side, so
  // the two directions between a pair don't overlap), and down to the other leaf.
  const bundle = line().curve(curveBundle.beta(0.85))
  const up = (id: string, tree: PlacedTree) => {
    const points: [number, number][] = []
    for (let n = id; ; n = graph.nodes.get(n)!.parent!) {
      const p = positionOf(family, n)!
      points.push([p.x, p.y])
      if (n === tree.id) return points
    }
  }
  for (const { from, to } of graph.threads) {
    const a = treeOf.get(from)
    const b = treeOf.get(to)
    if (!a || !b || a === b) continue
    const bow: [number, number] = [
      (a.x + b.x) / 2 - (b.y - a.y) * BOW,
      (a.y + b.y) / 2 + (b.x - a.x) * BOW,
    ]
    const d = bundle([...up(from, a), bow, ...up(to, b).reverse()])
    if (d)
      family.between.push({
        from,
        to,
        d: d.replace(/\d+\.\d{2,}/g, (n) => String(round(Number(n)))),
      })
  }
  return family
}

/** A dot's centre and radius in Family coordinates; a Tree's own id is its core. */
export function positionOf(
  family: FamilyLayout,
  id: string,
): { x: number; y: number; r: number } | null {
  const tree = family.treeOf.get(id)
  if (!tree) return null
  if (id === tree.id) return { x: tree.x, y: tree.y, r: tree.layout.coreR }
  const n = tree.layout.byId.get(id)!
  return { x: tree.x + n.x, y: tree.y + n.y, r: n.r }
}

/**
 * The node at a point in Family coordinates: the dot whose edge is nearest, within
 * `reach`, in the Tree under the point. A core answers its Tree's id. Null between Trees.
 */
export function familyNodeAt(
  family: FamilyLayout,
  x: number,
  y: number,
  reach: number,
): string | null {
  const tree = family.trees.find((t) => Math.hypot(x - t.x, y - t.y) <= t.r)
  if (!tree) return null
  const id = nodeAt(tree.layout, x - tree.x, y - tree.y, reach)
  return id === ROOT ? tree.id : id
}
