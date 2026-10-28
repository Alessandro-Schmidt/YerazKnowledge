// The ways to see a Family (design/views/README.md): the radial map and seven others. Which one
// shows is a personal preference, saved per device like the theme; every view reads the
// same graph and shares the selection, so switching keeps the selected leaf.

export const VIEW_IDS = [
  'map',
  'mind',
  'outline',
  'columns',
  'treemap',
  'graph',
  'rings',
  'atlas',
] as const
export type ViewId = (typeof VIEW_IDS)[number]

export const VIEWS: Record<ViewId, { label: string; note: string }> = {
  map: { label: 'Map', note: 'Every Tree around its core, threads bundled between them' },
  mind: { label: 'Mind map', note: 'Trees either side of the core, leaves in rows' },
  outline: { label: 'Outline', note: 'A table of contents with first lines and word counts' },
  columns: { label: 'Columns', note: 'One level per column, the leaf open beside them' },
  treemap: { label: 'Treemap', note: 'Each leaf a tile as large as its words' },
  graph: { label: 'Graph', note: 'Leaves as a network of threads, each Tree a hull' },
  rings: { label: 'Rings', note: 'One ring per month, each leaf where it was planted' },
  atlas: { label: 'Atlas', note: 'Each Tree an island, each leaf a peak as high as its words' },
}

/**
 * How a view shows the selection on a wide screen: the floating Peek, the Peek docked as
 * its last column (Columns), or the view's own panel, where the Peek opens only as a full
 * page (`Open leaf`). Phones use the Peek's sheet, but for Rings (design/views/screens/15).
 */
export const PANEL: Record<ViewId, 'float' | 'dock' | 'own'> = {
  map: 'float',
  mind: 'float',
  outline: 'float',
  columns: 'dock',
  treemap: 'float',
  graph: 'own',
  rings: 'own',
  atlas: 'own',
}

/** 24-unit stroke icons for the switcher (design/views/generators/common.py, ICONS). */
export const VIEW_ICONS: Record<ViewId, string> = {
  map: 'M12 9.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4zM12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 9.8V3.5M14 13l5 3.5M10 13l-5 3.5',
  mind: 'M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 12h2.5c3 0 3-6 7-6M9.5 12c3 0 3 6 7 6M18.5 4.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM18.5 16.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z',
  outline: 'M4.5 6h2M9.5 6h10M7.5 12h2M12.5 12h7M7.5 18h2M12.5 18h7',
  columns:
    'M6 4.5h12a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17V7A2.5 2.5 0 0 1 6 4.5zM9.2 4.5v15M14.8 4.5v15',
  treemap:
    'M6 4.5h12a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17V7A2.5 2.5 0 0 1 6 4.5zM11 4.5v15M11 11.5h9.5M3.5 14h7.5',
  graph:
    'M6 5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM18 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM8 7.3l8-1M7.1 9.2l4.8 7M17.3 7.9l-3.6 8.2',
  rings:
    'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 6.6c3.2 0 5.3 2.3 5.3 5.4s-2.4 5.3-5.3 5.3-5.4-2.3-5.4-5.3 2.3-5.4 5.4-5.4zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  atlas: 'M2.5 18.5l6-9 3.6 5.2 2.6-3.4 6.8 7.2zM7.2 11.4l1.3 1 1.2-1',
}

/** localStorage key of the device's view. */
export const VIEW_KEY = 'yeraz-view'

const storage = (): Storage | undefined => {
  try {
    return globalThis.localStorage
  } catch {
    return undefined // blocked storage throws on access
  }
}

const isView = (v: unknown): v is ViewId => (VIEW_IDS as readonly unknown[]).includes(v)

/** The view saved on this device; the map when none is, or it's unknown. */
export function savedView(store = storage()): ViewId {
  try {
    const v = store?.getItem(VIEW_KEY)
    return isView(v) ? v : 'map'
  } catch {
    return 'map'
  }
}

const listeners = new Set<() => void>()

export function saveView(view: ViewId, store = storage()): void {
  try {
    store?.setItem(VIEW_KEY, view)
  } catch {
    // Private windows may refuse storage; the view still changes for this visit.
  }
  current = view
  for (const l of listeners) l()
}

let current: ViewId | null = null

/** For useSyncExternalStore: the view, kept in memory once read, and its changes. */
export const viewStore = {
  get: (): ViewId => (current ??= savedView()),
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

/** How the map orders a Tree's leaves and branches, on this device: when planted (default) or by name. */
export type MapOrder = 'planted' | 'name'
const ORDER_KEY = 'yeraz-map-order'

export function mapOrder(store = storage()): MapOrder {
  try {
    return store?.getItem(ORDER_KEY) === 'name' ? 'name' : 'planted'
  } catch {
    return 'planted'
  }
}

export function saveMapOrder(order: MapOrder, store = storage()): void {
  try {
    store?.setItem(ORDER_KEY, order)
  } catch {
    // Private windows may refuse storage; the map keeps its order for this visit.
  }
}
