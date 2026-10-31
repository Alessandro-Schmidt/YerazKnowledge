// What the insert menu shows, in which order, and the person's own blocks of text (owner's
// request): set in Settings › Insert menu, saved per device like the theme. Pure, with no
// editor code, so the Settings page doesn't load CodeMirror.

export type ListKind = 'todo' | 'ordered' | 'bullet'
export type InsertKind =
  ListKind | 'mention' | 'table' | 'code' | 'image' | 'file' | 'leaf' | 'branch'

export const BUILT_IN: readonly { kind: InsertKind; label: string }[] = [
  { kind: 'todo', label: 'To-do list' },
  { kind: 'ordered', label: 'Numbered list' },
  { kind: 'bullet', label: 'Bullet list' },
  { kind: 'mention', label: 'Mention a leaf' },
  { kind: 'table', label: 'Table' },
  { kind: 'code', label: 'Code block' },
  { kind: 'image', label: 'Image from files' },
  { kind: 'file', label: 'Attach a file' },
  { kind: 'leaf', label: 'New leaf' },
  { kind: 'branch', label: 'New branch' },
]

/** A named block of Markdown, inserted as it is written. */
export interface Block {
  id: string
  name: string
  text: string
}

/** Entry keys are a built-in kind or `block:<id>`. */
export interface MenuSetup {
  order: string[]
  hidden: string[]
  blocks: Block[]
}

export interface Entry {
  key: string
  label: string
  /** The block's Markdown; absent for a built-in item. */
  text?: string
  hidden: boolean
}

export const DEFAULT_SETUP: MenuSetup = { order: [], hidden: [], blocks: [] }

export const blockKey = (id: string) => `block:${id}`

/**
 * Every item, in the menu's order: the saved order first, then whatever it doesn't name yet
 * (a block just made, an item a later version adds) in its default place.
 */
export function entries(setup: MenuSetup): Entry[] {
  const all = new Map<string, Omit<Entry, 'hidden'>>()
  for (const b of BUILT_IN) all.set(b.kind, { key: b.kind, label: b.label })
  for (const b of setup.blocks)
    all.set(blockKey(b.id), { key: blockKey(b.id), label: b.name, text: b.text })
  const keys = [...new Set([...setup.order.filter((k) => all.has(k)), ...all.keys()])]
  const hidden = new Set(setup.hidden)
  return keys.map((k) => ({ ...all.get(k)!, hidden: hidden.has(k) }))
}

/** What the menu shows. */
export const shown = (setup: MenuSetup) => entries(setup).filter((e) => !e.hidden)

/** The setup with the item at `key` moved by `by` places, no further than either end. */
export function move(setup: MenuSetup, key: string, by: number): MenuSetup {
  const order = entries(setup).map((e) => e.key)
  const at = order.indexOf(key)
  const to = Math.min(Math.max(at + by, 0), order.length - 1)
  if (at < 0 || to === at) return setup
  order.splice(at, 1)
  order.splice(to, 0, key)
  return { ...setup, order }
}

export function setHidden(setup: MenuSetup, key: string, hide: boolean): MenuSetup {
  const hidden = setup.hidden.filter((k) => k !== key)
  return { ...setup, hidden: hide ? [...hidden, key] : hidden }
}

/** Adds a block, or replaces the one with the same id. */
export function putBlock(setup: MenuSetup, block: Block): MenuSetup {
  const at = setup.blocks.findIndex((b) => b.id === block.id)
  const blocks = [...setup.blocks]
  if (at < 0) blocks.push(block)
  else blocks[at] = block
  return { ...setup, blocks }
}

export function removeBlock(setup: MenuSetup, id: string): MenuSetup {
  const key = blockKey(id)
  return {
    order: setup.order.filter((k) => k !== key),
    hidden: setup.hidden.filter((k) => k !== key),
    blocks: setup.blocks.filter((b) => b.id !== id),
  }
}

/** localStorage key of the device's menu. */
export const MENU_KEY = 'yeraz-insert-menu'

const storage = (): Storage | undefined => {
  try {
    return globalThis.localStorage
  } catch {
    return undefined // blocked storage throws on access
  }
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []

/** The setup saved on this device; the default when none is, or it can't be read. */
export function savedSetup(store = storage()): MenuSetup {
  try {
    const raw: unknown = JSON.parse(store?.getItem(MENU_KEY) ?? 'null')
    if (!raw || typeof raw !== 'object') return DEFAULT_SETUP
    const r = raw as Record<string, unknown>
    const blocks = (Array.isArray(r.blocks) ? r.blocks : []).filter(
      (b): b is Block =>
        !!b &&
        typeof (b as Block).id === 'string' &&
        typeof (b as Block).name === 'string' &&
        typeof (b as Block).text === 'string',
    )
    return { order: strings(r.order), hidden: strings(r.hidden), blocks }
  } catch {
    return DEFAULT_SETUP
  }
}

let current: MenuSetup | null = null
const listeners = new Set<() => void>()

export function saveSetup(setup: MenuSetup, store = storage()): void {
  try {
    store?.setItem(MENU_KEY, JSON.stringify(setup))
  } catch {
    // Private windows may refuse storage; the menu still changes for this visit.
  }
  current = setup
  for (const l of listeners) l()
}

/** For useSyncExternalStore, and the menu as it opens: the setup, kept in memory once read. */
export const setupStore = {
  get: (): MenuSetup => (current ??= savedSetup()),
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
