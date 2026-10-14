// The app's one store (Zustand): who is signed in, which Trees exist, and each Tree's
// graph once pulled. Persisted per device: the token, the last known Trees and the
// repositories connected by hand. Trees are found again on every Home visit (§5.3).

import { createStore, type StoreApi } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { createGitHubClient, GitHubError, type GitHubClient } from '../github/client'
import { githubApi } from '../github/endpoint'
import { discoverTrees, lookupTree, type TreeRef } from '../github/graphql'
import { buildGraph, type Graph } from '../model/graph'
import { pullTree } from '../sync/pull'
import { openStore, type KeyValueStore } from './db'

export type TreeData =
  | { status: 'loading'; graph: Graph | null; fetched: number; total: number }
  | { status: 'ready'; graph: Graph; offline: boolean }
  | { status: 'error'; graph: Graph | null; error: string; kind: GitHubError['kind'] | 'unknown' }

export interface SessionState {
  phase: 'starting' | 'signed-out' | 'signed-in'
  token: string | null
  login: string | null
  trees: TreeRef[]
  discovery: 'idle' | 'loading' | 'done' | 'error'
  data: Record<string, TreeData>
  start(): Promise<void>
  /** Checks the token by finding the user's Trees. Throws a message for the token screen. */
  signIn(token: string): Promise<void>
  signOut(): Promise<void>
  discover(): Promise<void>
  /** Adds a repository by `owner/name`. Throws a message when it isn't a Tree. */
  connect(repo: string): Promise<TreeRef>
  /** Pulls a Tree; concurrent calls for the same Tree share one pull. */
  open(repo: string): Promise<void>
}

const KEYS = { token: 'session:token', trees: 'session:trees', connected: 'session:connected' }

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
  }
  return { message: messages[e.kind], kind: e.kind }
}

const merge = (a: TreeRef[], b: TreeRef[]) => {
  const seen = new Map<string, TreeRef>()
  for (const t of [...a, ...b]) seen.set(t.repo.toLowerCase(), t)
  return [...seen.values()]
}

export function createSession(deps: {
  store: KeyValueStore
  api?: () => string
}): StoreApi<SessionState> {
  const { store } = deps
  const api = deps.api ?? (() => 'https://api.github.com')
  const pulls = new Map<string, Promise<void>>()
  let client: GitHubClient | null = null

  return createStore<SessionState>()((set, get) => {
    const github = () => {
      const token = get().token
      if (!token) throw new Error('Not signed in')
      return (client ??= createGitHubClient({ token, api: api() }))
    }
    const connected = async () => (await store.get<string[]>(KEYS.connected)) ?? []

    const saveTrees = async (trees: TreeRef[]) => {
      set({ trees })
      await store.set(KEYS.trees, trees)
    }

    return {
      phase: 'starting',
      token: null,
      login: null,
      trees: [],
      discovery: 'idle',
      data: {},

      async start() {
        const [token, trees] = await Promise.all([
          store.get<string>(KEYS.token),
          store.get<TreeRef[]>(KEYS.trees),
        ])
        set({ phase: token ? 'signed-in' : 'signed-out', token: token ?? null, trees: trees ?? [] })
      },

      async signIn(token) {
        client = createGitHubClient({ token: token.trim(), api: api() })
        set({ token: token.trim() })
        try {
          const found = await discoverTrees(client)
          await store.set(KEYS.token, token.trim())
          await saveTrees(found)
          set({ phase: 'signed-in', discovery: 'done' })
        } catch (e) {
          client = null
          set({ token: null })
          throw new Error(describeError(e).message, { cause: e })
        }
      },

      async signOut() {
        client = null
        pulls.clear()
        await Promise.all([store.set(KEYS.token, undefined), store.set(KEYS.trees, undefined)])
        set({ phase: 'signed-out', token: null, trees: [], data: {}, discovery: 'idle' })
      },

      async discover() {
        if (get().discovery === 'loading') return
        set({ discovery: 'loading' })
        try {
          const found = await discoverTrees(github())
          const extra = get().trees.filter((t) => found.every((f) => f.repo !== t.repo))
          const keep = new Set((await connected()).map((r) => r.toLowerCase()))
          await saveTrees(
            merge(
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
        await saveTrees(merge(get().trees, [tree]))
        return tree
      },

      open(repo) {
        const key = repo.toLowerCase()
        const running = pulls.get(key)
        if (running) return running
        const run = (async () => {
          const setData = (data: TreeData) => set((s) => ({ data: { ...s.data, [key]: data } }))
          const previous = get().data[key]?.graph ?? null
          try {
            let ref = get().trees.find((t) => t.repo.toLowerCase() === key)
            if (!ref) {
              setData({ status: 'loading', graph: null, fetched: 0, total: 0 })
              ref = (await lookupTree(github(), repo)) ?? undefined
              if (!ref) throw new GitHubError('not-found', `${repo} has no .yeraz.json`)
              await saveTrees(merge(get().trees, [ref]))
            }
            const title = ref.title
            setData({ status: 'loading', graph: previous, fetched: 0, total: 0 })
            const pulled = await pullTree(ref, {
              client: github(),
              store,
              onProgress: (p) => {
                if (p.stage === 'structure' && (p.missing > 0 || !previous)) {
                  setData({
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
            setData({
              status: 'ready',
              graph: buildGraph(pulled.model, pulled.leaves, title),
              offline: pulled.offline,
            })
          } catch (e) {
            const { message, kind } = describeError(e)
            setData({ status: 'error', graph: previous, error: message, kind })
          } finally {
            pulls.delete(key)
          }
        })()
        pulls.set(key, run)
        return run
      },
    }
  })
}

/** Reads a leaf's text from the local cache by blob SHA. */
export const readBlob = (sha: string) => appStore.get<string>(`blob:${sha}`)

const appStore = openStore()
export const session = createSession({ store: appStore, api: githubApi })
export const useSession = <T>(selector: (s: SessionState) => T): T => useStore(session, selector)
