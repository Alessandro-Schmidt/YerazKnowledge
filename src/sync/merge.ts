// When another device committed first (ARCHITECTURE.md §5.2): three-way merge each file
// we changed against what is on GitHub now. A clean merge is committed; when both sides
// changed the same lines, theirs stays in place and ours is saved beside it as
// `name.conflict-YYYY-MM-DD.md`. Text is never lost.

import { diff3Merge } from 'node-diff3'
import type { FileChange } from './structure'

/** Lines with their own line endings, so joining them gives the text back byte for byte. */
const lines = (text: string) => (text === '' ? [] : text.split(/(?<=\n)/))

export function mergeText(base: string, ours: string, theirs: string): string | null {
  if (ours === theirs || theirs === base) return ours
  if (ours === base) return theirs
  const regions = diff3Merge(lines(ours), lines(base), lines(theirs), {
    excludeFalseConflicts: true,
  })
  let out = ''
  for (const region of regions) {
    if (region.conflict) return null
    out += region.ok!.join('')
  }
  return out
}

export interface Pending {
  path: string
  /** Our text; null when we deleted the file. */
  ours: string | null
  /** The text our edit started from; null when we created the file. */
  base: string | null
  /** The text on GitHub now; null when the file isn't there. */
  theirs: string | null
}

export interface Reconciled {
  /** What to commit on top of the new head. */
  changes: FileChange[]
  /** Paths of the copies saved beside files both sides changed. */
  conflicts: string[]
}

export function conflictPath(path: string, date: Date, taken: (path: string) => boolean): string {
  const day = date.toISOString().slice(0, 10)
  const stem = path.replace(/\.md$/, '')
  let candidate = `${stem}.conflict-${day}.md`
  for (let n = 2; taken(candidate); n++) candidate = `${stem}.conflict-${day}-${n}.md`
  return candidate
}

export function reconcile(
  pending: Pending[],
  date: Date,
  exists: (path: string) => boolean,
): Reconciled {
  const changes: FileChange[] = []
  const conflicts: string[] = []
  const created = new Set<string>()
  const taken = (p: string) => exists(p) || created.has(p)

  for (const { path, ours, base, theirs } of pending) {
    // Unchanged on GitHub since our edit started: ours applies as it is.
    if (theirs === base) {
      changes.push({ path, text: ours })
      continue
    }
    // We deleted it, they changed it: keep their edits.
    if (ours === null) continue
    // They deleted it, we changed it: keep ours.
    if (theirs === null) {
      changes.push({ path, text: ours })
      continue
    }
    const merged = mergeText(base ?? '', ours, theirs)
    if (merged !== null) {
      if (merged !== theirs) changes.push({ path, text: merged })
      continue
    }
    const copy = conflictPath(path, date, taken)
    created.add(copy)
    conflicts.push(copy)
    changes.push({ path: copy, text: ours })
  }
  return { changes, conflicts }
}
