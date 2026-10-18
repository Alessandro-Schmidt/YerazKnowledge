// Search across every Tree (development-plan.md M4 step 4, issue #29): titles of leaves and
// branches, and the text of leaves; every word of the query, case and accents ignored. A
// title that starts with the query ranks first, then a word that does, then anything that
// contains it, then leaves whose text holds every word.
// ponytail: a linear scan over text already in the blob cache; MiniSearch if it gets slow
// (ARCHITECTURE.md §11).

import { HEADING, META, stripBom } from './parse'

export interface Searchable {
  repo: string
  id: string
  title: string
  kind: 'leaf' | 'branch' | 'tree'
  icon: string | null
  /** A leaf's Markdown, when it is known. */
  text?: string
}

const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
const words = (query: string) => fold(query).split(/\s+/).filter(Boolean)

// Folded once per item: the palette keeps its items while the query changes.
const folded = new WeakMap<Searchable, string>()
const foldedText = (item: Searchable) => {
  let text = folded.get(item)
  if (text === undefined) folded.set(item, (text = fold(bodyOf(item.text ?? ''))))
  return text
}

/** A leaf's text without line 1 (its title) and the line-2 metadata. */
export function bodyOf(markdown: string): string {
  const lines = stripBom(markdown).split(/\r\n|\r|\n/)
  let skip = HEADING.test(lines[0] ?? '') ? 1 : 0
  if (META.test(lines[skip] ?? '')) skip++
  return lines.slice(skip).join('\n')
}

/** Every item matching the query, best first: title matches, then text matches (`inText`). */
export function search<T extends Searchable>(
  query: string,
  items: readonly T[],
): (T & { inText: boolean })[] {
  const ws = words(query)
  if (!ws.length) return []
  const first = ws[0]!
  const wordStart = new RegExp(
    `(^|[^\\p{L}\\p{N}])${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    'u',
  )
  const scored: { item: T; score: number }[] = []
  for (const item of items) {
    const title = fold(item.title)
    let score: number
    if (ws.every((w) => title.includes(w)))
      score = title.startsWith(first) ? 0 : wordStart.test(title) ? 1 : 2
    else if (item.text && ws.every((w) => title.includes(w) || foldedText(item).includes(w)))
      score = 3
    else continue
    scored.push({ item, score })
  }
  return scored
    .sort((a, b) => a.score - b.score || a.item.title.length - b.item.title.length)
    .map((s) => ({ ...s.item, inText: s.score === 3 }))
}

/** The first place the query shows in a leaf's text, with some words around it; null if none. */
export function snippet(
  markdown: string,
  query: string,
): { before: string; match: string; after: string } | null {
  const text = bodyOf(markdown)
  const flat = fold(text)
  let at = -1
  let length = 0
  for (const w of words(query)) {
    at = flat.indexOf(w)
    length = w.length
    if (at >= 0) break
  }
  if (at < 0) return null
  // Folding keeps most text the same length; when it doesn't, walk to the original offsets.
  if (flat.length !== text.length) {
    const original = (n: number) => {
      let i = 0
      for (let seen = 0; i < text.length && seen < n; i++) seen += fold(text[i]!).length
      return i
    }
    const end = original(at + length)
    at = original(at)
    length = end - at
  }
  // About a line of context; a word cut at either end is dropped.
  const start = Math.max(0, at - 40)
  const end = Math.min(text.length, at + length + 80)
  const squash = (s: string) => s.replace(/\s+/g, ' ')
  let before = squash(text.slice(start, at)).trimStart()
  let after = squash(text.slice(at + length, end)).trimEnd()
  if (start > 0) before = `…${before.replace(/^\S*\s/, '')}`
  if (end < text.length) after = `${after.replace(/\s\S*$/, '')}…`
  return { before, match: text.slice(at, at + length), after }
}
