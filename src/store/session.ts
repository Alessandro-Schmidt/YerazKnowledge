// The app's one store (Zustand): who is signed in, which Families exist, each one's graph,
// and the edits not committed yet. In this file a "Tree" (`TreeRef`, `trees`) is still a
// repository, which the app shows as a Family (ARCHITECTURE.md §2): its Trees are the
// entries at its top (map/family.ts). Persisted per device: the token, the last known ones,
// the repositories connected by hand, and pending edits (`dirty:<owner/name>`), so edits
// survive reloads, crashes and lost connections (ARCHITECTURE.md §5.2).

import { createStore, type StoreApi } from 'zustand/vanilla'
import { useStore } from 'zustand'
import {
  createGitHubClient,
  GitHubError,
  type GitHubClient,
  type TreeEntry,
} from '../github/client'
import { githubApi } from '../github/endpoint'
import {
  createTreeRepository,
  discoverTrees,
  fetchHistory,
  fetchPlanted,
  lookupTree,
  markerFields,
  type TreeRef,
  type Version,
} from '../github/graphql'
import {
  FOLDER_OWNER,
  FOLDER_WELCOME,
  FolderError,
  MARKER,
  browserFolders,
  chooseFiles,
  desktopFolders,
  deviceFolders,
  isFolder,
  type FolderAccess,
  type FolderFs,
} from '../local/folder'
import { buildGraph, type Graph } from '../model/graph'
import { markNow } from '../perf'
import { parseLeaf, type ParsedLeaf } from '../model/parse'
import { gitBlobSha } from '../model/sha'
import { slugify } from '../model/slug'
import { buildTree } from '../model/tree'
import { assetBytes, mimeOf } from '../sync/assets'
import { createAutosave, type Autosave } from '../sync/autosave'
import { pullFolder, pushFolder } from '../sync/folder'
import { isLocal, overlay } from '../sync/overlay'
import {
  blobTexts,
  fillContent,
  pullTree,
  type CachedListing,
  type PullProgress,
} from '../sync/pull'
import { byteLength, pushTree, type Dirty } from '../sync/push'
import { sameContent, type FileChange } from '../sync/structure'
import { openStore, type KeyValueStore } from './db'
import { desktopInvoke, tokenStore, type TokenStore } from './token'

export type ErrorKind = GitHubError['kind'] | FolderError['kind'] | 'unknown'

export type TreeData =
  | { status: 'loading'; graph: Graph | null; fetched: number; total: number }
  | { status: 'ready'; graph: Graph; offline: boolean }
  | { status: 'error'; graph: Graph | null; error: string; kind: ErrorKind }

/** What the top bar says about saving (development-plan.md M2 step 4). */
export type SyncState =
  | { status: 'synced' }
  | { status: 'pending'; due: number | null; files: number }
  | { status: 'saving'; files: number }
  | { status: 'offline'; files: number }
  | { status: 'conflict'; copies: string[] }
  | { status: 'error'; message: string; files: number }

