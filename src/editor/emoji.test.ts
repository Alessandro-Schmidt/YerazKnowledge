import { describe, expect, it } from 'vitest'
import { GROUPS, loadEmoji, searchEmoji, type Emoji } from './emoji'

const list: Emoji[] = [
  { emoji: '🔐', label: 'locked with key', tags: ['closed', 'key', 'lock', 'secure'], group: 7 },
  { emoji: '🔑', label: 'key', tags: ['lock', 'password'], group: 7 },
  { emoji: '🗝️', label: 'old key', tags: ['clue', 'key', 'lock', 'old'], group: 7 },
  { emoji: '⌨️', label: 'keyboard', tags: ['computer', 'keyboard'], group: 7 },
  { emoji: '😀', label: 'grinning face', tags: ['face', 'grin', 'happy'], group: 0 },
  { emoji: '🇫🇷', label: 'flag: France', tags: ['FR', 'flag'], group: 9 },
]
const found = (query: string) => searchEmoji(query, list).map((e) => e.emoji)

describe('searchEmoji', () => {
  it('matches the start of a word in the name or a keyword, ignoring case and accents', () => {
    expect(found('happy')).toEqual(['😀'])
    expect(found('GRIN')).toEqual(['😀'])
    expect(found('secure')).toEqual(['🔐'])
    expect(found('franc')).toEqual(['🇫🇷'])
    expect(found('rançe')).toEqual([])
    expect(found('ey')).toEqual([])
  })

  it('needs every word, and ranks whole words, then names, over keywords', () => {
    expect(found('key lock')).toEqual(['🔑', '🔐', '🗝️'])
    expect(found('old key')).toEqual(['🗝️'])
    expect(found('key')).toEqual(['🔑', '⌨️', '🔐', '🗝️'])
    expect(found('comp')).toEqual(['⌨️'])
  })

  it('finds nothing for an empty query', () => {
    expect(found('  ')).toEqual([])
  })
})

describe('loadEmoji', () => {
  it("loads Unicode's emoji with names and keywords, in order, without parts or new ones", async () => {
    const all = await loadEmoji()
    expect(all.length).toBeGreaterThan(1800)
    expect(all.find((e) => e.emoji === '🔐')).toMatchObject({ label: 'locked with key', group: 7 })
    expect(all.find((e) => e.emoji === '🔐')!.tags).toContain('secure')
    // Skin tone swatches and lone regional indicators are parts, not emoji to pick.
    expect(all.some((e) => e.emoji === '🏻' || e.emoji === '🇦')).toBe(false)
    // Emoji newer than 15.0 aren't drawn by every system font yet.
    expect(all.some((e) => e.emoji === '🫜')).toBe(false)
    expect(all.every((e) => GROUPS[e.group] !== undefined)).toBe(true)
    const groups = all.map((e) => e.group)
    expect(groups).toEqual([...groups].sort((a, b) => a - b))
  })
})
