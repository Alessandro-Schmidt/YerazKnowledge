// A folder in memory, for tests of Families kept in a folder (src/local/folder.ts): the files,
// a clock for modification times, and the reads made, so tests can count them.

import { visible, type FolderAccess, type FolderFile, type FolderFs } from '../src/local/folder'

export interface MemoryFolder extends FolderFs {
  files: Map<string, { bytes: Uint8Array; modified: number }>
  /** Paths read, in order. */
  reads: string[]
  /** Writes a file as another app or device would (a later modification time). */
  put(path: string, text: string): void
  text(path: string): string | undefined
}

const encoder = new TextEncoder()

export function memoryFolder(initial: Record<string, string> = {}): MemoryFolder {
  const files: MemoryFolder['files'] = new Map()
  let clock = 1_000
  const folder: MemoryFolder = {
    files,
    reads: [],
    put: (path, text) => void files.set(path, { bytes: encoder.encode(text), modified: ++clock }),
    text: (path) => {
      const file = files.get(path)
      return file && new TextDecoder().decode(file.bytes)
    },
    list: async () =>
      [...files]
        .filter(([path]) => path.split('/').every((name, i) => visible(name, i === 0)))
        .map(([path, f]): FolderFile => ({ path, size: f.bytes.byteLength, modified: f.modified })),
    read: async (path) => {
      folder.reads.push(path)
      const file = files.get(path)
      if (!file) throw new Error(`No file ${path}`)
      return file.bytes.slice()
    },
    write: async (path, bytes) => void files.set(path, { bytes: bytes.slice(), modified: ++clock }),
    remove: async (path) => void files.delete(path),
  }
  for (const [path, text] of Object.entries(initial)) folder.put(path, text)
  return folder
}

/** Folder access over named memory folders: `pick` gives the next one queued. */
export function memoryFolders(folders: Record<string, MemoryFolder>) {
  const queue: string[] = []
  const access: FolderAccess & { choose(name: string): void } = {
    choose: (name) => void queue.push(name),
    pick: async () => {
      const name = queue.shift()
      return name ? { name, handle: name } : null
    },
    open: async (handle) => folders[handle as string]!,
  }
  return access
}
