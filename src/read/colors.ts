// A leaf's text and heading colours from line 2 (ARCHITECTURE.md §13). A named colour
// (`"amber"`) is resolved by the theme. A raw `#RRGGBB` is allowed too: it is adjusted to
// stay readable on every base of each mode, and themeCss() picks the mode's value, so a
// theme switch still re-renders nothing. Leaf → Tree → accent.

import type { CSSProperties } from 'react'
import themes from '../../design/themes/themes.json'
import type { LeafMeta } from '../model/parse'
import { readable } from '../ui/contrast'
import { ACCENT_IDS } from '../ui/theme'

const HEX = /^#[0-9A-Fa-f]{6}$/

/** The page and panel colours of every base of a mode: a leaf colour must read on each. */
const surfaces = (mode: string) =>
  Object.values(themes.bases)
    .filter((b) => b.mode === mode)
    .flatMap((b) => [b.tokens.bg, b.tokens.panel])
    .map((bg) => ({ bg, min: 4.5 }))

/** `--leaf-heading` and `--leaf-text` (or their per-mode values) for the leaf's container. */
export function leafColors(meta: LeafMeta | null | undefined): CSSProperties {
  const style: Record<string, string> = {}
  for (const part of ['heading', 'text'] as const) {
    const value: unknown = meta?.color?.[part]
    if (typeof value !== 'string') continue
    if ((ACCENT_IDS as string[]).includes(value)) style[`--leaf-${part}`] = `var(--c-${value})`
    else if (HEX.test(value))
      for (const mode of ['dark', 'light'])
        style[`--leaf-${part}-${mode}`] = readable(value, surfaces(mode))
  }
  return style as CSSProperties
}
