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
  stats: { leaves: number; branches: number; threads: number; words: number }
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
  // A link differing from a file only by case is a typo, not a leaf to write.
  const lower = new Set([...nodes.keys()].map((id) => id.toLowerCase()))
  // Threads start in a leaf or a branch's text, and end at a leaf or a branch (its text).
  const sources = [
    ...model.leaves.map((id) => [id, id] as const),
    ...[...model.texts].map(([path, branch]) => [branch, path] as const),
  ]
  for (const [id, file] of sources) {
    for (const link of leaves.get(file)?.links ?? []) {
      if (link.repo !== null) {
        external.push({ from: id, repo: link.repo, path: link.path })
        continue
      }
      const to =
        model.texts.get(link.path) ?? (nodes.get(link.path)?.kind === 'leaf' ? link.path : null)
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

  const all = [...nodes.values()]
  return {
    nodes,
    threads,
    out,
    in: into,
    external,
    ghosts,
    stats: {
      leaves: model.leaves.length,
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
  const titles: string[] = []
  for (
    let n = graph.nodes.get((graph.nodes.get(id) ?? graph.ghosts.get(id))?.parent ?? '');
    n && n.kind !== 'root';
    n = graph.nodes.get(n.parent!)
  ) {
    titles.unshift(n.title)
  }
  return titles
}

/** 40500 → `40.5k`, 900 → `900`. */
export function compactWords(words: number): string {
  return words >= 1000 ? `${Math.round(words / 100) / 10}k` : String(words)
}
