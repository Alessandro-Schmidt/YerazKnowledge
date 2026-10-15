import { describe, expect, it } from 'vitest'
import { CONTRAST_RULES, contrastRatio } from './contrast'
import {
  CUSTOM_KEY,
  customCss,
  parseTheme,
  resolveCustom,
  savedCustom,
  saveCustom,
  themeFrom,
  type CustomTheme,
} from './customTheme'
import { resolveTokens, THEME_KEY } from './theme'

const midnight = {
  yerazTheme: 1,
  name: 'Midnight',
  base: 'graphite',
  accent: '#5AC8FA',
  font: 'geist',
  tokens: { bg: '#0E1116' },
}

const memory = (): Storage => {
  const items = new Map<string, string>()
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
  } as Storage
}

describe('parseTheme (the format in ARCHITECTURE.md §13)', () => {
  it('reads a theme file', () => {
    expect(parseTheme(midnight)).toEqual(midnight)
    expect(parseTheme(JSON.stringify({ ...midnight, accent: 'violet' })).accent).toBe('violet')
  })

  it('rejects anything that is not a theme, saying why', () => {
    expect(() => parseTheme('{')).toThrow('not JSON')
    expect(() => parseTheme({ ...midnight, yerazTheme: 2 })).toThrow('not a Yeraz theme')
    expect(() => parseTheme({ ...midnight, base: 'neon' })).toThrow('base')
    expect(() => parseTheme({ ...midnight, font: 'comic' })).toThrow('font')
    expect(() => parseTheme({ ...midnight, accent: 'pink' })).toThrow('accent')
    expect(() => parseTheme({ ...midnight, name: '' })).toThrow('name')
    expect(() => parseTheme({ ...midnight, tokens: { unknown: '#000000' } })).toThrow('unknown')
  })

  it('accepts only colours as values, so nothing else reaches the stylesheet', () => {
    for (const value of ['red', '#FFF', 'url(x)', '#000000;} body{display:none', 'var(--bg)'])
      expect(() => parseTheme({ ...midnight, tokens: { bg: value } }), value).toThrow('colour')
    expect(
      parseTheme({ ...midnight, tokens: { grid: 'rgba(255,255,255,0.05)' } }).tokens.grid,
    ).toBe('rgba(255,255,255,0.05)')
  })
})

describe('resolveCustom', () => {
  it('starts from the base and its overrides, with the accent in place', () => {
    const { tokens } = resolveCustom(parseTheme(midnight))
    expect(tokens.bg).toBe('#0E1116')
    expect(tokens.panel).toBe(resolveTokens('graphite', 'green').panel)
    expect(tokens.accent).toBe('#5AC8FA')
  })

  it('a named accent follows the base’s mode', () => {
    const { tokens } = resolveCustom(
      parseTheme({ ...midnight, base: 'paper', accent: 'amber', tokens: {} }),
    )
    expect(tokens.accent).toBe(resolveTokens('paper', 'amber').accent)
  })

  it('adjusts every colour that fails a contrast rule until it passes, and says which', () => {
    const theme = parseTheme({ ...midnight, accent: '#1A2B6D', tokens: { muted: '#303030' } })
    const { tokens, adjusted } = resolveCustom(theme)
    for (const rule of CONTRAST_RULES)
      expect(contrastRatio(tokens[rule.fg]!, tokens[rule.bg]!), rule.what).toBeGreaterThanOrEqual(
        rule.min,
      )
    expect(adjusted.map((a) => a.token).sort()).toEqual(['accent', 'muted'])
    expect(adjusted.find((a) => a.token === 'muted')).toMatchObject({ from: '#303030' })
  })

  it('changes nothing in a built-in theme', () => {
    expect(
      resolveCustom(themeFrom({ base: 'vanta', accent: 'green', font: 'geist' })).adjusted,
    ).toEqual([])
  })
})

describe('customCss', () => {
  it('overrides the variables on screen only, above the accent blocks', () => {
    const css = customCss(resolveCustom(parseTheme(midnight)).tokens)
    expect(css).toMatch(/^@media screen\{:root\[data-custom\]\[data-base\]\[data-mode\]\{/)
    expect(css).toContain('--bg:#0E1116;')
    expect(css).toContain('--accent:#5AC8FA;')
  })
})

describe('saving', () => {
  it('keeps the theme, and the CSS index.html applies before the first paint', () => {
    const store = memory()
    const theme = parseTheme(midnight) as CustomTheme
    saveCustom(theme, store)
    expect(savedCustom(store)).toEqual(theme)
    const saved = JSON.parse(store.getItem(THEME_KEY)!)
    expect(saved).toMatchObject({ base: 'graphite', mode: 'dark', font: 'geist' })
    expect(saved.custom).toBe(customCss(resolveCustom(theme).tokens))
    saveCustom(null, store)
    expect(savedCustom(store)).toBeNull()
    expect(store.getItem(CUSTOM_KEY)).toBeNull()
    expect(JSON.parse(store.getItem(THEME_KEY)!).custom).toBeUndefined()
  })
})
