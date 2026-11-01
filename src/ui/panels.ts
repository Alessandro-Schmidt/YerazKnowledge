// Panel widths (issue #80): the Explorer and the Peek (floating, or docked beside the
// Columns) are dragged wider or narrower by their inner edge, and each width is saved for
// this device, like the theme and the view. The page holds them as CSS variables.

export type Panel = 'explorer' | 'peek' | 'dock'

/**
 * The height (px) of a phone's bottom sheet, as Peek.module.css draws it: 60% of the screen,
 * at most 520 px. The map keeps that much free below what it centres.
 */
export const SHEET_HEIGHT = () => Math.round(Math.min(window.innerHeight * 0.6, 520))

export const PANELS: Record<Panel, { initial: number; min: number; max: number }> = {
  explorer: { initial: 272, min: 200, max: 520 },
  peek: { initial: 420, min: 320, max: 960 },
  dock: { initial: 640, min: 360, max: 1100 },
}

export type Widths = Record<Panel, number>

/** localStorage key of the device's panel widths. */
export const WIDTHS_KEY = 'yeraz-panels'

/** A width the panel can take: whole pixels, between its least and most. */
export const clampWidth = (panel: Panel, width: number) =>
  Math.round(Math.min(PANELS[panel].max, Math.max(PANELS[panel].min, width)))

const storage = (): Storage | undefined => {
  try {
    return globalThis.localStorage
  } catch {
    return undefined // blocked storage throws on access
  }
}

const initial = (): Widths => ({
  explorer: PANELS.explorer.initial,
  peek: PANELS.peek.initial,
  dock: PANELS.dock.initial,
})

/** The widths saved on this device; each one unsaved or unreadable is its initial width. */
export function savedWidths(store = storage()): Widths {
  const widths = initial()
  try {
    const saved = JSON.parse(store?.getItem(WIDTHS_KEY) ?? '{}') as Partial<Widths>
    for (const panel of Object.keys(widths) as Panel[]) {
      const w = saved[panel]
      if (typeof w === 'number' && Number.isFinite(w)) widths[panel] = clampWidth(panel, w)
    }
  } catch {
    // Unreadable: the initial widths.
  }
  return widths
}

const listeners = new Set<() => void>()
let current: Widths | null = null

/** Saves one panel's width (clamped); null puts it back to its initial width. */
export function saveWidth(panel: Panel, width: number | null, store = storage()): void {
  const next = {
    ...widthStore.get(),
    [panel]: width === null ? PANELS[panel].initial : clampWidth(panel, width),
  }
  try {
    store?.setItem(WIDTHS_KEY, JSON.stringify(next))
  } catch {
    // Private windows may refuse storage; the width still changes for this visit.
  }
  current = next
  for (const l of listeners) l()
}

/** For useSyncExternalStore: the widths, kept in memory once read, and their changes. */
export const widthStore = {
  get: (): Widths => (current ??= savedWidths()),
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

/** The CSS variable each panel's width is in. */
export const widthVar = (panel: Panel) => `--${panel}-w`

/** The widths as the page's CSS variables. */
export const widthVars = (w: Widths) =>
  Object.fromEntries((Object.keys(w) as Panel[]).map((p) => [widthVar(p), `${w[p]}px`]))
