// Turns design/themes/themes.json into CSS variables, and applies a theme by
// setting four data attributes on <html>. Nothing else in src/ holds a colour.

import themes from '../../design/themes/themes.json'

export type BaseId = keyof typeof themes.bases
export type AccentId = keyof typeof themes.accents
export type FontId = keyof typeof themes.fonts
export type Mode = 'dark' | 'light'

export interface ThemeChoice {
  base: BaseId
  accent: AccentId
  font: FontId
}

export const DEFAULT_THEME = themes.default as ThemeChoice
export const BASE_IDS = Object.keys(themes.bases) as BaseId[]
export const ACCENT_IDS = Object.keys(themes.accents) as AccentId[]
export const FONT_IDS = Object.keys(themes.fonts) as FontId[]

// Fontsource's variable packages register the families under these names.
const FONT_FACES: Record<string, string> = {
  "'Geist'": "'Geist Variable', 'Geist'",
  "'Newsreader'": "'Newsreader Variable', 'Newsreader'",
}

export function modeOf(base: BaseId): Mode {
  return themes.bases[base].mode as Mode
}

/** Every token of one base and accent, by name, without the leading `--`. */
export function resolveTokens(base: BaseId, accent: AccentId): Record<string, string> {
  const mode = modeOf(base)
  return {
    ...themes.bases[base].tokens,
    accent: themes.accents[accent][mode],
    'on-accent': themes.onAccent[mode],
  }
}

const declarations = (tokens: Record<string, string>) =>
  Object.entries(tokens)
    .map(([name, value]) => `--${name}:${value};`)
    .join('')

/** One block of variables per base, one per accent per mode, one per reading font. */
export function themeCss(): string {
  const blocks: string[] = []
  for (const id of BASE_IDS) {
    blocks.push(`:root[data-base='${id}']{${declarations(themes.bases[id].tokens)}}`)
  }
  for (const mode of ['dark', 'light'] as const) {
    for (const id of ACCENT_IDS) {
      blocks.push(
        `:root[data-mode='${mode}'][data-accent='${id}']{${declarations({
          accent: themes.accents[id][mode],
          'on-accent': themes.onAccent[mode],
        })}}`,
      )
    }
  }
  // Named colours for Trees and leaves (`"color": "amber"`), resolved per mode (§13).
  for (const mode of ['dark', 'light'] as const) {
    const named = Object.fromEntries(ACCENT_IDS.map((id) => [`c-${id}`, themes.accents[id][mode]]))
    blocks.push(`:root[data-mode='${mode}']{${declarations(named)}}`)
  }
  for (const id of FONT_IDS) {
    const stack = themes.fonts[id].reading.replace(/'[^']+'/, (f) => FONT_FACES[f] ?? f)
    blocks.push(`:root[data-font='${id}']{--font-reading:${stack};}`)
  }
  return blocks.join('\n')
}

/** A named colour as a CSS value; anything else falls back to the theme accent. */
export function colorVar(name: string | null | undefined): string {
  return name && (ACCENT_IDS as string[]).includes(name) ? `var(--c-${name})` : 'var(--accent)'
}

/** Applies a theme. CSS does the rest, so no React component re-renders. */
export function applyTheme(choice: ThemeChoice, doc: Document = document): void {
  const root = doc.documentElement
  root.dataset.base = choice.base
  root.dataset.mode = modeOf(choice.base)
  root.dataset.accent = choice.accent
  root.dataset.font = choice.font

  let meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = doc.createElement('meta')
    meta.name = 'theme-color'
    doc.head.append(meta)
  }
  meta.content = themes.bases[choice.base].tokens.top
}

/** Adds the generated theme stylesheet once, then applies the theme. */
export function installTheme(choice: ThemeChoice = DEFAULT_THEME, doc: Document = document): void {
  if (!doc.getElementById('yeraz-themes')) {
    const style = doc.createElement('style')
    style.id = 'yeraz-themes'
    style.textContent = themeCss()
    doc.head.prepend(style)
  }
  applyTheme(choice, doc)
}
