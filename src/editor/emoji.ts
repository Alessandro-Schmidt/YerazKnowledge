// Every emoji for the icon picker, with CLDR's English names and keywords (emojibase-data).
// The data is its own chunk, loaded the first time the picker opens.

export interface Emoji {
  emoji: string
  label: string
  tags: string[]
  /** Index into GROUPS. */
  group: number
}

/** emojibase's groups, in Unicode's order. Group 2 holds skin tones and hair: parts, not emoji. */
export const GROUPS: Partial<Record<number, string>> = {
  0: 'Smileys & emotion',
  1: 'People & body',
  3: 'Animals & nature',
  4: 'Food & drink',
  5: 'Travel & places',
  6: 'Activities',
  7: 'Objects',
  8: 'Symbols',
  9: 'Flags',
}

/** Newer emoji aren't drawn by every system font yet, so they'd show as empty boxes. */
const SUPPORTED_VERSION = 15

let loading: Promise<Emoji[]> | null = null

export function loadEmoji(): Promise<Emoji[]> {
  loading ??= import('emojibase-data/en/data.json').then(({ default: data }) =>
    data
      .filter(
        (e) =>
          e.group !== undefined &&
          GROUPS[e.group] !== undefined &&
          (e.version ?? 0) <= SUPPORTED_VERSION,
      )
      .sort((a, b) => a.group! - b.group! || (a.order ?? 0) - (b.order ?? 0))
      .map((e) => ({ emoji: e.emoji, label: e.label, tags: e.tags ?? [], group: e.group! })),
  )
  return loading
}

const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
const words = (text: string) =>
  fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

/** An emoji's name and keywords as words, folded once: a search only compares them. */
const folded = new WeakMap<Emoji, { name: string[]; all: string[] }>()
const wordsOf = (emoji: Emoji) => {
  let w = folded.get(emoji)
  if (!w) {
    const name = words(emoji.label)
    w = { name, all: [...name, ...emoji.tags.flatMap(words)] }
    folded.set(emoji, w)
  }
  return w
}

/**
 * Emoji whose name or keywords have a word starting with every word of the query. Ranked
 * by where the query's first word is found: the name's first word, whole then started,
 * then another word of the name, whole then started, then the keywords.
 */
export function searchEmoji(query: string, list: readonly Emoji[]): Emoji[] {
  const wanted = words(query)
  if (!wanted.length) return []
  const scored: { emoji: Emoji; score: number }[] = []
  for (const emoji of list) {
    const { name, all } = wordsOf(emoji)
    if (!wanted.every((w) => all.some((word) => word.startsWith(w)))) continue
    const first = wanted[0]!
    const score =
      name[0] === first
        ? 0
        : name[0]!.startsWith(first)
          ? 1
          : name.includes(first)
            ? 2
            : name.some((w) => w.startsWith(first))
              ? 3
              : 4
    scored.push({ emoji, score })
  }
  return scored.sort((a, b) => a.score - b.score).map((s) => s.emoji)
}
