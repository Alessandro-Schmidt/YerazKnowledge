// Where the GitHub token lives (ARCHITECTURE.md §9): IndexedDB on the web, the OS keychain
// in the desktop app (src-tauri/src/lib.rs). Only the token; everything else stays in the
// key/value store on both.

import type { KeyValueStore } from './db'

const KEY = 'session:token'

export type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

export interface TokenStore {
  get(): Promise<string | undefined>
  /** `undefined` forgets the token. */
  set(token: string | undefined): Promise<void>
}

export function tokenStore(store: KeyValueStore, invoke?: Invoke): TokenStore {
  if (!invoke) return { get: () => store.get<string>(KEY), set: (token) => store.set(KEY, token) }
  return {
    get: async () => (await invoke<string | null>('get_token')) ?? undefined,
    set: async (token) =>
      void (await (token === undefined ? invoke('delete_token') : invoke('set_token', { token }))),
  }
}

/** Tauri's IPC when running in the desktop app; loaded on demand, so the web never ships it. */
export const desktopInvoke: Invoke | undefined =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    ? async (cmd, args) => (await import('@tauri-apps/api/core')).invoke(cmd, args)
    : undefined
