// The in-memory index of one Tree (ARCHITECTURE.md §3, "Model"): every node with its
// title, icon and word totals, plus threads, backlinks and adjacency. Derived from the
// tree model and the parsed leaves; never saved.

import type { LeafMeta, ParsedLeaf } from './parse'
import { BRANCH_TEXT, branchText, isLeafPath, ROOT, type TreeModel } from './tree'

export interface GraphNode {
  id: string
  kind: 'root' | 'branch' | 'leaf'
  parent: string | null
  children: string[]
  depth: number
  title: string
  icon: string | null
  /** An image as the icon (line 2 `icon`: `/assets/…` or https), shown in place of an emoji. */
  image?: string
  meta: LeafMeta | null
  /** Words in this leaf; an estimate from its size until the content arrives. */
  words: number
  /** Words in this node and everything under it. */
  total: number
  /** False while a leaf's content hasn't been fetched yet. */
  loaded: boolean
  /** The blob of the node's text: a leaf's file, a branch's README.md; null when it has none. */
  sha: string | null
}

export interface Thread {
  from: string
  to: string
  /** It ends at a ghost: a leaf not written yet. Only in the map's threads. */
  ghost?: true
}

export interface ExternalLink {
  from: string
  repo: string
  path: string
}

/**
 * A leaf that is linked to but not written yet (a ghost): derived from links alone, never a
 * node. It belongs under the nearest node its path implies: its folder's leaf or branch, or
 * an ancestor's when that folder doesn't exist yet; ROOT when not even its Tree does.
 */
export interface Ghost {
  /** The path the links name, where writing it creates the leaf. */
  id: string
  parent: string
  /** From its file name, as an unloaded leaf's. */
  title: string
  /** The leaves, and branches by their text, that link to it. */
  from: string[]
}

/** A node hidden by its line 2 (`"hidden": true`), with everything under it (owner's request). */
export interface HiddenNode {
  id: string
  kind: 'branch' | 'leaf'
  title: string
  icon: string | null
}

/** A template for new leaves (`.yeraz/templates/*.md`, issue #41): named by its line 1. */
export interface Template {
  path: string
  title: string
  icon: string | null
  /** Its line 2: the look a leaf made from it gets. */
  meta: LeafMeta | null
  /** False while its text hasn't been fetched yet. */
  loaded: boolean
}

export interface Graph {
  nodes: Map<string, GraphNode>
  threads: Thread[]
  /** Leaf id → the leaves it mentions, in order. */
  out: Map<string, string[]>
  /** Leaf id → the leaves that mention it. */
  in: Map<string, string[]>
  /** Links to leaves in other Trees. */
  external: ExternalLink[]
  /** Links to leaves of this Tree not written yet, by path. */
  ghosts: Map<string, Ghost>
  /** The hidden nodes, the topmost of each hidden part: not in `nodes`, shown again from Settings. */
  hidden: HiddenNode[]
  /** Templates for new leaves, in path order; managed in Settings › Templates. */
  templates: Template[]
  stats: { leaves: number; branches: number; threads: number; words: number }
  /**
   * The Tree with its hidden parts, for structure edits (sync/structure.ts): their names stay
   * taken, and they move and go with what holds them. `linkers`: node id → the nodes linking
   * to it. Only a Tree's own graph has it, not the map's merged ones.
   */
  whole?: { model: TreeModel; linkers: Map<string, string[]> }
}

/** A leaf's image icon from line 2: a file of the Tree (`/…`) or an https address. */
export function iconImage(meta: LeafMeta | null | undefined): string | null {
  const icon = meta?.icon
  return typeof icon === 'string' && /^(\/[^/]|https:\/\/)/.test(icon) ? icon : null
}

/** Bytes per word, for the estimate shown before content arrives (ARCHITECTURE.md §5.1). */
const BYTES_PER_WORD = 6

/** `ai-agents` → `Ai Agents`, `keycloak` → `Keycloak`: a readable name from a file or folder name. */
export function humanize(name: string): string {
  return name
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/(^|\s)(\p{Ll})/gu, (_, space: string, letter: string) => space + letter.toUpperCase())
}