export interface SessionState {
  /** Signed in: a GitHub token, or a Family kept in a folder on this device. */
  phase: 'starting' | 'signed-out' | 'signed-in'
  token: string | null
  /** Whether this device can keep a Family in a folder (issue #64). */
  folders: boolean
  /** Families are kept in this browser's storage: it can't open folders (phones, Safari, Firefox). */
  onDevice: boolean
  trees: TreeRef[]
  discovery: 'idle' | 'loading' | 'done' | 'error'
  data: Record<string, TreeData>
  sync: Record<string, SyncState>
  start(): Promise<void>
  /** Checks the token by finding the user's Trees. Throws a message for the token screen. */
  signIn(token: string): Promise<void>
  signOut(): Promise<void>
  discover(): Promise<void>
  /** Adds a repository by `owner/name`. Throws a message when it isn't a Tree. */
  connect(repo: string): Promise<TreeRef>
  /**
   * Asks for a folder on this device and adds it as a Family; null when the person cancels.
   * A folder without `.yeraz.json` gets one (and a welcome leaf, when it has no leaves).
   * With `empty`, a Family kept on the device starts with nothing but those, called `title`.
   */
  addFolder(empty?: boolean, title?: string): Promise<TreeRef | null>
  /**
   * Takes a Family off this device: a repository stays on GitHub (and isn't found again until
   * connected by hand), a folder stays on the disk, a Family in the device's own storage is
   * deleted. Pending edits are dropped.
   */
  removeTree(repo: string): Promise<void>
  /** Asks the person again for access to a Family's folder (from a click), then opens it. */
  allowFolder(repo: string): Promise<void>
  /** Creates a private repository holding a new Tree. Throws a message on failure. */
  createTree(input: { name: string; title: string }): Promise<TreeRef>
  /** Pulls a Tree; concurrent calls for the same Tree share one pull. */
  open(repo: string): Promise<void>
  /** A leaf's current text: the pending edit, or the committed version. */
  textOf(repo: string, path: string): Promise<string>
  /** Every leaf's current text in a Tree, by path, from the blob cache: no request. */
  texts(repo: string): Promise<Map<string, string>>
  /** A URL showing an attachment (`assets/…`), or null when the Tree has no such file. */
  assetUrl(repo: string, path: string): Promise<string | null>
  /** Every file path in an open Tree, pending edits included. */
  files(repo: string): string[]
  /** A file's size in bytes, pending edits included, without downloading it; null when unknown. */
  fileSize(repo: string, path: string): number | null
  /**
   * A leaf's past versions, newest first, a page at a time from the commit last pulled
   * (one request per page, kept for the session: a commit's history never changes).
   */
  history(
    repo: string,
    path: string,
    after?: string | null,
  ): Promise<{ versions: Version[]; next: string | null }>
  /**
   * When each leaf was planted (its first commit, by blame), ISO dates by path. Kept on
   * the device: only leaves not dated before are asked for; a leaf not committed yet
   * is planted now.
   */
  planted(repo: string): Promise<Map<string, string>>
  /** A past version's text by blob SHA, from the blob cache or one request. */
  versionText(repo: string, blob: string): Promise<string>
  /** Writes a past version back as a new edit, and commits it now (never rewrites history). */
  restore(repo: string, path: string, blob: string): Promise<void>
  /** Records edits (text, or null to delete); they are committed by the autosave. */
  apply(repo: string, changes: readonly FileChange[]): Promise<void>
  /** Renames a Tree: the name in its `.yeraz.json`, committed by the autosave. Throws a message. */
  renameTree(repo: string, title: string): Promise<void>
  /**
   * Colours a Family (`color`) or one of its Trees (`tree`), by colour name; null goes back
   * to the theme accent (the Family's colour, for a Tree). Written to `.yeraz.json`.
   */
  setColor(repo: string, color: string | null, tree?: string): Promise<void>
  /** Commits a Tree's pending edits now. */
  flush(repo: string): Promise<void>
  /** Commits every Tree's pending edits now (app hidden, Ctrl/Cmd+S, back online). */
  flushAll(): Promise<void>
  /** Forgets a conflict notice once it has been read. */
  dismissConflict(repo: string): void
}

const KEYS = { trees: 'session:trees', connected: 'session:connected', ignored: 'session:ignored' }
const dirtyKey = (repo: string) => `dirty:${repo.toLowerCase()}`

export function describeError(e: unknown): { message: string; kind: ErrorKind } {
  if (e instanceof FolderError) return { message: e.message, kind: e.kind }
  if (!(e instanceof GitHubError)) return { message: 'Something went wrong.', kind: 'unknown' }
  const messages: Record<GitHubError['kind'], string> = {
    network: "Can't reach GitHub. Check your connection.",
    auth: "GitHub didn't accept this token, or it can't read this repository.",
    'not-found': "This repository doesn't exist, or the token can't see it.",
    empty: 'This repository is empty.',
    'rate-limit': 'GitHub is limiting requests for now. Try again in a few minutes.',
    server: 'GitHub had a problem answering. Try again.',
    graphql: e.message,
    stale: e.message,
  }
  return { message: messages[e.kind], kind: e.kind }
}

const errorOf = (e: unknown) => {
  const { message, kind } = describeError(e)
  return { error: message, kind }
}

/** How long a folder Family waits after the last edit to write it (GitHub's waits two minutes). */
const FOLDER_IDLE_MS = 2000

const mergeTrees = (a: TreeRef[], b: TreeRef[]) => {
  const seen = new Map<string, TreeRef>()
  for (const t of [...a, ...b]) seen.set(t.repo.toLowerCase(), t)
  return [...seen.values()]
}

/** What was last pulled for a Tree: the listing and parsed leaves the overlay starts from. */
interface Base {
  ref: TreeRef
  entries: TreeEntry[]
  leaves: Map<string, ParsedLeaf>
  offline: boolean
}

