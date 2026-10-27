// When another device committed first (ARCHITECTURE.md §5.2): three-way merge each file
// we changed against what is on GitHub now. A clean merge is committed; when both sides
// changed the same lines, theirs stays in place and ours is saved beside it as
// `name.conflict-YYYY-MM-DD.md`. Text is never lost. Images can't merge: they are compared
// by blob SHA, and neither side's is ever overwritten.

import { diff3Merge } from 'node-diff3'
import { MARKER } from '../local/folder'
import { rewriteFileLinks } from '../model/links'
import { gitBlobSha } from '../model/sha'
import { isoDate } from '../model/template'
import { isTemplatePath } from '../model/tree'
import type { Dirty } from './push'
import type { FileChange } from './structure'

/** Files whose text is kept and merged: leaves, branch texts, templates and the marker. */
export const isTextPath = (path: string) => path.endsWith('.md') || path === MARKER

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

/**
 * `name.conflict-YYYY-MM-DD.md`, dated as the person's calendar has it; a hidden file's copy
 * (`.yeraz.json`) isn't hidden: `yeraz.conflict-YYYY-MM-DD.json`.
 */
export function conflictPath(path: string, date: Date, taken: (path: string) => boolean): string {
  const day = isoDate(date)
  const [, dir = '', name, ext = ''] = /^(.*\/)?\.?([^/]*?)(\.[^./]*)?$/.exec(path)!
  let candidate = `${dir}${name}.conflict-${day}${ext}`
  for (let n = 2; taken(candidate); n++) candidate = `${dir}${name}.conflict-${day}-${n}${ext}`
  return candidate
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/** A value merged key by key: theirs where we didn't change it, ours where we did. */
function mergeValue(base: unknown, ours: unknown, theirs: unknown): unknown {
  if (same(ours, base)) return theirs
  if (same(theirs, base) || !isObject(ours) || !isObject(theirs)) return ours
  const out: Record<string, unknown> = {}
  for (const key of new Set([...Object.keys(theirs), ...Object.keys(ours)])) {
    const value = mergeValue(isObject(base) ? base[key] : undefined, ours[key], theirs[key])
    if (value !== undefined) out[key] = value
  }
  return out
}

/**
 * `.yeraz.json` merged key by key, since its one line would always conflict as text (a name
 * from one device, Tree colours from another), laid out as theirs; null if one isn't JSON.
 */
function mergeMarker(base: string, ours: string, theirs: string): string | null {
  try {
    const merged = mergeValue(JSON.parse(base || '{}'), JSON.parse(ours), JSON.parse(theirs))
    const indent = /^\{\s*\n([ \t]+)"/.exec(theirs)?.[1]
    return `${JSON.stringify(merged, null, indent)}\n`
  } catch {
    return null
  }
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
    const merged =
      mergeText(base ?? '', ours, theirs) ??
      (path === MARKER ? mergeMarker(base ?? '', ours, theirs) : null)
    if (merged !== null) {
      if (merged !== theirs) changes.push({ path, text: merged })
      continue
    }
    const copy = conflictPath(path, date, taken)
    created.add(copy)
    conflicts.push(copy)
    // A template's copy is told apart by its name (line 1), which Start from shows.
    const text = isTemplatePath(path)
      ? ours.replace(/^#[^\r\n]*/, (title) => `${title} (conflict ${isoDate(date)})`)
      : ours
    changes.push({ path: copy, text })
  }
  return { changes, conflicts }
}

/** `assets/x.png` → `assets/x-2.png` (then -3…): the first name not taken. */
function freeName(path: string, taken: (path: string) => boolean): string {
  const dot = path.lastIndexOf('.') > path.lastIndexOf('/') ? path.lastIndexOf('.') : path.length
  let candidate = path
  for (let n = 2; taken(candidate); n++) candidate = `${path.slice(0, dot)}-${n}${path.slice(dot)}`
  return candidate
}

/**
 * Our edits against what is there now (GitHub, or the folder): `current` is each path's
 * blob SHA there, `textsOf` the texts of blob SHAs. Texts merge (`reconcile`). An image is
 * ours when it is unchanged there; deleted here but changed there, theirs stays; added or
 * changed on both sides with other bytes, ours goes beside theirs under a free name, and
 * our leaves' links follow it.
 */
export async function reconcileEdits(
  dirty: Dirty,
  current: ReadonlyMap<string, string>,
  textsOf: (shas: string[]) => Promise<ReadonlyMap<string, string | null>>,
  date: Date,
): Promise<Reconciled> {
  const entries = Object.entries(dirty)
  const binary = entries.filter(([path, f]) =>
    f.text === null ? !isTextPath(path) : f.text instanceof Uint8Array,
  )
  const text = entries.filter((e) => !binary.includes(e))
  const moves = new Map<string, string>()
  const named = new Set<string>()
  const taken = (p: string) => current.has(p) || p in dirty || named.has(p)
  const images: FileChange[] = []
  for (const [path, f] of binary) {
    const theirs = current.get(path) ?? null
    if (theirs === f.base || theirs === null) images.push({ path, text: f.text })
    else if (f.text === null || theirs === (await gitBlobSha(f.text as Uint8Array))) continue
    else {
      const to = freeName(path, taken)
      moves.set(path, to)
      named.add(to)
      images.push({ path: to, text: f.text })
    }
  }

  const shas = text.flatMap(([path, f]) =>
    [f.base, current.get(path)].filter((s): s is string => !!s),
  )
  const texts = await textsOf(shas)
  const at = (sha: string | null | undefined) => (sha ? (texts.get(sha) ?? null) : null)
  const pending: Pending[] = text.map(([path, f]) => ({
    path,
    ours: typeof f.text === 'string' ? rewriteFileLinks(f.text, moves) : null,
    base: at(f.base),
    theirs: at(current.get(path)),
  }))
  const reconciled = reconcile(pending, date, (p) => current.has(p))
  return { ...reconciled, changes: [...reconciled.changes, ...images] }
}
