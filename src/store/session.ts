// The app's one store (Zustand): who is signed in, which Trees exist, each Tree's graph,
// and the edits not committed yet. Persisted per device: the token, the last known Trees,
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
import { createTreeRepository, discoverTrees, lookupTree, type TreeRef } from '../github/graphql'
import { buildGraph, type Graph } from '../model/graph'
import type { ParsedLeaf } from '../model/parse'
import { gitBlobSha } from '../model/sha'
import { buildTree } from '../model/tree'
import { assetBytes, mimeOf } from '../sync/assets'
import { createAutosave, type Autosave } from '../sync/autosave'
import { isLocal, overlay } from '../sync/overlay'
import { fillContent, pullTree, type CachedListing } from '../sync/pull'
import { byteLength, pushTree, type Dirty } from '../sync/push'
import { sameContent, type FileChange } from '../sync/structure'
import { openStore, type KeyValueStore } from './db'
import { desktopInvoke, tokenStore, type TokenStore } from './token'

export type TreeData =
  | { status: 'loading'; graph: Graph | null; fetched: number; total: number }
  | { status: 'ready'; graph: Graph; offline: boolean }
  | { status: 'error'; graph: Graph | null; error: string; kind: GitHubError['kind'] | 'unknown' }

/** What the top bar says about saving (development-plan.md M2 step 4). */
export type SyncState =
  | { status: 'synced' }
  | { status: 'pending'; due: number | null; files: number }
  | { status: 'saving'; files: number }
  | { status: 'offline'; files: number }
  | { status: 'conflict'; copies: string[] }
  | { status: 'error'; message: string; files: number }

export interface SessionState {
  phase: 'starting' | 'signed-out' | 'signed-in'
  token: string | null
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
  /** Creates a private repository holding a new Tree. Throws a message on failure. */
  createTree(input: { name: string; title: string }): Promise<TreeRef>
  /** Pulls a Tree; concurrent calls for the same Tree share one pull. */
  open(repo: string): Promise<void>
  /** A leaf's current text: the pending edit, or the committed version. */
  textOf(repo: string, path: string): Promise<string>
  /** A URL showing an attachment (`assets/…`), or null when the Tree has no such file. */
  assetUrl(repo: string, path: string): Promise<string | null>
  /** Every file path in an open Tree, pending edits included. */
  files(repo: string): string[]
  /** A file's size in bytes, pending edits included, without downloading it; null when unknown. */
  fileSize(repo: string, path: string): number | null
  /** Records edits (text, or null to delete); they are committed by the autosave. */
  apply(repo: string, changes: readonly FileChange[]): Promise<void>
  /** Renames a Tree: the name in its `.yeraz.json`, committed by the autosave. Throws a message. */
  renameTree(repo: string, title: string): Promise<void>
  /** Commits a Tree's pending edits now. */
  flush(repo: string): Promise<void>
  /** Commits every Tree's pending edits now (app hidden, Ctrl/Cmd+S, back online). */
  flushAll(): Promise<void>
  /** Forgets a conflict notice once it has been read. */
  dismissConflict(repo: string): void
}

const KEYS = { trees: 'session:trees', connected: 'session:connected' }
const dirtyKey = (repo: string) => `dirty:${repo.toLowerCase()}`

/** The file that marks a Tree and holds its name (ARCHITECTURE.md §4). */
const MARKER = '.yeraz.json'

/** The name a `.yeraz.json` text gives, or null. */
function nameIn(text: unknown): string | null {
  if (typeof text !== 'string') return null
  try {
    const name = (JSON.parse(text) as { name?: unknown } | null)?.name
    return typeof name === 'string' && name.trim() ? name.trim() : null
  } catch {
    return null
  }
}

