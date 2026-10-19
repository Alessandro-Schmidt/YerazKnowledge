// What every view gets from the Family view, and the small helpers they share. In a
// view the Family's Trees play the part the design gives to a Tree's branches: the top
// groups (design/views/README.md), each in its own colour.

import { useEffect, useState } from 'react'
import type { TreeRef } from '../github/graphql'
import { ALL, allId } from '../map/families'
import { treesOf } from '../map/family'
import { crumbs, type Graph, type GraphNode } from '../model/graph'
import { firstLine } from '../model/search'
import { ROOT } from '../model/tree'
import { session } from '../store/session'
import type { StructureAction } from '../ui/StructureDialogs'
import { colorVar } from '../ui/theme'
import type { Insets } from '../map/useZoom'

export interface ViewProps {
  tree: TreeRef
  graph: Graph
  selected: string | null
  /** The nodes a search found, lit like a selection. */
  matches: { query: string; ids: readonly string[] } | null
  phone: boolean
  /** Space covered by floating panels, kept clear when fitting. */
  insets: Partial<Insets>
  onSelect(id: string | null): void
  /** Opens a node as a full page. */
  onOpen(id: string): void
  onAction(action: StructureAction): void
}

/** The Tree a node is in: its ancestor at the top of the Family (itself for a Tree). */
export function topOf(graph: Graph, id: string): string | null {
  let node = graph.nodes.get(id) ?? null
  if (!node && graph.ghosts.has(id)) node = graph.nodes.get(graph.ghosts.get(id)!.parent) ?? null
  while (node && node.parent !== null && node.parent !== ROOT) node = graph.nodes.get(node.parent)!
  return node && node.id !== ROOT ? node.id : null
}

/** A Tree's colour: its own from `.yeraz.json`, else the Family's, else the accent. */
export const treeColor = (ref: TreeRef, id: string | null): string =>
  colorVar((id !== null && ref.trees?.[id]) || ref.color)

/** The Family's Trees, as nodes, in their order. */
export const trees = (graph: Graph): GraphNode[] => treesOf(graph).map((id) => graph.nodes.get(id)!)

/** Every node under `id`, depth first, `id` excluded. */
export function descendants(graph: Graph, id: string): GraphNode[] {
  const out: GraphNode[] = []
  const walk = (n: GraphNode) => {
    for (const c of n.children) {
      const child = graph.nodes.get(c)
      if (!child) continue
      out.push(child)
      walk(child)
    }
  }
  walk(graph.nodes.get(id)!)
  return out
}

/** Leaves under `id` (sub-leaves included). */
export const leavesUnder = (graph: Graph, id: string) =>
  descendants(graph, id).filter((n) => n.kind === 'leaf')

/** Threads in and out of a node: how connected it is. */
export const degree = (graph: Graph, id: string) =>
  (graph.out.get(id)?.length ?? 0) + (graph.in.get(id)?.length ?? 0)

/**
 * Every Family's results of a session lookup by path, merged under their ids (map/families.ts):
 * what a view asks of `ALL`, every Family together. A Family not open yet is left out.
 */
async function fromEvery<T>(
  repo: string,
  ask: (repo: string) => Promise<Map<string, T>>,
): Promise<Map<string, T>> {
  if (repo !== ALL) return ask(repo)
  const out = new Map<string, T>()
  await Promise.all(
    session.getState().trees.map(async (t) => {
      const found = await ask(t.repo).catch(() => new Map<string, T>())
      for (const [path, value] of found) out.set(allId(t.repo, path), value)
    }),
  )
  return out
}

/** When each leaf was planted (Growth rings), for one Family or every Family (`ALL`). */
export const plantedIn = (repo: string) => fromEvery(repo, (r) => session.getState().planted(r))

/** Every leaf's first line, from the blob cache (no request); empty until it arrives. */
export function useFirstLines(repo: string, graph: Graph): Map<string, string> {
  const [lines, setLines] = useState<{ graph: Graph; lines: Map<string, string> } | null>(null)
  useEffect(() => {
    let live = true
    void fromEvery(repo, (r) => session.getState().texts(r)).then(
      (texts) => {
        if (!live) return
        const out = new Map<string, string>()
        for (const [path, text] of texts) out.set(path, firstLine(text))
        setLines({ graph, lines: out })
      },
      () => {},
    )
    return () => {
      live = false
    }
  }, [repo, graph])
  return lines?.lines ?? EMPTY
}
const EMPTY = new Map<string, string>()

/** `Identity / Keycloak`: where a node is, from its Tree down to its parent. */
export const placeOf = (graph: Graph, id: string) => crumbs(graph, id).join(' / ')

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
