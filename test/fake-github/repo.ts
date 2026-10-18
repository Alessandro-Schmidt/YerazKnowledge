// One in-memory git repository: content-addressed blobs, a linear commit history on
// the default branch, and a tree index per commit with GitHub's listing order.

import { gitBlobSha, sha1Hex } from '../../src/model/sha'

export interface TreeEntry {
  path: string
  mode: '100644' | '040000'
  type: 'blob' | 'tree'
  sha: string
  size?: number
}

interface Dir {
  sha: string
  dirs: Map<string, Dir>
  files: Map<string, { sha: string; size: number }>
}

export interface Commit {
  oid: string
  parent: string | null
  message: string
  /** When it was committed; also the author's date. */
  date: Date
  /** path → blob SHA */
  files: Map<string, string>
  root: Dir
  /** Every directory's SHA → its path ('' is the root). */
  dirsBySha: Map<string, string>
}

export interface FileChanges {
  message: string
  /** When it was committed; now if not given (fixtures backdate their history). */
  date?: Date
  additions?: { path: string; contents: Uint8Array | string }[]
  deletions?: string[]
}

export class RepoError extends Error {}

const encoder = new TextEncoder()

// Git sorts tree entries by name, comparing a directory as if its name ended in "/".
const gitOrder = (a: [string, boolean], b: [string, boolean]) => {
  const ka = a[1] ? `${a[0]}/` : a[0]
  const kb = b[1] ? `${b[0]}/` : b[0]
  return ka < kb ? -1 : ka > kb ? 1 : 0
}

async function buildTree(files: Map<string, string>, blobs: Map<string, Uint8Array>) {
  const root: Dir = { sha: '', dirs: new Map(), files: new Map() }
  for (const [path, sha] of files) {
    const parts = path.split('/')
    const name = parts.pop()!
    let dir = root
    for (const part of parts) {
      if (dir.files.has(part)) throw new RepoError(`"${part}" is a file, not a directory: ${path}`)
      let child = dir.dirs.get(part)
      if (!child) dir.dirs.set(part, (child = { sha: '', dirs: new Map(), files: new Map() }))
      dir = child
    }
    if (dir.dirs.has(name)) throw new RepoError(`"${path}" is a directory`)
    dir.files.set(name, { sha, size: blobs.get(sha)!.byteLength })
  }
  const dirsBySha = new Map<string, string>()
  const hashDir = async (dir: Dir, path: string): Promise<string> => {
    const lines: string[] = []
    for (const [name, child] of dir.dirs)
      lines.push(`040000 tree ${await hashDir(child, path ? `${path}/${name}` : name)} ${name}`)
    for (const [name, file] of dir.files) lines.push(`100644 blob ${file.sha} ${name}`)
    dir.sha = await sha1Hex(`tree\n${lines.sort().join('\n')}`)
    dirsBySha.set(dir.sha, path)
    return dir.sha
  }
  await hashDir(root, '')
  return { root, dirsBySha }
}

export class FakeRepo {
  readonly commits: Commit[] = []
  readonly blobs = new Map<string, Uint8Array>()
  defaultBranch = 'main'
  updatedAt = Date.now()

  constructor(
    readonly owner: string,
    readonly name: string,
    public isPrivate = true,
    public description: string | null = null,
  ) {}

  get nameWithOwner(): string {
    return `${this.owner}/${this.name}`
  }

  get head(): Commit | null {
    return this.commits.at(-1) ?? null
  }

  /** Commits straight to the default branch, the way another device or a `git push` would. */
  async commit(changes: FileChanges): Promise<Commit> {
    const files = new Map(this.head?.files)
    for (const path of changes.deletions ?? []) {
      if (!files.delete(path)) {
        throw new RepoError(
          `A path was requested for deletion which does not exist as of commit oid \`${this.head?.oid}\``,
        )
      }
    }
    for (const { path, contents } of changes.additions ?? []) {
      if (
        !path ||
        path.startsWith('/') ||
        path.split('/').some((p) => p === '' || p === '.' || p === '..')
      ) {
        throw new RepoError(`Invalid path: ${path}`)
      }
      const bytes = typeof contents === 'string' ? encoder.encode(contents) : contents
      const sha = await gitBlobSha(bytes)
      this.blobs.set(sha, bytes)
      files.set(path, sha)
    }
    const { root, dirsBySha } = await buildTree(files, this.blobs)
    const parent = this.head?.oid ?? null
    const oid = await sha1Hex(
      `commit ${root.sha}\nparent ${parent}\n${this.commits.length}\n${changes.message}`,
    )
    const commit: Commit = {
      oid,
      parent,
      message: changes.message,
      date: changes.date ?? new Date(),
      files,
      root,
      dirsBySha,
    }
    this.commits.push(commit)
    this.updatedAt = Date.now()
    return commit
  }

  /** Text of a file at the head, for assertions. */
  read(path: string): string | undefined {
    const sha = this.head?.files.get(path)
    return sha ? new TextDecoder().decode(this.blobs.get(sha)) : undefined
  }

  /**
   * A tree listing in GitHub's order: each directory's entries sorted git-style, a
   * subdirectory's contents right after its own entry. Paths are relative to `dirPath`.
   */
  list(commit: Commit, dirPath: string, recursive: boolean): TreeEntry[] {
    let dir: Dir | undefined = commit.root
    for (const part of dirPath ? dirPath.split('/') : []) dir = dir?.dirs.get(part)
    if (!dir) return []
    const out: TreeEntry[] = []
    const walk = (d: Dir, prefix: string) => {
      const names: [string, boolean][] = [
        ...[...d.dirs.keys()].map((n): [string, boolean] => [n, true]),
        ...[...d.files.keys()].map((n): [string, boolean] => [n, false]),
      ].sort(gitOrder)
      for (const [name, isDir] of names) {
        const path = prefix ? `${prefix}/${name}` : name
        if (isDir) {
          const child = d.dirs.get(name)!
          out.push({ path, mode: '040000', type: 'tree', sha: child.sha })
          if (recursive) walk(child, path)
        } else {
          const file = d.files.get(name)!
          out.push({ path, mode: '100644', type: 'blob', sha: file.sha, size: file.size })
        }
      }
    }
    walk(dir, '')
    return out
  }
}
