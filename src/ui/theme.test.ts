import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import themes from '../../design/themes/themes.json'
import { CONTRAST_RULES, contrastRatio } from './contrast'
import {
  ACCENT_IDS,
  BASE_IDS,
  colorVar,
  DEFAULT_THEME,
  resolveTokens,
  savedTheme,
  saveTheme,
  THEME_KEY,
  themeCss,
} from './theme'

describe('themes.json', () => {
  it('defines every token for every base', () => {
    const expected = Object.keys(themes.bases.vanta.tokens).sort()
    for (const id of BASE_IDS) {
      expect(Object.keys(themes.bases[id].tokens).sort(), id).toEqual(expected)
    }
  })

  it('gives every accent a dark and a light value', () => {
    for (const id of ACCENT_IDS) {
      expect(themes.accents[id].dark, id).toMatch(/^#[0-9A-F]{6}$/i)
      expect(themes.accents[id].light, id).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })

  it('defaults to Vanta, green and Geist', () => {
    expect(DEFAULT_THEME).toEqual({ base: 'vanta', accent: 'green', font: 'geist' })
  })
})

describe('contrast', () => {
  const combos = BASE_IDS.flatMap((base) => ACCENT_IDS.map((accent) => [base, accent] as const))

  it('covers all 12 base and accent combinations', () => {
    expect(combos).toHaveLength(12)
  })

  it.each(combos)('%s + %s passes every rule', (base, accent) => {
    const tokens = resolveTokens(base, accent)
    const failures = CONTRAST_RULES.filter(
      (r) => contrastRatio(tokens[r.fg]!, tokens[r.bg]!) < r.min,
    ).map((r) => `${r.fg} on ${r.bg}: ${contrastRatio(tokens[r.fg]!, tokens[r.bg]!).toFixed(2)}`)
    expect(failures).toEqual([])
  })

  it('agrees with known WCAG values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2)
  })
})

describe('saved choice', () => {
  const memory = (): Storage => {
    const items = new Map<string, string>()
    return {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
    } as Storage
  }

  it('round-trips, with the mode the inline script in index.html applies', () => {
    const store = memory()
    saveTheme({ base: 'paper', accent: 'violet', font: 'serif' }, store)
    expect(JSON.parse(store.getItem(THEME_KEY)!)).toMatchObject({ mode: 'light' })
    expect(savedTheme(store)).toEqual({ base: 'paper', accent: 'violet', font: 'serif' })
  })

  it('falls back to the default for anything unknown or unreadable', () => {
    const store = memory()
    expect(savedTheme(store)).toEqual(DEFAULT_THEME)
    store.setItem(THEME_KEY, '{"base":"neon","accent":"blue","font":"geist"}')
    expect(savedTheme(store)).toEqual({ ...DEFAULT_THEME, accent: 'blue' })
    store.setItem(THEME_KEY, 'not json')
    expect(savedTheme(store)).toEqual(DEFAULT_THEME)
    expect(savedTheme(undefined)).toEqual(DEFAULT_THEME)
  })
})

describe('themeCss', () => {
  const css = themeCss()

  it('has one block per base, per accent per mode and per font', () => {
    expect(css.match(/\[data-base=/g)).toHaveLength(3)
    expect(css.match(/\[data-accent=/g)).toHaveLength(8)
    expect(css.match(/\[data-font=/g)).toHaveLength(2)
  })

  it('defines every named colour in both modes', () => {
    expect(css).toContain(":root[data-mode='dark']{--c-green:#4BE3A0;--c-amber:#E8B65A;")
    expect(css).toContain(":root[data-mode='light']{--c-green:#0B7A4B;")
    expect(colorVar('amber')).toBe('var(--c-amber)')
    expect(colorVar('#ff0000')).toBe('var(--accent)')
    expect(colorVar(null)).toBe('var(--accent)')
  })

  it('maps reading fonts to the self-hosted variable families', () => {
    expect(css).toContain("--font-reading:'Geist Variable', 'Geist', ui-sans-serif")
    expect(css).toContain("--font-reading:'Newsreader Variable', 'Newsreader', Georgia")
  })
})

// development-plan.md §1 rule 9: every colour comes from themes.json.
// Tests are exempt: they need literal colours to check contrast maths.
describe('no hard-coded colours in src/', () => {
  const root = join(import.meta.dirname, '..')
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? files(path) : [path]
    })
  const colour = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi

  it('finds no hex or functional colour values', () => {
    const offenders = files(root)
      .filter((path) => /\.(tsx?|css|html|svg|json)$/.test(path) && !/\.test\.tsx?$/.test(path))
      .flatMap((path) =>
        readFileSync(path, 'utf8')
          .split('\n')
          .flatMap((line, i) =>
            line.match(colour) ? [`${relative(root, path)}:${i + 1}: ${line.trim()}`] : [],
          ),
      )
    expect(offenders).toEqual([])
  })
})
