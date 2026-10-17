// Structure edits as file changes (development-plan.md M2 step 2), planned against the
// graph and the repository format (ARCHITECTURE.md §4). Pure: the caller commits them.

import type { Graph } from '../model/graph'
import { rewriteLinks } from '../model/links'
import { slugify } from '../model/slug'
import { ROOT } from '../model/tree'

/** A file to write, or to delete when `text` is null. */
/** A file's contents: a leaf's text, or the bytes of an image or other attachment. */
export type Content = string | Uint8Array

export const sameContent = (a: Content | null, b: Content | null) =>
  a === b ||
  (a instanceof Uint8Array &&
    b instanceof Uint8Array &&
    a.length === b.length &&
    a.every((byte, i) => byte === b[i]))

export interface FileChange {
  path: string
  /** The new contents; null when the file is deleted. */
  text: Content | null
}

export class StructureError extends Error {}

/** The folder that holds a node's children: '' for the root; a leaf's is its sibling folder. */
export function folderOf(graph: Graph, id: string): string {
  const node = graph.nodes.get(id)
  if (!node) throw new StructureError(`Nothing at ${id}`)
  if (node.kind === 'root') return ''
  return node.kind === 'branch' ? `${id}/` : `${id.slice(0, -'.md'.length)}/`
}

const baseName = (id: string) => id.slice(id.lastIndexOf('/') + 1).replace(/\.md$/, '')

/** Names taken in a folder: leaf file names (without .md) and folder names, compared without case. */
function takenNames(graph: Graph, parentId: string): Set<string> {
  const taken = new Set(graph.nodes.get(parentId)!.children.map((id) => baseName(id).toLowerCase()))
  if (parentId === ROOT) taken.add('assets')
  return taken
}

function unique(name: string, taken: Set<string>, joiner: string): string {
  let candidate = name
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${name}${joiner}${n}`
  return candidate
}

const leafText = (title: string) => `# ${title.trim() || 'Untitled'}\n\n`

/** A new leaf at the root, in a branch, or as a sub-leaf (in a leaf's sibling folder). */
export const planNewLeaf = (graph: Graph, parentId: string, title: string): FileChange =>
  planNewLeaves(graph, parentId, [title])[0]!

/** New leaves under one parent, for one commit: no two share a name, nor take one in use. */
export function planNewLeaves(
  graph: Graph,
  parentId: string,
  titles: readonly string[],
): FileChange[] {
  const folder = folderOf(graph, parentId)
  const taken = takenNames(graph, parentId)
  return titles.map((title) => {
    const name = unique(slugify(title), taken, '-')
    taken.add(name.toLowerCase())
    return { path: `${folder}${name}.md`, text: leafText(title) }
  })
}

/** Titles typed one per line; blank lines go, and so do list bullets from a pasted list. */
export const titlesIn = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*+]\s+/, '').trim())
    .filter(Boolean)

/** A branch is a folder; git keeps no empty folders, so it starts with one leaf. */
export function planNewBranch(
  graph: Graph,
  parentId: string,
  name: string,
  firstLeaf = 'Untitled',
): { branch: string; leaf: FileChange } {
  // Kept as typed (owner's decision), minus what a folder name can't hold.
  const clean =
    name
      .replace(/[/\\]+/g, '-')
      .replace(/^\.+/, '')
      .replace(/\s+/g, ' ')
      .trim() || 'Untitled branch'
  const folder = unique(clean, takenNames(graph, parentId), ' ')
  const branch = `${folderOf(graph, parentId)}${folder}`
  return { branch, leaf: { path: `${branch}/${slugify(firstLeaf)}.md`, text: leafText(firstLeaf) } }
}

/** The leaves in a node's subtree, the node included when it is a leaf. */
export function leavesUnder(graph: Graph, id: string): string[] {
  const out: string[] = []
  const walk = (n: string) => {
    const node = graph.nodes.get(n)!
    if (node.kind === 'leaf') out.push(n)
    node.children.forEach(walk)
  }
  walk(id)
  return out
}

/**
 * Moves a leaf, with its sub-leaves, under another node. Every link to a moved leaf is
 * rewritten in the same commit; the leaves' own root-relative links don't change.
 */
export function planMove(
  graph: Graph,
  textOf: (path: string) => string,
  id: string,
  newParentId: string,
): { changes: FileChange[]; moves: Map<string, string> } {
  const node = graph.nodes.get(id)
  if (node?.kind !== 'leaf') throw new StructureError('Only leaves can be moved')
  if (!graph.nodes.has(newParentId)) throw new StructureError(`Nothing at ${newParentId}`)
  if (node.parent === newParentId) return { changes: [], moves: new Map() }
  const moved = leavesUnder(graph, id)
  if (
    newParentId !== ROOT &&
    (moved.includes(newParentId) || newParentId.startsWith(`${id.slice(0, -3)}/`))
  ) {
    throw new StructureError("A leaf can't move inside itself")
  }

  const oldPrefix = id.slice(0, -'.md'.length)
  const newPrefix = `${folderOf(graph, newParentId)}${unique(baseName(id), takenNames(graph, newParentId), '-')}`
  const moves = new Map(
    moved.map((p) => [p, p === id ? `${newPrefix}.md` : newPrefix + p.slice(oldPrefix.length)]),
  )

  const changes: FileChange[] = []
  for (const [from, to] of moves) {
    changes.push({ path: from, text: null }, { path: to, text: rewriteLinks(textOf(from), moves) })
  }
  const linking = new Set(moved.flatMap((p) => graph.in.get(p) ?? []).filter((p) => !moves.has(p)))
  for (const path of linking) {
    const before = textOf(path)
    const after = rewriteLinks(before, moves)
    if (after !== before) changes.push({ path, text: after })
  }
  return { changes, moves }
}

/** Deletes a leaf (with its sub-leaves) or a branch, and says which other leaves link to them. */
export function planDelete(
  graph: Graph,
  id: string,
): { changes: FileChange[]; linkedFrom: string[] } {
  if (id === ROOT || !graph.nodes.has(id)) throw new StructureError('Nothing to delete')
  const gone = new Set(leavesUnder(graph, id))
  const linkedFrom = [...new Set([...gone].flatMap((p) => graph.in.get(p) ?? []))].filter(
    (p) => !gone.has(p),
  )
  return { changes: [...gone].map((path) => ({ path, text: null })), linkedFrom }
}
