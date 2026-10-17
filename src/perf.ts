// Performance marks for the budget tests (development-plan.md §7.4). They exist only in
// end-to-end builds (VITE_E2E=1); every other build compiles the calls to nothing.

declare global {
  interface Window {
    /** The budget tests read the marks here: start times in ms, oldest first. */
    __yerazPerf?: { marks(name: string): number[] }
  }
}

if (import.meta.env.VITE_E2E === '1')
  window.__yerazPerf = {
    marks: (name) => performance.getEntriesByName(`yeraz:${name}`).map((e) => e.startTime),
  }

/** Marks the next frame after this one is painted: the end of a measured interaction. */
export function mark(name: 'map-painted' | 'peek-painted' | 'editor-painted'): void {
  if (import.meta.env.VITE_E2E === '1') {
    requestAnimationFrame(() => setTimeout(() => performance.mark(`yeraz:${name}`)))
  }
}

/**
 * Marks this moment: an input arriving, before any work (the start of an interaction), or
 * the end of synchronous work, such as a keystroke applied to the editor's text and DOM.
 */
export function markNow(name: 'select' | 'tree-open' | 'keystroke' | 'keystroke-done'): void {
  if (import.meta.env.VITE_E2E === '1') performance.mark(`yeraz:${name}`)
}
