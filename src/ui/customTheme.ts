// Custom themes (ARCHITECTURE.md §13): a small JSON file that starts from a base and
// overrides tokens. Values are checked to be colours before they reach a stylesheet, and
// every contrast rule is enforced: a colour that fails is adjusted until it passes.
// Like the built-in choice, a custom theme is saved per device.

import themes from '../../design/themes/themes.json'
import { CONTRAST_RULES, readable } from './contrast'
import {
  ACCENT_IDS,
  applyTheme,
  BASE_IDS,
  DEFAULT_THEME,
  FONT_IDS,
  modeOf,
  resolveTokens,
  THEME_KEY,
  type BaseId,
  type FontId,
  type ThemeChoice,
} from './theme'

export interface CustomTheme {
  yerazTheme: 1
  name: string
  base: BaseId
  /** A named accent, or a `#RRGGBB` colour. */
  accent: string
  font: FontId
  /** Overrides of the base's tokens, by name without `--`. */
  tokens: Record<string, string>
}

interface Adjustment {
  token: string
  from: string
  to: string
}

/** The tokens a theme may set: a base's, plus the accent's text colour. */
const TOKEN_NAMES = [...Object.keys(themes.bases.vanta.tokens), 'on-accent']

const HEX = /^#[0-9A-Fa-f]{6}$/
const TRANSLUCENT = /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\)$/
const isColour = (value: unknown): value is string =>
  typeof value === 'string' && (HEX.test(value) || TRANSLUCENT.test(value))
/** Tokens a contrast rule measures: contrast.ts reads #RRGGBB only, so these stay opaque. */
const ruleTokens = new Set(CONTRAST_RULES.flatMap((r) => [r.fg, r.bg]))

/** A theme from a file or its parsed JSON; throws an Error that says what is wrong. */
export function parseTheme(input: unknown): CustomTheme {
  let value = input
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input)
    } catch {
      throw new Error('This file is not JSON.')
    }
  }
  const t = value as Partial<CustomTheme> | null
  if (!t || typeof t !== 'object' || t.yerazTheme !== 1)
    throw new Error('This is not a Yeraz theme.')
  if (typeof t.name !== 'string' || !t.name.trim()) throw new Error('The theme needs a name.')
  if (!BASE_IDS.includes(t.base as BaseId))
    throw new Error(`The base must be one of ${BASE_IDS.join(', ')}.`)
  if (!FONT_IDS.includes(t.font as FontId))
    throw new Error(`The font must be one of ${FONT_IDS.join(', ')}.`)
  const accent = t.accent
  if (
    !(ACCENT_IDS as string[]).includes(accent as string) &&
    !(typeof accent === 'string' && HEX.test(accent))
  )
    throw new Error('The accent must be a named colour or a #RRGGBB colour.')
  const tokens = t.tokens ?? {}
  if (typeof tokens !== 'object' || Array.isArray(tokens))
    throw new Error('Tokens must be an object.')
  for (const [name, colour] of Object.entries(tokens)) {
    if (!TOKEN_NAMES.includes(name)) throw new Error(`“${name}” is an unknown token.`)
    if (!isColour(colour) || (ruleTokens.has(name) && !HEX.test(colour)))
      throw new Error(`“${name}” must be a colour: #RRGGBB, or rgba with four numbers.`)
  }
  return {
    yerazTheme: 1,
    name: t.name.trim().slice(0, 60),
    base: t.base as BaseId,
    accent: accent as string,
    font: t.font as FontId,
    tokens: { ...tokens },
  }
}

/** A custom theme that starts as a copy of a built-in one. */
export function themeFrom(choice: ThemeChoice, name = 'My theme'): CustomTheme {
  return {
    yerazTheme: 1,
    name,
    base: choice.base,
    accent: choice.accent,
    font: choice.font,
    tokens: {},
  }
}

/**
 * Every token of a theme, with each contrast rule enforced (ARCHITECTURE.md §13): a
 * foreground that fails against its backgrounds is adjusted until it passes.
 */