export function createSession(deps: {
  store: KeyValueStore
  /** Where the token is kept: the key/value store, or the keychain in the desktop app. */
  tokens?: TokenStore
  api?: () => string
  /** How this device reaches folders, or its own storage when it can't open them; null for neither. */
  folders?: FolderAccess | null
  autosaveDelay?: number
}): StoreApi<SessionState> {
  const { store } = deps
  const tokens = deps.tokens ?? tokenStore(store)
  const api = deps.api ?? (() => 'https://api.github.com')
  const pulls = new Map<string, Promise<void>>()
  const bases = new Map<string, Base>()
  const dirty = new Map<string, Dirty>()
  const autosaves = new Map<string, Autosave>()
  // ponytail: object URLs live as long as the page; revoke them if memory ever matters.
  const urls = new Map<string | Uint8Array, string>()
  const histories = new Map<string, Promise<{ versions: Version[]; next: string | null }>>()
  /** Folders opened this session, by Family. */
  const opened = new Map<string, FolderFs>()
  let client: GitHubClient | null = null

  return createStore<SessionState>()((set, get) => {
    const github = () => {
      const token = get().token
      if (!token) throw new Error('Not signed in')
      return (client ??= createGitHubClient({ token, api: api() }))
    }
    const connected = async () => (await store.get<string[]>(KEYS.connected)) ?? []
    /** Repositories taken off this device: discovery leaves them out until connected again. */
    const ignored = async () => (await store.get<string[]>(KEYS.ignored)) ?? []
    /** A folder Family's files. With `ask`, the browser may ask for access again (on a click). */
    const folderOf = async (key: string, ask = false) => {
      let fs = opened.get(key)
      if (!fs) {
        const handle = await store.get(`folder:${key}`)
        if (!handle || !deps.folders)
          throw new FolderError('missing', "This device can't open this Family's folder.")
        fs = await deps.folders.open(handle, ask)
        opened.set(key, fs)
      }
      return fs
    }
    /** A file's bytes: from the folder, or from GitHub by blob SHA (cached). */
    const bytesOf = async (repo: string, path: string, sha: string) =>
      isFolder(repo)
        ? (await folderOf(repo.toLowerCase())).read(path)
        : assetBytes(repo, sha, { client: github(), store })
    /** A name typed on this device and not committed yet wins over what GitHub last said. */
    const pendingTitle = (key: string) => markerFields(dirty.get(key)?.[MARKER]?.text).title ?? null
    /** So do colours chosen here: the pending `.yeraz.json` gives the whole marker. */
    const titled = (ref: TreeRef): TreeRef => {
      const text = dirty.get(ref.repo.toLowerCase())?.[MARKER]?.text
      if (typeof text !== 'string') return ref
      const { title, color, trees } = markerFields(text)
      return { ...ref, title: title ?? ref.title, color: color ?? null, trees: trees ?? {} }
    }
    const saveTrees = async (list: TreeRef[]) => {
      const trees = list.map(titled)
      set({ trees })
      await store.set(KEYS.trees, trees)
    }
    /** Gives a Tree its new name (or colours) everywhere it is shown. */
    const retitle = async (key: string, fields: Partial<TreeRef>) => {
      const base = bases.get(key)
      if (base) bases.set(key, { ...base, ref: { ...base.ref, ...fields } })
      await saveTrees(
        get().trees.map((t) => (t.repo.toLowerCase() === key ? { ...t, ...fields } : t)),
      )
    }
    /** Changes to a `.yeraz.json`, one at a time per Family, so none reads a stale marker. */
    const markers = new Map<string, Promise<unknown>>()
    const inTurn = <T>(key: string, change: () => Promise<T>): Promise<T> => {
      const run = (markers.get(key) ?? Promise.resolve()).then(change, change)
      markers.set(
        key,
        run.catch(() => {}),
      )
      return run
    }
    /** The `.yeraz.json` as it is now (pending edit, or committed), parsed. Throws a message. */
    const readMarker = async (repo: string) => {
      const key = repo.toLowerCase()
      await pulls.get(key)
      const base = bases.get(key)
      if (!base) throw new Error("This Family hasn't opened yet. Try again in a moment.")
      const pending = (await loadDirty(key))[MARKER]?.text
      let text = typeof pending === 'string' ? pending : '{}\n'
      const sha = base.entries.find((e) => e.path === MARKER)?.sha
      if (pending === undefined && sha && !isLocal(sha)) {
        try {
          text = new TextDecoder().decode(await bytesOf(repo, MARKER, sha))
        } catch (e) {
          throw new Error(describeError(e).message, { cause: e })
        }
      }
      let marker: unknown
      try {
        marker = JSON.parse(text)
      } catch {
        marker = null
      }
      if (!marker || typeof marker !== 'object' || Array.isArray(marker))
        throw new Error(
          ".yeraz.json isn't valid JSON, so it can't be changed here. Fix the file first.",
        )
      return { text, marker: marker as Record<string, unknown> }
    }
    /** Writes the marker back the way it was laid out: on one line, or indented as before. */
    const writeMarker = (repo: string, text: string, marker: Record<string, unknown>) => {
      const indent = /^\{\s*\n([ \t]+)"/.exec(text)?.[1]
      return get().apply(repo, [
        { path: MARKER, text: `${JSON.stringify(marker, null, indent)}\n` },
      ])
    }
    const setData = (key: string, data: TreeData) =>
      set((s) => ({ data: { ...s.data, [key]: data } }))
    const setSync = (key: string, state: SyncState) =>
      set((s) => ({ sync: { ...s.sync, [key]: state } }))
    const count = (key: string) => Object.keys(dirty.get(key) ?? {}).length
    /** Writes a Family's or a Tree's colour into the marker (setColor, in turn). */
    const colour = async (repo: string, color: string | null, tree?: string) => {
      const key = repo.toLowerCase()
      const { text, marker } = await readMarker(repo)
      const next = { ...marker }
      if (tree === undefined) {
        if (color === null) delete next.color
        else next.color = color
      } else {
        const own = marker.trees
        const trees: Record<string, unknown> =
          own && typeof own === 'object' && !Array.isArray(own) ? { ...own } : {}
        if (color === null) delete trees[tree]
        else trees[tree] = color
        if (Object.keys(trees).length) next.trees = trees
        else delete next.trees
      }
      if (JSON.stringify(next) === JSON.stringify(marker)) return
      await writeMarker(repo, text, next)
      const fields = markerFields(JSON.stringify(next))
      await retitle(key, { color: fields.color ?? null, trees: fields.trees ?? {} })
    }

    const loadDirty = async (key: string) => {
      if (!dirty.has(key)) dirty.set(key, (await store.get<Dirty>(dirtyKey(key))) ?? {})
      return dirty.get(key)!
    }
    const saveDirty = (key: string) => store.set(dirtyKey(key), dirty.get(key) ?? {})

    /** The graph: what was pulled, with the pending edits on top. */
    const show = (key: string) => {
      const base = bases.get(key)
      if (!base) return
      const { entries, leaves } = overlay(base.entries, base.leaves, dirty.get(key) ?? {})
      const graph = buildGraph(buildTree(entries), leaves, pendingTitle(key) ?? base.ref.title)
      markNow('graph-built')
      setData(key, { status: 'ready', graph, offline: base.offline })
    }

    const pendingState = (key: string): SyncState => {
      const files = count(key)
      return files
        ? { status: 'pending', due: autosaves.get(key)?.due() ?? null, files }
        : { status: 'synced' }
    }

    const commit = async (key: string) => {
      const base = bases.get(key)
      const edits = dirty.get(key)
      if (!base || !edits || Object.keys(edits).length === 0) return
      const snapshot: Dirty = structuredClone(edits)
      setSync(key, { status: 'saving', files: Object.keys(snapshot).length })
      try {
        const pushed = isFolder(key)
          ? await pushFolder(base.ref, snapshot, { fs: await folderOf(key), store })
          : await pushTree(base.ref, snapshot, { client: github(), store })
        // The new base first, then the committed edits go: a file is always in one of the
        // two, so an image being shown doesn't vanish mid-commit.
        const listing = await store.get<CachedListing>(`tree:${base.ref.repo}`)
        if (listing) {
          const { leaves } = await fillContent(listing, {
            client: null,
            store,
            repo: base.ref.repo,
          })
          bases.set(key, { ...base, entries: listing.entries, leaves, offline: false })
        }
        // Edits made while committing stay pending, now on top of what was just committed.
        const current = dirty.get(key)!
        for (const [path, sent] of Object.entries(snapshot)) {
          const now = current[path]
          if (!now) continue
          if (sameContent(now.text, sent.text)) delete current[path]
          else if (sent.text === null) now.base = null
          else {
            now.base = await gitBlobSha(sent.text)
            // GitHub may have merged a text that was sent: cache it so the next merge has its base.
            if (typeof sent.text === 'string')
              await store.setMany([
                [`blob:${now.base}`, sent.text],
                [`leaf:${now.base}`, parseLeaf(sent.text)],
              ])
          }
        }
        await saveDirty(key)
        const committedMarker = snapshot[MARKER]?.text
        if (typeof committedMarker === 'string') {
          const { title, color, trees } = markerFields(committedMarker)
          await retitle(key, {
            ...(title ? { title } : {}),
            color: color ?? null,
            trees: trees ?? {},
          })
        }
        show(key)
        setSync(
          key,
          pushed.conflicts.length
            ? { status: 'conflict', copies: pushed.conflicts }
            : pendingState(key),
        )
        if (count(key)) autosaves.get(key)?.touch()
      } catch (e) {
        const files = count(key)
        if (e instanceof GitHubError && e.kind === 'network')
          setSync(key, { status: 'offline', files })
        else setSync(key, { status: 'error', message: describeError(e).message, files })
      }
    }

    const autosaveFor = (key: string) => {
      let save = autosaves.get(key)
      if (!save) {
        // A folder is written soon after typing stops, so what syncs it sees the edit.
        const delay = deps.autosaveDelay ?? (isFolder(key) ? FOLDER_IDLE_MS : undefined)
        save = createAutosave(() => commit(key), delay === undefined ? {} : { delay })
        autosaves.set(key, save)
      }
      return save
    }

    return {
      phase: 'starting',
      token: null,
      folders: !!deps.folders,
      onDevice: !!deps.folders?.onDevice,
      trees: [],
      discovery: 'idle',
      data: {},
      sync: {},

      async start() {
        const [token, trees] = await Promise.all([tokens.get(), store.get<TreeRef[]>(KEYS.trees)])
        const inFolders = (trees ?? []).some((t) => isFolder(t.repo))
        set({
          phase: token || inFolders ? 'signed-in' : 'signed-out',
          token: token ?? null,
          trees: trees ?? [],
        })
      },

      async signIn(token) {
        client = createGitHubClient({ token: token.trim(), api: api() })
        set({ token: token.trim() })
        try {
          const found = await discoverTrees(client)
          await tokens.set(token.trim())
          await saveTrees(
            mergeTrees(
              found,
              get().trees.filter((t) => isFolder(t.repo)),
            ),
          )
          set({ phase: 'signed-in', discovery: 'done' })
        } catch (e) {
          client = null
          set({ token: null })
          throw new Error(describeError(e).message, { cause: e })
        }
      },

      async signOut() {
        // Pending edits stay on this device, keyed by repository, for the next sign-in.
        // Families in folders aren't GitHub's: they stay.
        for (const save of autosaves.values()) save.dispose()
        autosaves.clear()
        client = null
        pulls.clear()
        bases.clear()
        dirty.clear()
        const kept = get().trees.filter((t) => isFolder(t.repo))
        await Promise.all([
          tokens.set(undefined),
          store.set(KEYS.trees, kept.length ? kept : undefined),
        ])
        set({
          phase: kept.length ? 'signed-in' : 'signed-out',
          token: null,
          trees: kept,
          data: {},
          sync: {},
          discovery: 'idle',
        })
      },

      async discover() {
        if (get().discovery === 'loading') return
        if (!get().token) return set({ discovery: 'done' })
        set({ discovery: 'loading' })
        try {
          const out = new Set((await ignored()).map((r) => r.toLowerCase()))
          const found = (await discoverTrees(github())).filter(
            (t) => !out.has(t.repo.toLowerCase()),
          )
          const extra = get().trees.filter((t) => found.every((f) => f.repo !== t.repo))
          const keep = new Set((await connected()).map((r) => r.toLowerCase()))
          await saveTrees(
            mergeTrees(
              found,
              extra.filter((t) => keep.has(t.repo.toLowerCase()) || isFolder(t.repo)),
            ),
          )
          set({ discovery: 'done' })
        } catch {
          set({ discovery: 'error' })
        }
      },

      async connect(repo) {
        const name = repo
          .trim()
          .replace(/^https?:\/\/github\.com\//, '')
          .replace(/\.git$|\/$/g, '')
        if (!/^[\w.-]+\/[\w.-]+$/.test(name))
          throw new Error('Write it as owner/name, for example you/notes.')
        let tree: TreeRef | null
        try {
          tree = await lookupTree(github(), name)
        } catch (e) {
          throw new Error(describeError(e).message, { cause: e })
        }
        if (!tree)
          throw new Error(`${name} isn't a Yeraz Family yet: add a .yeraz.json file at its root.`)
        const key = tree.repo.toLowerCase()
        await store.set(KEYS.connected, [...new Set([...(await connected()), tree.repo])])
        await store.set(
          KEYS.ignored,
          (await ignored()).filter((r) => r.toLowerCase() !== key),
        )
        await saveTrees(mergeTrees(get().trees, [tree]))
        return tree
      },

      async removeTree(repo) {
        const key = repo.toLowerCase()
        autosaves.get(key)?.dispose()
        autosaves.delete(key)
        dirty.delete(key)
        pulls.delete(key)
        bases.delete(key)
        opened.delete(key)
        await store.set(dirtyKey(key), undefined)
        if (isFolder(repo)) {
          const handle = await store.get<unknown>(`folder:${key}`)
          if (handle !== undefined) await deps.folders?.discard?.(handle)
          await store.set(`folder:${key}`, undefined)
        } else {
          await store.set(
            KEYS.connected,
            (await connected()).filter((r) => r.toLowerCase() !== key),
          )
          await store.set(KEYS.ignored, [...new Set([...(await ignored()), repo])])
        }
        const trees = get().trees.filter((t) => t.repo.toLowerCase() !== key)
        const data = { ...get().data }
        const sync = { ...get().sync }
        delete data[key]
        delete sync[key]
        set({ data, sync })
        await saveTrees(trees)
        if (!trees.length && !get().token) {
          await store.set(KEYS.trees, undefined)
          set({ phase: 'signed-out' })
        }
      },

      async addFolder(empty, title) {
        const access = deps.folders
        if (!access)
          throw new Error(
            "This browser can't open folders. Use Chrome or Edge on a computer, or the desktop app.",
          )
        const picked = await access.pick(empty, title)
        if (!picked) return null
        const fs = await access.open(picked.handle, true)
        const files = await fs.list()
        const encoder = new TextEncoder()
        let fields: ReturnType<typeof markerFields> = {}
        if (files.some((f) => f.path === MARKER))
          fields = markerFields(new TextDecoder().decode(await fs.read(MARKER)))
        else {
          await fs.write(MARKER, encoder.encode(`${JSON.stringify({ name: picked.name })}\n`))
          if (!files.some((f) => f.path.endsWith('.md')))
            await fs.write('welcome.md', encoder.encode(FOLDER_WELCOME))
        }
        const taken = new Set(get().trees.map((t) => t.repo.toLowerCase()))
        const slug = slugify(picked.name)
        let name = slug
        for (let n = 2; taken.has(`${FOLDER_OWNER}/${name}`); n++) name = `${slug}-${n}`
        const ref: TreeRef = {
          owner: FOLDER_OWNER,
          name,
          repo: `${FOLDER_OWNER}/${name}`,
          branch: '',
          isPrivate: true,
          title: fields.title ?? picked.name,
          color: fields.color ?? null,
          trees: fields.trees ?? {},
          folder: picked.name,
        }
        await store.set(`folder:${ref.repo}`, picked.handle)
        opened.set(ref.repo, fs)
        await saveTrees(mergeTrees(get().trees, [ref]))
        set({ phase: 'signed-in' })
        return ref
      },

      async allowFolder(repo) {
        const key = repo.toLowerCase()
        opened.delete(key)
        try {
          await folderOf(key, true)
        } catch (e) {
          setData(key, { status: 'error', graph: null, ...errorOf(e) })
          return
        }
        await get().open(repo)
      },

      async createTree(input) {
        const name = input.name.trim().replace(/\s+/g, '-')
        if (!/^[\w.-]+$/.test(name))
          throw new Error('Use letters, numbers, dots, dashes or underscores for the name.')
        try {
          const tree = await createTreeRepository(github(), {
            name,
            title: input.title || input.name,
          })
          await saveTrees(mergeTrees([tree], get().trees))
          return tree
        } catch (e) {
          const { message, kind } = describeError(e)
          const hint =
            kind === 'auth'
              ? ' Creating repositories needs a token with Administration: Read and write on all repositories.'
              : ''
          throw new Error(message + hint, { cause: e })
        }
      },

      open(repo) {
        const key = repo.toLowerCase()
        const running = pulls.get(key)
        if (running) return running
        const run = (async () => {
          const previous = get().data[key]?.graph ?? null
          try {
            let ref = get().trees.find((t) => t.repo.toLowerCase() === key)
            if (!ref && isFolder(key))
              throw new FolderError('missing', "This folder isn't one of your Families.")
            if (!ref) {
              setData(key, { status: 'loading', graph: null, fetched: 0, total: 0 })
              ref = (await lookupTree(github(), repo)) ?? undefined
              if (!ref) throw new GitHubError('not-found', `${repo} has no .yeraz.json`)
              await saveTrees(mergeTrees(get().trees, [ref]))
            }
            const title = ref.title
            const edits = await loadDirty(key)
            setData(key, { status: 'loading', graph: previous, fetched: 0, total: 0 })
            const onProgress = (p: PullProgress) => {
              // The structure alone is worth drawing while content is fetched; with every
              // leaf cached the content follows within the moment, and a map drawn from the
              // structure would be laid out and mounted only to be replaced.
              if (p.stage === 'structure' && p.missing > 0) {
                const graph = buildGraph(p.model, new Map(), title)
                markNow('graph-built')
                setData(key, { status: 'loading', graph, fetched: 0, total: p.missing })
              } else if (p.stage === 'content') {
                set((s) => {
                  const current = s.data[key]
                  return current?.status === 'loading'
                    ? {
                        data: {
                          ...s.data,
                          [key]: { ...current, fetched: p.fetched, total: p.total },
                        },
                      }
                    : {}
                })
              }
            }
            const pulled = isFolder(key)
              ? await pullFolder(ref, { fs: await folderOf(key), store, onProgress })
              : await pullTree(ref, { client: github(), store, onProgress })
            bases.set(key, {
              ref,
              entries: pulled.entries,
              leaves: pulled.leaves,
              offline: pulled.offline,
            })
            show(key)
            // Edits left from an earlier visit are committed now (ARCHITECTURE.md §5.2).
            if (Object.keys(edits).length) {
              setSync(key, pendingState(key))
              if (!pulled.offline) void autosaveFor(key).flush()
              else setSync(key, { status: 'offline', files: count(key) })
            } else if (!get().sync[key]) setSync(key, { status: 'synced' })
          } catch (e) {
            setData(key, { status: 'error', graph: previous, ...errorOf(e) })
          } finally {
            pulls.delete(key)
          }
        })()
        pulls.set(key, run)
        return run
      },

      async textOf(repo, path) {
        const key = repo.toLowerCase()
        // The map can show a Tree's structure before its content arrives: wait for it.
        await pulls.get(key)
        const pending = (await loadDirty(key))[path]
        if (typeof pending?.text === 'string') return pending.text
        const sha = bases.get(key)?.entries.find((e) => e.path === path)?.sha
        const text = sha && !isLocal(sha) ? await store.get<string>(`blob:${sha}`) : undefined
        if (text === undefined) throw new Error(`No text for ${path}`)
        return text
      },

      async texts(repo) {
        const key = repo.toLowerCase()
        await pulls.get(key)
        const pending = await loadDirty(key)
        const cached = (bases.get(key)?.entries ?? []).filter(
          (e) => e.path.endsWith('.md') && !(e.path in pending) && !isLocal(e.sha),
        )
        const blobs = await store.getMany<string>(cached.map((e) => `blob:${e.sha}`))
        const texts = new Map<string, string>()
        cached.forEach((e, i) => blobs[i] !== undefined && texts.set(e.path, blobs[i]))
        for (const [path, { text }] of Object.entries(pending))
          if (typeof text === 'string' && path.endsWith('.md')) texts.set(path, text)
        return texts
      },

      async assetUrl(repo, path) {
        const key = repo.toLowerCase()
        await pulls.get(key)
        const pending = (await loadDirty(key))[path]?.text
        const sha = bases.get(key)?.entries.find((e) => e.path === path)?.sha
        const id = pending instanceof Uint8Array ? pending : sha && !isLocal(sha) ? sha : null
        if (id === null) return null
        let url = urls.get(id)
        if (!url) {
          const bytes = id instanceof Uint8Array ? id : await bytesOf(repo, path, id)
          url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeOf(path) }))
          urls.set(id, url)
        }
        return url
      },

      files(repo) {
        const key = repo.toLowerCase()
        const pending = dirty.get(key) ?? {}
        const committed = (bases.get(key)?.entries ?? [])
          .filter((e) => e.type === 'blob' && !(e.path in pending))
          .map((e) => e.path)
        const added = Object.entries(pending).filter(([, f]) => f.text !== null)
        return [...committed, ...added.map(([path]) => path)]
      },

      fileSize(repo, path) {
        const key = repo.toLowerCase()
        const pending = dirty.get(key)?.[path]
        if (pending) return pending.text === null ? null : byteLength(pending.text)
        return bases.get(key)?.entries.find((e) => e.path === path)?.size ?? null
      },

      async history(repo, path, after = null) {
        const key = repo.toLowerCase()
        await pulls.get(key)
        if (isFolder(key)) throw new Error('A folder keeps no history of its leaves.')
        const ref = bases.get(key)?.ref
        const head = ref && (await store.get<CachedListing>(`tree:${ref.repo}`))?.head
        if (!ref || !head) throw new Error("This Family hasn't opened yet. Try again in a moment.")
        const id = [ref.repo, head, path, after].join('\n')
        let page = histories.get(id)
        if (!page) {
          page = fetchHistory(github(), ref.repo, head, path, after)
          histories.set(id, page)
          page.catch(() => histories.delete(id))
        }
        return page.catch((e: unknown) => {
          throw new Error(describeError(e).message, { cause: e })
        })
      },

      async planted(repo) {
        const key = repo.toLowerCase()
        await pulls.get(key)
        const ref = bases.get(key)?.ref
        const head = ref && (await store.get<CachedListing>(`tree:${ref.repo}`))?.head
        if (!ref || !head) throw new Error("This Family hasn't opened yet. Try again in a moment.")
        const graph = get().data[key]?.graph
        const leaves = graph ? [...graph.nodes.values()].filter((n) => n.kind === 'leaf') : []
        // ponytail: a folder has no blame, so a leaf is dated by its last change on disk.
        if (isFolder(key)) {
          const stats = (await store.get<Record<string, { modified: number }>>(`stat:${key}`)) ?? {}
          return new Map(
            leaves.map((n) => [n.id, new Date(stats[n.id]?.modified ?? Date.now()).toISOString()]),
          )
        }
        const saved = (await store.get<Record<string, string>>(`planted:${key}`)) ?? {}
        const committed = new Set(bases.get(key)!.entries.map((e) => e.path))
        const missing = leaves.map((n) => n.id).filter((id) => !saved[id] && committed.has(id))
        if (missing.length) {
          try {
            for (const [path, date] of await fetchPlanted(github(), ref.repo, head, missing))
              saved[path] = date
          } catch (e) {
            throw new Error(describeError(e).message, { cause: e })
          }
          await store.set(`planted:${key}`, saved)
        }
        const now = new Date().toISOString()
        return new Map(leaves.map((n) => [n.id, saved[n.id] ?? now]))
      },

      async versionText(repo, blob) {
        try {
          return (await blobTexts(github(), store, repo, [blob])).get(blob) ?? ''
        } catch (e) {
          throw new Error(describeError(e).message, { cause: e })
        }
      },

      async restore(repo, path, blob) {
        const text = await get().versionText(repo, blob)
        await get().apply(repo, [{ path, text }])
        await get().flush(repo)
      },

      async apply(repo, changes) {
        const key = repo.toLowerCase()
        const edits = await loadDirty(key)
        const committed = new Map((bases.get(key)?.entries ?? []).map((e) => [e.path, e.sha]))
        for (const { path, text } of changes) {
          const existing = edits[path]
          const base = existing ? existing.base : (committed.get(path) ?? null)
          // A file made on this device and deleted before it was committed: forget it.
          if (text === null && base === null) delete edits[path]
          else edits[path] = { text, base }
        }
        await saveDirty(key)
        show(key)
        const save = autosaveFor(key)
        save.touch()
        setSync(key, pendingState(key))
      },

      async renameTree(repo, title) {
        const key = repo.toLowerCase()
        const name = title.replace(/\s+/g, ' ').trim()
        if (!name) throw new Error('A Family needs a name.')
        await inTurn(key, async () => {
          const { text, marker } = await readMarker(repo)
          if (markerFields(text).title === name) return
          await writeMarker(repo, text, { ...marker, name })
          await retitle(key, { title: name })
        })
      },

      async setColor(repo, color, tree) {
        const key = repo.toLowerCase()
        await inTurn(key, () => colour(repo, color, tree))
      },

      async flush(repo) {
        const key = repo.toLowerCase()
        if (count(key)) await autosaveFor(key).flush()
      },

      async flushAll() {
        await Promise.all(
          [...dirty.keys()].filter((key) => count(key)).map((key) => autosaveFor(key).flush()),
        )
      },

      dismissConflict(repo) {
        const key = repo.toLowerCase()
        setSync(key, pendingState(key))
      },
    }
  })
}

const appStore = openStore()
export const session = createSession({
  store: appStore,
  tokens: tokenStore(appStore, desktopInvoke),
  api: githubApi,
  folders: desktopInvoke
    ? desktopFolders(desktopInvoke)
    : (browserFolders() ??
      (typeof indexedDB === 'undefined' ? null : deviceFolders(appStore, chooseFiles))),
})
export const useSession = <T>(selector: (s: SessionState) => T): T => useStore(session, selector)
