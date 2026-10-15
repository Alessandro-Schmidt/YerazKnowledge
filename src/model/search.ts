// Title search across every Tree (development-plan.md M4 step 4): titles of leaves and
// branches, every word of the query, case and accents ignored. A title that starts with
// the query ranks first, then a word that does, then anything that contains it.
// ponytail: a linear scan; MiniSearch if full-text search is ever asked for (ARCHITECTURE.md §11).

export interface Searchable {
  repo: string
  id: string
  title: string
  kind: 'leaf' | 'branch' | 'tree'
  icon: string | null
}

const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()

export function searchTitles(
  query: string,
  items: readonly Searchable[],
  limit = 20,
): Searchable[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const first = words[0]!
  const wordStart = new RegExp(
    `(^|[^\\p{L}\\p{N}])${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    'u',
  )
  const scored: { item: Searchable; score: number }[] = []
  for (const item of items) {
    const title = fold(item.title)
    if (!words.every((w) => title.includes(w))) continue
    const score = title.startsWith(first) ? 0 : wordStart.test(title) ? 1 : 2
    scored.push({ item, score })
  }
  return scored
    .sort((a, b) => a.score - b.score || a.item.title.length - b.item.title.length)
    .slice(0, limit)
    .map((s) => s.item)
}