export function resolveCustom(theme: CustomTheme): {
  tokens: Record<string, string>
  adjusted: Adjustment[]
} {
  const named = (ACCENT_IDS as string[]).includes(theme.accent)
  const builtIn = resolveTokens(
    theme.base,
    named ? (theme.accent as ThemeChoice['accent']) : 'green',
  )
  const tokens: Record<string, string> = {
    ...builtIn,
    ...(named ? {} : { accent: theme.accent }),
    ...theme.tokens,
  }
  const adjusted: Adjustment[] = []
  // Backgrounds come first in the rules' order, so a fixed foreground stays fixed.
  for (const fg of [...new Set(CONTRAST_RULES.map((r) => r.fg))]) {
    const against = CONTRAST_RULES.filter((r) => r.fg === fg).map((r) => ({
      bg: tokens[r.bg]!,
      min: r.min,
    }))
    const from = tokens[fg]!
    const to = readable(from, against)
    if (to !== from) {
      tokens[fg] = to
      adjusted.push({ token: fg, from, to })
    }
  }
  return { tokens, adjusted }
}

/**
 * The theme's variables. On screen only: printing keeps Paper (ARCHITECTURE.md §8). The
 * selector outranks the base and accent blocks of themeCss().
 */
export function customCss(tokens: Record<string, string>): string {
  const declarations = Object.entries(tokens)
    .filter(([name, value]) =>
      TOKEN_NAMES.includes(name) || name === 'accent' ? isColour(value) : false,
    )
    .map(([name, value]) => `--${name}:${value};`)
    .join('')
  return `@media screen{:root[data-custom][data-base][data-mode]{${declarations}}}`
}

/** localStorage key of the device's custom theme, if any. */
export const CUSTOM_KEY = 'yeraz-custom-theme'

const storage = (): Storage | undefined => {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export function savedCustom(store = storage()): CustomTheme | null {
  try {
    const raw = store?.getItem(CUSTOM_KEY)
    return raw ? parseTheme(raw) : null
  } catch {
    return null
  }
}

/**
 * Saves the custom theme (or clears it), and the CSS with it in the record index.html
 * reads before the first paint, so a custom theme never flashes either.
 */
export function saveCustom(theme: CustomTheme | null, store = storage()): void {
  try {
    let record: Record<string, unknown> = {}
    try {
      record = JSON.parse(store?.getItem(THEME_KEY) ?? '{}') ?? {}
    } catch {
      // start again
    }
    if (!theme) {
      store?.removeItem(CUSTOM_KEY)
      delete record.custom
    } else {
      store?.setItem(CUSTOM_KEY, JSON.stringify(theme))
      record = {
        ...record,
        base: theme.base,
        mode: modeOf(theme.base),
        accent: (ACCENT_IDS as string[]).includes(theme.accent)
          ? theme.accent
          : (record.accent ?? DEFAULT_THEME.accent),
        font: theme.font,
        custom: customCss(resolveCustom(theme).tokens),
      }
    }
    store?.setItem(THEME_KEY, JSON.stringify(record))
  } catch {
    // private windows and full quotas: the theme still applies for this session
  }
}

/** Shows a custom theme now, or goes back to the built-in one. No React render. */
export function applyCustom(theme: CustomTheme | null, doc: Document = document): void {
  const root = doc.documentElement
  let style = doc.getElementById('yeraz-custom')
  if (!theme) {
    style?.remove()
    delete root.dataset.custom
    return
  }
  const { tokens } = resolveCustom(theme)
  applyTheme(
    {
      base: theme.base,
      accent: (ACCENT_IDS as string[]).includes(theme.accent)
        ? (theme.accent as ThemeChoice['accent'])
        : ((root.dataset.accent as ThemeChoice['accent']) ?? DEFAULT_THEME.accent),
      font: theme.font,
    },
    doc,
  )
  if (!style) {
    style = doc.createElement('style')
    style.id = 'yeraz-custom'
    doc.head.append(style)
  }
  style.textContent = customCss(tokens)
  root.dataset.custom = ''
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = tokens.top!
}