export function describeError(e: unknown): {
  message: string
  kind: GitHubError['kind'] | 'unknown'
} {
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
  let client: GitHubClient | null = null

  return createStore<SessionState>()((set, get) => {
    const github = () => {
      const token = get().token
      if (!token) throw new Error('Not signed in')
      return (client ??= createGitHubClient({ token, api: api() }))
    }
    const connected = async () => (await store.get<string[]>(KEYS.connected)) ?? []
    /** A name typed on this device and not committed yet wins over what GitHub last said. */
    const pendingTitle = (key: string) => nameIn(dirty.get(key)?.[MARKER]?.text)
    const titled = (ref: TreeRef): TreeRef => {
      const title = pendingTitle(ref.repo.toLowerCase())
      return title && title !== ref.title ? { ...ref, title } : ref
    }
    const saveTrees = async (list: TreeRef[]) => {
      const trees = list.map(titled)
      set({ trees })
      await store.set(KEYS.trees, trees)
    }
    /** Gives a Tree its new name everywhere it is shown. */
    const retitle = async (key: string, title: string) => {
      const base = bases.get(key)
      if (base) bases.set(key, { ...base, ref: { ...base.ref, title } })
      await saveTrees(get().trees.map((t) => (t.repo.toLowerCase() === key ? { ...t, title } : t)))
    }
    const setData = (key: string, data: TreeData) =>
      set((s) => ({ data: { ...s.data, [key]: data } }))
    const setSync = (key: string, state: SyncState) =>
      set((s) => ({ sync: { ...s.sync, [key]: state } }))
    const count = (key: string) => Object.keys(dirty.get(key) ?? {}).length

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
      setData(key, {
        status: 'ready',
        graph: buildGraph(buildTree(entries), leaves, pendingTitle(key) ?? base.ref.title),
        offline: base.offline,
      })
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
        const pushed = await pushTree(base.ref, snapshot, { client: github(), store })
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
          else now.base = sent.text === null ? null : await gitBlobSha(sent.text)
        }
        await saveDirty(key)
        const committedName = nameIn(snapshot[MARKER]?.text)
        if (committedName) await retitle(key, committedName)
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
        save = createAutosave(
          () => commit(key),
          deps.autosaveDelay === undefined ? {} : { delay: deps.autosaveDelay },
        )
        autosaves.set(key, save)
      }
      return save
    }

    return {
      phase: 'starting',
      token: null,
      trees: [],
      discovery: 'idle',
      data: {},
      sync: {},

      async start() {
        const [token, trees] = await Promise.all([tokens.get(), store.get<TreeRef[]>(KEYS.trees)])
        set({ phase: token ? 'signed-in' : 'signed-out', token: token ?? null, trees: trees ?? [] })
      },

      async signIn(token) {
        client = createGitHubClient({ token: token.trim(), api: api() })
        set({ token: token.trim() })
        try {
          const found = await discoverTrees(client)
          await tokens.set(token.trim())
          await saveTrees(found)
          set({ phase: 'signed-in', discovery: 'done' })
        } catch (e) {
          client = null
          set({ token: null })
          throw new Error(describeError(e).message, { cause: e })
        }
      },

      async signOut() {
        // Pending edits stay on this device, keyed by repository, for the next sign-in.
        for (const save of autosaves.values()) save.dispose()
        autosaves.clear()
        client = null
        pulls.clear()
        bases.clear()
        dirty.clear()
        await Promise.all([tokens.set(undefined), store.set(KEYS.trees, undefined)])
        set({ phase: 'signed-out', token: null, trees: [], data: {}, sync: {}, discovery: 'idle' })
      },

      async discover() {
        if (get().discovery === 'loading') return
        set({ discovery: 'loading' })
        try {
          const found = await discoverTrees(github())
          const extra = get().trees.filter((t) => found.every((f) => f.repo !== t.repo))
          const keep = new Set((await connected()).map((r) => r.toLowerCase()))
          await saveTrees(
            mergeTrees(
              found,
              extra.filter((t) => keep.has(t.repo.toLowerCase())),
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
        if (!tree) throw new Error(`${name} isn't a Tree yet: add a .yeraz.json file at its root.`)
        await store.set(KEYS.connected, [...new Set([...(await connected()), tree.repo])])
        await saveTrees(mergeTrees(get().trees, [tree]))
        return tree
      },

      async createTree(input) {
        const name = input.name.trim().replace(/\s+/g, '-')
        if (!/^[\w.-]+$/.test(name))
          throw new Error('Use letters, numbers, dots, dashes or underscores for the name.')
        try {
          const tree = await createTreeRepository(github(), '', {
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
            if (!ref) {
              setData(key, { status: 'loading', graph: null, fetched: 0, total: 0 })
              ref = (await lookupTree(github(), repo)) ?? undefined
              if (!ref) throw new GitHubError('not-found', `${repo} has no .yeraz.json`)
              await saveTrees(mergeTrees(get().trees, [ref]))
            }
            const title = ref.title
            const edits = await loadDirty(key)
            setData(key, { status: 'loading', graph: previous, fetched: 0, total: 0 })
            const pulled = await pullTree(ref, {
              client: github(),
              store,
              onProgress: (p) => {
                if (p.stage === 'structure' && (p.missing > 0 || !previous)) {
                  setData(key, {
                    status: 'loading',
                    graph: buildGraph(p.model, new Map(), title),
                    fetched: 0,
                    total: p.missing,
                  })
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
              },
            })
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
            const { message, kind } = describeError(e)
            setData(key, { status: 'error', graph: previous, error: message, kind })
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

      async assetUrl(repo, path) {
        const key = repo.toLowerCase()
        await pulls.get(key)
        const pending = (await loadDirty(key))[path]?.text
        const sha = bases.get(key)?.entries.find((e) => e.path === path)?.sha
        const id = pending instanceof Uint8Array ? pending : sha && !isLocal(sha) ? sha : null
        if (id === null) return null
        let url = urls.get(id)
        if (!url) {
          const bytes =
            id instanceof Uint8Array ? id : await assetBytes(repo, id, { client: github(), store })
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
        if (!name) throw new Error('A Tree needs a name.')
        await pulls.get(key)
        const base = bases.get(key)
        if (!base) throw new Error("This Tree hasn't opened yet. Try again in a moment.")
        const pending = (await loadDirty(key))[MARKER]?.text
        let text = typeof pending === 'string' ? pending : '{}\n'
        const sha = base.entries.find((e) => e.path === MARKER)?.sha
        if (pending === undefined && sha && !isLocal(sha)) {
          try {
            text = new TextDecoder().decode(
              await assetBytes(repo, sha, { client: github(), store }),
            )
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
            ".yeraz.json isn't valid JSON, so the name can't be changed here. Fix the file on GitHub first.",
          )
        if (nameIn(text) === name) return
        // Written back the way it was laid out: on one line, or indented as before.
        const indent = /^\{\s*\n([ \t]+)"/.exec(text)?.[1]
        await get().apply(repo, [
          { path: MARKER, text: `${JSON.stringify({ ...marker, name }, null, indent)}\n` },
        ])
        await retitle(key, name)
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
})
export const useSession = <T>(selector: (s: SessionState) => T): T => useStore(session, selector)