export function buildGraph(
  model: TreeModel,
  leaves: Map<string, ParsedLeaf>,
  treeTitle: string,
): Graph {
  const nodes = new Map<string, GraphNode>()
  for (const node of model.nodes.values()) {
    const parsed = node.kind === 'leaf' ? leaves.get(node.id) : undefined
    // A branch's look (icon, cover, colours) is its text's, README.md; its line 1 never
    // renames it (ARCHITECTURE.md §4).
    const look = node.kind === 'branch' && node.text ? leaves.get(node.text.path) : parsed
    const words =
      node.kind !== 'leaf' ? 0 : parsed ? parsed.words : Math.round(node.size / BYTES_PER_WORD)
    nodes.set(node.id, {
      id: node.id,
      kind: node.kind,
      parent: node.parent,
      children: node.children,
      depth: node.depth,
      title: node.kind === 'root' ? treeTitle : (parsed?.title ?? humanize(node.name)),
      icon: look?.icon ?? null,
      ...(iconImage(look?.meta) && { image: iconImage(look?.meta)! }),
      meta: look?.meta ?? null,
      words,
      total: words,
      loaded: node.kind !== 'leaf' || parsed !== undefined,
      sha:
        node.kind === 'leaf' ? node.sha : node.kind === 'branch' ? (node.text?.sha ?? null) : null,
    })
  }

  // A node whose line 2 says `hidden` leaves the graph with everything under it: no node, no
  // thread, no ghost for a link to it. A branch's line 2 is its README.md's (its look).
  const hidden = new Set<string>()
  const hide = (id: string) => {
    hidden.add(id)
    for (const child of nodes.get(id)!.children) hide(child)
  }
  const tops: HiddenNode[] = []
  for (const n of nodes.values())
    if (n.kind !== 'root' && n.meta?.hidden === true && !hidden.has(n.id)) hide(n.id)
  for (const n of nodes.values())
    if (hidden.has(n.id) && !hidden.has(n.parent!))
      tops.push({ id: n.id, kind: n.kind as 'branch' | 'leaf', title: n.title, icon: n.icon })
  tops.sort((a, b) => a.id.localeCompare(b.id))
  for (const id of hidden) nodes.delete(id)
  for (const n of nodes.values()) n.children = n.children.filter((c) => !hidden.has(c))

  // Totals, children before parents.
  const sum = (id: string): number => {
    const node = nodes.get(id)!
    node.total = node.words + node.children.reduce((n, child) => n + sum(child), 0)
    return node.total
  }
  sum(ROOT)

  const threads: Thread[] = []
  const out = new Map<string, string[]>()
  const into = new Map<string, string[]>()
  const external: ExternalLink[] = []
  const ghosts = new Map<string, Ghost>()
  // A link differing from a file only by case is a typo, not a leaf to write; a hidden
  // leaf's path is not a ghost either.
  const lower = new Set([...nodes.keys(), ...hidden].map((id) => id.toLowerCase()))
  const linkers = new Map<string, string[]>()
  // Threads start in a leaf or a branch's text, and end at a leaf or a branch (its text).
  const sources = [
    ...model.leaves.map((id) => [id, id] as const),
    ...[...model.texts].map(([path, branch]) => [branch, path] as const),
  ]
  for (const [id, file] of sources) {
    for (const link of leaves.get(file)?.links ?? []) {
      if (link.repo !== null) {
        if (nodes.has(id)) external.push({ from: id, repo: link.repo, path: link.path })
        continue
      }
      const to =
        model.texts.get(link.path) ??
        (model.nodes.get(link.path)?.kind === 'leaf' ? link.path : null)
      if (to !== null && to !== id) linkers.set(to, [...(linkers.get(to) ?? []), id])
      if (!nodes.has(id) || (to !== null && hidden.has(to))) continue
      if (to === null) {
        const ghost = ghosts.get(link.path) ?? ghostAt(nodes, lower, link.path)
        if (ghost) ghosts.set(ghost.id, ghost)
        ghost?.from.push(id)
        continue
      }
      if (to === id) continue
      threads.push({ from: id, to })
      out.set(id, [...(out.get(id) ?? []), to])
      into.set(to, [...(into.get(to) ?? []), id])
    }
  }

  // A template is named by its line 1, as a leaf is titled; its icon is the one new leaves get.
  const templates: Template[] = model.templates.map(({ path }) => {
    const parsed = leaves.get(path)
    const name = path.slice(path.lastIndexOf('/') + 1, -'.md'.length)
    return {
      path,
      title: parsed?.title ?? humanize(name),
      icon: parsed?.icon ?? null,
      meta: parsed?.meta ?? null,
      loaded: parsed !== undefined,
    }
  })

  const all = [...nodes.values()]
  return {
    nodes,
    threads,
    out,
    in: into,
    external,
    ghosts,
    hidden: tops,
    templates,
    whole: { model, linkers },
    stats: {
      leaves: model.leaves.filter((id) => !hidden.has(id)).length,
      branches: all.filter((n) => n.kind === 'branch').length,
      threads: threads.length,
      words: nodes.get(ROOT)!.total,
    },
  }
}

