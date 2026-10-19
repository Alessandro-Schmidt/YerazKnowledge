// Every Family on one map (issue #69): each Family's graph, its ids prefixed with its
// repository, merged under one root, so the Family map (family.ts, TreeMap.tsx) draws it
// unchanged. Each Family's Trees stay packed together, in a ring named after the Family.
// A link to a leaf in another connected Family, written as its GitHub URL, is a thread here.
// Pure. Editing still happens in the selected node's own Family (ui/AllView.tsx).

import type { TreeRef } from '../github/graphql'
import type { Ghost, Graph, GraphNode, Thread } from '../model/graph'
import { ROOT } from '../model/tree'
import { FAMILY_TEXT, layoutFamily, treesOf, type FamilyLayout } from './family'

/** Joins a Family and a node id. A repository (`owner/name`, `~/slug`) never holds `::`. */
const SEP = '::'
export const allId = (repo: string, id: string) => `${repo.toLowerCase()}${SEP}${id}`

/** A merged id's Family (lower case) and node id; null for the merged root. */
export function splitId(id: string): { repo: string; id: string } | null {
  const at = id.indexOf(SEP)
  return at < 0 ? null : { repo: id.slice(0, at), id: id.slice(at + SEP.length) }
}

export interface FamilyGraph {
  ref: TreeRef
  graph: Graph
}

/** One graph of every Family: its Trees under one root, ids prefixed (`allId`). */
export function mergeFamilies(families: readonly FamilyGraph[], title: string): Graph {
  const nodes = new Map<string, GraphNode>()
  const threads: Thread[] = []
  const out = new Map<string, string[]>()
  const into = new Map<string, string[]>()
  const ghosts = new Map<string, Ghost>()
  const stats = { leaves: 0, branches: 0, threads: 0, words: 0 }
  const tops: string[] = []
  const link = (from: string, to: string) => {
    threads.push({ from, to })
    out.set(from, [...(out.get(from) ?? []), to])
    into.set(to, [...(into.get(to) ?? []), from])
  }

  for (const { ref, graph } of families) {
    const id = (n: string) => (n === ROOT ? ROOT : allId(ref.repo, n))
    // The Family's README.md is its own text, not a Tree (family.ts).
    const kept = (n: string) => n !== ROOT && n !== FAMILY_TEXT
    for (const node of graph.nodes.values()) {
      if (!kept(node.id)) continue
      nodes.set(id(node.id), {
        ...node,
        id: id(node.id),
        parent: node.parent === null ? null : id(node.parent),
        children: node.children.filter(kept).map(id),
      })
    }
    tops.push(...treesOf(graph).map(id))
    for (const t of graph.threads)
      if (kept(t.from) && kept(t.to)) threads.push({ from: id(t.from), to: id(t.to) })
    for (const [from, to] of graph.out) out.set(id(from), to.map(id))
    for (const [to, from] of graph.in) into.set(id(to), from.map(id))
    for (const g of graph.ghosts.values())
      if (g.parent !== ROOT)
        ghosts.set(id(g.id), { ...g, id: id(g.id), parent: id(g.parent), from: g.from.map(id) })
    stats.leaves += graph.stats.leaves
    stats.branches += graph.stats.branches
    stats.threads += graph.stats.threads
    stats.words += graph.stats.words
  }

  // Threads between Families: links to a leaf of another connected Family.
  for (const { ref, graph } of families)
    for (const e of graph.external) {
      const to = allId(e.repo, e.path)
      if (nodes.get(to)?.kind !== 'leaf') continue
      link(allId(ref.repo, e.from), to)
      stats.threads++
    }

  nodes.set(ROOT, {
    id: ROOT,
    kind: 'root',
    parent: null,
    children: tops,
    depth: 0,
    title,
    icon: null,
    meta: null,
    words: stats.words,
    total: stats.words,
    loaded: true,
    sha: null,
  })
  return { nodes, threads, out, in: into, external: [], ghosts, stats }
}

/** The map of every Family: each Family's Trees packed together, then the Families. */
export const familiesLayout = (merged: Graph): FamilyLayout =>
  layoutFamily(merged, (tree) => splitId(tree)!.repo)

/** The `repo` of every Family together: the views' Family when they show all of them. */
export const ALL = '*'

/**
 * Every Family together as one Family for the views (views/common.ts): each Tree keeps its
 * own Family's colour, by its merged id.
 */
export function allRef(families: readonly FamilyGraph[], title: string): TreeRef {
  const trees: Record<string, string> = {}
  for (const { ref, graph } of families)
    for (const id of treesOf(graph)) {
      const colour = ref.trees?.[id] ?? ref.color
      if (colour) trees[allId(ref.repo, id)] = colour
    }
  return { owner: '', name: '', repo: ALL, branch: '', isPrivate: true, title, color: null, trees }
}
