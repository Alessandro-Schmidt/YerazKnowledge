// A Family kept in a folder on this device instead of a GitHub repository (issue #64): any
// folder the person picks, so also one iCloud Drive, Dropbox, OneDrive or a shared drive
// keeps in sync. The same repository format (ARCHITECTURE.md §4), read and written as files.
// Browsers with the File System Access API (Chrome, Edge) use it; the desktop app asks its
// own Rust commands (src-tauri/src/lib.rs), since not every OS's webview has that API.

import type { Invoke } from '../store/token'

/** A file in the folder; paths are relative to it, with `/`. */
export interface FolderFile {
  path: string
  size: number
  /** Last modified, ms since epoch. */
  modified: number
}

/** The files of one folder. Hidden entries are left out, except the root's `.yeraz.json`. */
export interface FolderFs {
  list(): Promise<FolderFile[]>
  read(path: string): Promise<Uint8Array>
  /** Writes a file, making its folders. */
  write(path: string, bytes: Uint8Array): Promise<void>
  /** Deletes a file, then any folder it leaves empty. */
  remove(path: string): Promise<void>
}

export class FolderError extends Error {
  constructor(
    /** `permission`: the browser needs the person to allow access again; `missing`: the folder is gone. */
    readonly kind: 'permission' | 'missing',
    message: string,
  ) {
    super(message)
    this.name = 'FolderError'
  }
}

/** How this device reaches folders. A handle is what `pick` gave; it is kept in the key/value store. */
export interface FolderAccess {
  /** Asks the person for a folder; null when they cancel. */
  pick(): Promise<{ name: string; handle: unknown } | null>
  /** The folder's files. With `ask`, a browser may ask the person again (needs a click). */
  open(handle: unknown, ask: boolean): Promise<FolderFs>
}

/** The file that marks a Family and holds its name (ARCHITECTURE.md §4). */
export const MARKER = '.yeraz.json'

/** A folder Family's `owner`: no GitHub account can be named this, so ids never clash. */
export const FOLDER_OWNER = '~'
export const isFolder = (repo: string) => repo.startsWith(`${FOLDER_OWNER}/`)

export const FOLDER_WELCOME = `# 🌱 Welcome

This is the first leaf of your Family. Every leaf is a Markdown file in this folder: line 1 is its title, and everything below is yours.

- Every folder or leaf at the top of this folder is a Tree of its own; this leaf is one.
- Add Trees, branches and leaves from the Explorer.
- Mention another leaf with a link, and the map draws a thread between them.
- Edits are saved to the folder as you type. If iCloud Drive, Dropbox or OneDrive keeps it, your other devices see them too.
`

/** Whether a folder entry is read: hidden ones (`.git`, `.obsidian`, `.DS_Store`) are not. */
export const visible = (name: string, atRoot: boolean) =>
  !name.startsWith('.') || (atRoot && name === MARKER)

// The parts of the File System Access API used here (not in TypeScript's DOM types yet).
type Permission = 'granted' | 'denied' | 'prompt'
interface DirHandle {
  kind: 'directory'
  name: string
  entries(): AsyncIterable<[string, DirHandle | FileHandle]>
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandle>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>
  removeEntry(name: string): Promise<void>
  queryPermission(options: { mode: 'readwrite' }): Promise<Permission>
  requestPermission(options: { mode: 'readwrite' }): Promise<Permission>
}
interface FileHandle {
  kind: 'file'
  getFile(): Promise<File>
  createWritable(): Promise<{ write(data: BufferSource): Promise<void>; close(): Promise<void> }>
}
type Picker = (options: { mode: 'readwrite'; id?: string }) => Promise<DirHandle>

const missing = () =>
  new FolderError('missing', "This folder isn't there any more: it may have been moved or renamed.")

/** Runs a file operation, turning a vanished folder into a FolderError. */
async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotFoundError') throw missing()
    throw e
  }
}

