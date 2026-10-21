// A Family kept in a folder on this device instead of a GitHub repository (issue #64): any
// folder the person picks, so also one iCloud Drive, Dropbox, OneDrive or a shared drive
// keeps in sync. The same repository format (ARCHITECTURE.md §4), read and written as files.
// Browsers with the File System Access API (Chrome, Edge) use it; the desktop app asks its
// own Rust commands (src-tauri/src/lib.rs), since not every OS's webview has that API.
// Phones, Safari and Firefox can't keep a folder open: there a Family is kept in the
// browser's own storage on the device, started empty or from a copy of a folder's files.

import type { KeyValueStore } from '../store/db'
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
  /**
   * A new project: asks the person where, then makes a folder named `name` there; null when
   * they cancel. Throws when a folder of that name is there already. On the device's own
   * storage, a new empty Family named `name`.
   */
  create(name: string): Promise<{ name: string; handle: unknown } | null>
  /** The folder's files. With `ask`, a browser may ask the person again (needs a click). */
  open(handle: unknown, ask: boolean): Promise<FolderFs>
  /** Families are kept in this browser's storage, not in folders the person can see. */
  onDevice?: boolean
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

/** Why a new project can't be a folder named `name`, or null when it can. */
export function projectNameProblem(name: string): string | null {
  if (!name) return 'Give the project a name.'
  if (/[\\/:*?"<>|]/.test(name)) return 'A folder name can\'t contain / \\ : * ? " < > |'
  if (name.startsWith('.'))
    return "A folder name can't start with a dot: the folder would be hidden."
  return null
}

const taken = (name: string) =>
  new Error(
    `There's already a folder named “${name}” there. Choose another name, or open it as an existing folder.`,
  )

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
  const choose = async () => {
    try {
      return await picker({ mode: 'readwrite', id: 'yeraz' })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null
      throw e
    }
  }
  return {
    async pick() {
      const handle = await choose()
      return handle && { name: handle.name, handle }
    },
    async create(name) {
      const parent = await choose()
      if (!parent) return null
      // Compared without case: macOS and Windows would give back the folder already there.
      for await (const [entry] of parent.entries())
        if (entry.toLowerCase() === name.toLowerCase()) throw taken(name)
      return { name, handle: await parent.getDirectoryHandle(name, { create: true }) }
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
    async create(name) {
      const parent = await invoke<string | null>('pick_folder')
      if (!parent) return null
      try {
        return { name, handle: await invoke<string>('new_folder', { parent, name }) }
      } catch (e) {
        if (String(e) === 'taken') throw taken(name)
        throw new Error(String(e), { cause: e })
      }
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

/** Files the person picked, with their paths inside the folder they picked (if one). */
export type ChooseFiles = () => Promise<{ path: string; bytes: Uint8Array }[] | null>

/**
 * Families kept in the browser's storage on this device (`device:<id>` keys), for browsers
 * that can't open folders. `choose` asks the person for a folder's files to copy in; the
 * copy is the Family from then on: the folder they came from isn't written.
 */
export function deviceFolders(store: KeyValueStore, choose: ChooseFiles): FolderAccess {
  const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return {
    onDevice: true,
    create: async (name) => ({ name, handle: newId() }),
    async pick() {
      const id = newId()
      const picked = await choose()
      if (!picked?.length) return null
      // Paths from a folder start with its name; that name is the Family's.
      const top = picked.map((f) => f.path.split('/')[0]!)
      const inFolder = picked.every((f, i) => f.path.includes('/') && top[i] === top[0])
      const fs = deviceFs(store, id)
      for (const file of picked) {
        const path = inFolder ? file.path.slice(top[0]!.length + 1) : file.path
        if (path.split('/').every((name, i) => visible(name, i === 0)))
          await fs.write(path, file.bytes)
      }
      return { name: inFolder ? top[0]! : 'Notes', handle: id }
    },
    open: async (handle) => deviceFs(store, handle as string),
  }
}

/** The files of a Family kept on this device: an index of paths, and each file's bytes. */
function deviceFs(store: KeyValueStore, id: string): FolderFs {
  const key = `device:${id}`
  let index: Promise<Record<string, FolderFile>> | null = null
  const files = () => (index ??= store.get<Record<string, FolderFile>>(key).then((v) => v ?? {}))
  // One change to the index at a time; times only go forward, so a scan sees every write.
  let queue: Promise<void> = Promise.resolve()
  let clock = 0
  const change = (edit: (all: Record<string, FolderFile>) => void) =>
    (queue = queue.then(async () => {
      const all = await files()
      edit(all)
      await store.set(key, all)
    }))
  return {
    list: async () => Object.values(await files()),
    async read(path) {
      const bytes = (await files())[path] && (await store.get<Uint8Array>(`${key}:${path}`))
      if (!bytes) throw new Error(`${path} isn't in this Family any more.`)
      return bytes
    },
    async write(path, bytes) {
      await store.set(`${key}:${path}`, bytes.slice())
      clock = Math.max(Date.now(), clock + 1)
      const modified = clock
      await change((all) => void (all[path] = { path, size: bytes.byteLength, modified }))
    },
    async remove(path) {
      await change((all) => void delete all[path])
      await store.set(`${key}:${path}`, null)
    },
  }
}

/** Asks for a folder's files (or several files, where a folder can't be chosen). */
export const chooseFiles: ChooseFiles = () =>
  new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.webkitdirectory = true
    input.hidden = true
    const done = async (files: File[] | null) => {
      input.remove()
      resolve(
        files &&
          (await Promise.all(
            files.map(async (f) => ({
              path: f.webkitRelativePath || f.name,
              bytes: new Uint8Array(await f.arrayBuffer()),
            })),
          )),
      )
    }
    input.addEventListener('change', () => void done([...(input.files ?? [])]))
    input.addEventListener('cancel', () => void done(null))
    document.body.append(input)
    input.click()
  })
