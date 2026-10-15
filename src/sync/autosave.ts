// When edits are committed (ARCHITECTURE.md §5.2): two minutes after the last edit, or
// right away when the app is hidden, the user leaves the leaf, or presses Ctrl/Cmd+S.
// One autosave per Tree. Commits never overlap: a flush during a commit runs after it.

export const IDLE_MS = 2 * 60 * 1000

export interface Autosave {
  /** An edit happened: restart the two-minute wait. */
  touch(): void
  /** Commit now, if anything is waiting. */
  flush(): Promise<void>
  /** When the next commit is due (ms since epoch), or null when nothing waits. */
  due(): number | null
  dispose(): void
}

export function createAutosave(
  commit: () => Promise<void>,
  options: { delay?: number; now?: () => number } = {},
): Autosave {
  const delay = options.delay ?? IDLE_MS
  const now = options.now ?? Date.now
  let timer: ReturnType<typeof setTimeout> | null = null
  let dueAt: number | null = null
  let running: Promise<void> | null = null
  let again = false

  const run = async (): Promise<void> => {
    if (timer) clearTimeout(timer)
    timer = null
    dueAt = null
    if (running) {
      again = true
      return running
    }
    running = (async () => {
      try {
        await commit()
      } finally {
        running = null
      }
      if (again) {
        again = false
        await run()
      }
    })()
    return running
  }

  return {
    touch() {
      if (timer) clearTimeout(timer)
      dueAt = now() + delay
      timer = setTimeout(() => void run(), delay)
    },
    flush: run,
    due: () => dueAt,
    dispose() {
      if (timer) clearTimeout(timer)
      timer = null
      dueAt = null
    },
  }
}
