// Paths → hierarchy, applying the repository format (ARCHITECTURE.md §4):
//   a leaf is a `.md` file; its sub-leaves and sub-branches live in the same-named
//   sibling folder; any other folder that holds leaves is a branch.
// Folders without leaves, `assets/`, hidden paths and other files are left out.

export interface TreeEntryLike {
  path: string
  type: 'blob' | 'tree' | 'commit'
  sha: string
  size?: number
}

interface NodeBase {
  /** Folder path for a branch, file path for a leaf, '' for the root. */
  id: string
  name: string
  parent: string | null
  depth: number
  children: string[]
}

export interface RootNode extends NodeBase {
  kind: 'root'
}
export interface BranchNode extends NodeBase {
  kind: 'branch'
}
export interface LeafNode extends NodeBase {
  kind: 'leaf'
  sha: string
  size: number
}
export type TreeNode = RootNode | BranchNode | LeafNode

export interface TreeModel {
  nodes: Map<string, TreeNode>
  /** Leaf ids in path order. */
  leaves: string[]
}

export const ROOT = ''

export function isLeafPath(path: string): boolean {
  return (
    path.endsWith('.md') &&
    !path.startsWith('assets/') &&
    !path.split('/').some((p) => p.startsWith('.'))
  )
}

const byName = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

export function buildTree(entries: readonly TreeEntryLike[]): TreeModel {
  const leafFiles = entries.filter((e) => e.type === 'blob' && isLeafPath(e.path))
  const files = new Set(leafFiles.map((e) => e.path))
  const nodes = new Map<string, TreeNode>([
    [ROOT, { kind: 'root', id: ROOT, name: '', parent: null, depth: 0, children: [] }],
  ])

  // The node that holds the contents of `folder`: the root, a leaf (sibling-folder rule) or a branch.
  const holder = (folder: string): TreeNode => {
    if (folder === ROOT) return nodes.get(ROOT)!
    const leaf = `${folder}.md`
    if (files.has(leaf)) return ensureLeaf(leaf)
    let branch = nodes.get(folder)
    if (!branch) {
      const parent = holder(parentFolder(folder))
      branch = {
        kind: 'branch',
        id: folder,
        name: baseName(folder),
        parent: parent.id,
        depth: parent.depth + 1,
        children: [],
      }
      nodes.set(folder, branch)
      parent.children.push(folder)
    }
    return branch
  }

  const sizes = new Map(leafFiles.map((e) => [e.path, e]))
  const ensureLeaf = (path: string): TreeNode => {
    let leaf = nodes.get(path)
    if (!leaf) {
      const parent = holder(parentFolder(path))
      const entry = sizes.get(path)!
      leaf = {
        kind: 'leaf',
        id: path,
        name: baseName(path).slice(0, -'.md'.length),
        parent: parent.id,
        depth: parent.depth + 1,
        children: [],
        sha: entry.sha,
        size: entry.size ?? 0,
      }
      nodes.set(path, leaf)
      parent.children.push(path)
    }
    return leaf
  }

  for (const path of files) ensureLeaf(path)

  for (const node of nodes.values()) {
    node.children.sort((a, b) => {
      const na = nodes.get(a)!
      const nb = nodes.get(b)!
      if (na.kind !== nb.kind) return na.kind === 'branch' ? -1 : 1
      return byName.compare(na.name, nb.name)
    })
  }

  return { nodes, leaves: [...files].sort() }
}

function parentFolder(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? ROOT : path.slice(0, slash)
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}