/** A ghost for an unwritten leaf at `path`, or null when the path can't be one. */
function ghostAt(nodes: Map<string, GraphNode>, lower: Set<string>, path: string): Ghost | null {
  if (!isLeafPath(path) || path.endsWith(`/${BRANCH_TEXT}`) || lower.has(path.toLowerCase()))
    return null
  const folder = (p: string) => p.slice(0, Math.max(0, p.lastIndexOf('/')))
  let parent = folder(path)
  // The folder's holder (ARCHITECTURE.md §4): a leaf's sibling folder, or a branch.
  while (parent !== ROOT && nodes.get(`${parent}.md`)?.kind !== 'leaf' && !nodes.has(parent))
    parent = folder(parent)
  if (nodes.get(`${parent}.md`)?.kind === 'leaf') parent = `${parent}.md`
  const name = path.slice(path.lastIndexOf('/') + 1, -'.md'.length)
  return { id: path, parent, title: humanize(name), from: [] }
}

/** The ghosts a node links to. */
export const ghostsFrom = (graph: Graph, id: string): string[] =>
  [...graph.ghosts.values()].filter((g) => g.from.includes(id)).map((g) => g.id)

/** The node a link to `path` reaches: a leaf, or the branch whose text it is; null for neither. */
export function threadEnd(graph: Graph, path: string): string | null {
  if (graph.nodes.get(path)?.kind === 'leaf') return path
  const folder = path.slice(0, path.lastIndexOf('/'))
  return path === branchText(folder) && graph.nodes.get(folder)?.kind === 'branch' ? folder : null
}

/** The file that holds a node's text: a leaf's own, a branch's README.md (even before it exists). */
export function textFile(graph: Graph, id: string): string | null {
  const kind = graph.nodes.get(id)?.kind
  return kind === 'leaf' ? id : kind === 'branch' ? branchText(id) : null
}

/** The ids a selection keeps bright: itself, its parent, its children and its thread ends. */
export function neighbours(graph: Graph, id: string): Set<string> {
  const node = graph.nodes.get(id)
  const ghost = graph.ghosts.get(id)
  if (ghost) return new Set([id, ghost.parent, ...ghost.from])
  if (!node) return new Set()
  return new Set([
    id,
    ...(node.parent !== null ? [node.parent] : []),
    ...node.children,
    ...(graph.out.get(id) ?? []),
    ...(graph.in.get(id) ?? []),
    ...ghostsFrom(graph, id),
  ])
}

/** Titles of a node's ancestors, below the root: `Identity / Keycloak`. */
export function crumbs(graph: Graph, id: string): string[] {
  return ancestors(graph, id)
    .slice(1)
    .map((n) => n.title)
}

/** The nodes above a node (or a ghost), from the Family's root down to its parent. */
export function ancestors(graph: Graph, id: string): GraphNode[] {
  const above: GraphNode[] = []
  const parent = (graph.nodes.get(id) ?? graph.ghosts.get(id))?.parent
  for (
    let n = parent === undefined || parent === null ? undefined : graph.nodes.get(parent);
    n;
    n = n.kind === 'root' ? undefined : graph.nodes.get(n.parent!)
  ) {
    above.unshift(n)
  }
  return above
}

/** 40500 → `40.5k`, 900 → `900`. */
export function compactWords(words: number): string {
  return words >= 1000 ? `${Math.round(words / 100) / 10}k` : String(words)
}

/**
 * The graph with each node's children in the order they were planted (`planted`: ISO date
 * by path), oldest first: a branch by its oldest leaf. Undated ones follow, in their order.
 */
export function byPlanted(graph: Graph, planted: ReadonlyMap<string, string>): Graph {
  const first = new Map<string, string | undefined>()
  const dateOf = (id: string): string | undefined => {
    if (first.has(id)) return first.get(id)
    const node = graph.nodes.get(id)
    let date = planted.get(id)
    for (const child of node?.children ?? []) {
      const d = dateOf(child)
      if (d && (!date || d < date)) date = d
    }
    first.set(id, date)
    return date
  }
  const nodes = new Map(
    [...graph.nodes].map(([id, node]) => {
      const children = [...node.children].sort((a, b) => {
        const [da, db] = [dateOf(a), dateOf(b)]
        return da && db ? (da < db ? -1 : da > db ? 1 : 0) : da ? -1 : db ? 1 : 0
      })
      return [id, { ...node, children }]
    }),
  )
  return { ...graph, nodes }
}
