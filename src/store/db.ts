// Local storage as a key/value store. In the browser it is IndexedDB (idb-keyval);
// tests and browsers without IndexedDB use the in-memory version.
// Keys: `blob:<sha>` text · `leaf:<sha>` parsed leaf · `tree:<owner/name>` listing + ETag.

import { createStore, get, getMany, set, setMany } from 'idb-keyval'

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>
  getMany<T>(keys: string[]): Promise<(T | undefined)[]>
  set(key: string, value: unknown): Promise<void>
  setMany(entries: [string, unknown][]): Promise<void>
}

export function memoryStore(): KeyValueStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>()
  // Structured clone, as IndexedDB does, so callers can't mutate stored values by accident.
  return {
    data,
    get: async <T>(key: string) => structuredClone(data.get(key)) as T | undefined,
    getMany: async <T>(keys: string[]) =>
      keys.map((k) => structuredClone(data.get(k)) as T | undefined),
    set: async (key, value) => void data.set(key, structuredClone(value)),
    setMany: async (entries) => entries.forEach(([k, v]) => data.set(k, structuredClone(v))),
  }
}

export function idbStore(): KeyValueStore {
  const store = createStore('yeraz', 'kv')
  return {
    get: (key) => get(key, store),
    getMany: (keys) => getMany(keys, store),
    set: (key, value) => set(key, value, store),
    setMany: (entries) => setMany(entries, store),
  }
}

/** IndexedDB when the browser has it, memory otherwise. */
export function openStore(): KeyValueStore {
  return typeof indexedDB === 'undefined' ? memoryStore() : idbStore()
}
