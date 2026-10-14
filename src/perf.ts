// Performance marks for the budget tests (development-plan.md §7.4). They exist only in
// end-to-end builds (VITE_E2E=1); every other build compiles the call to nothing.

export function mark(name: 'map-painted' | 'peek-painted'): void {
  if (import.meta.env.VITE_E2E === '1') {
    requestAnimationFrame(() => setTimeout(() => performance.mark(`yeraz:${name}`)))
  }
}

/** Marks the moment an input arrives, before any work: the start of a measured interaction. */
export function markNow(name: 'select' | 'tree-open'): void {
  if (import.meta.env.VITE_E2E === '1') performance.mark(`yeraz:${name}`)
}