function browserFs(root: DirHandle): FolderFs {
  const parts = (path: string) => path.split('/')
  const dirOf = async (names: string[], create: boolean) => {
    let dir = root
    for (const name of names) dir = await dir.getDirectoryHandle(name, { create })
    return dir
  }
  const walk = async (dir: DirHandle, prefix: string, out: FolderFile[]): Promise<void> => {
    const subs: Promise<void>[] = []
    for await (const [name, handle] of dir.entries()) {
      if (!visible(name, prefix === '')) continue
      if (handle.kind === 'directory') subs.push(walk(handle, `${prefix}${name}/`, out))
      else {
        const file = await handle.getFile()
        out.push({ path: prefix + name, size: file.size, modified: file.lastModified })
      }
    }
    await Promise.all(subs)
  }
  return {
    list: () =>
      guard(async () => {
        const out: FolderFile[] = []
        await walk(root, '', out)
        return out
      }),
    read: (path) =>
      guard(async () => {
        const names = parts(path)
        const dir = await dirOf(names.slice(0, -1), false)
        const file = await (await dir.getFileHandle(names.at(-1)!)).getFile()
        return new Uint8Array(await file.arrayBuffer())
      }),
    write: (path, bytes) =>
      guard(async () => {
        const names = parts(path)
        const dir = await dirOf(names.slice(0, -1), true)
        const out = await (
          await dir.getFileHandle(names.at(-1)!, { create: true })
        ).createWritable()
        await out.write(bytes as Uint8Array<ArrayBuffer>)
        await out.close()
      }),
    remove: (path) =>
      guard(async () => {
        const names = parts(path)
        try {
          await (await dirOf(names.slice(0, -1), false)).removeEntry(names.at(-1)!)
        } catch (e) {
          if (!(e instanceof DOMException && e.name === 'NotFoundError')) throw e
        }
        // Git keeps no empty folders, so neither does a Family: prune the ones left empty.
        for (let depth = names.length - 1; depth > 0; depth--) {
          try {
            const dir = await dirOf(names.slice(0, depth), false)
            for await (const _ of dir.entries()) return
            await (await dirOf(names.slice(0, depth - 1), false)).removeEntry(names[depth - 1]!)
          } catch {
            return
          }
        }
      }),
  }
}

/** Folders through the File System Access API; null when the browser hasn't got it (Safari, Firefox, phones). */
export function browserFolders(): FolderAccess | null {
  const picker = (globalThis as { showDirectoryPicker?: Picker }).showDirectoryPicker
  if (!picker) return null
  return {
    async pick() {
      try {
        const handle = await picker({ mode: 'readwrite', id: 'yeraz' })
        return { name: handle.name, handle }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return null
        throw e
      }
    },
    async open(handle, ask) {
      const dir = handle as DirHandle
      let state = await dir.queryPermission({ mode: 'readwrite' })
      if (state !== 'granted' && ask) state = await dir.requestPermission({ mode: 'readwrite' })
      if (state !== 'granted')
        throw new FolderError(
          'permission',
          'Yeraz needs your permission to open this folder again.',
        )
      return browserFs(dir)
    },
  }
}

/** Folders through the desktop app's commands; a handle is the folder's absolute path. */
export function desktopFolders(invoke: Invoke): FolderAccess {
  const call = async <T>(cmd: string, args: Record<string, unknown>) => {
    try {
      return await invoke<T>(cmd, args)
    } catch (e) {
      if (String(e) === 'missing') throw missing()
      throw new Error(String(e), { cause: e })
    }
  }
  return {
    async pick() {
      const root = await invoke<string | null>('pick_folder')
      return root
        ? { name: root.split(/[\\/]/).filter(Boolean).at(-1) ?? root, handle: root }
        : null
    },
    async open(handle) {
      const root = handle as string
      return {
        list: () => call<FolderFile[]>('list_folder', { root }),
        read: async (path) => new Uint8Array(await call<ArrayBuffer>('read_file', { root, path })),
        // ponytail: bytes go to Rust as a JSON array of numbers; send a raw body if large images get slow.
        write: (path, bytes) => call('write_file', { root, path, bytes: Array.from(bytes) }),
        remove: (path) => call('remove_file', { root, path }),
      }
    },
  }
}
