// WCAG contrast, the same rules as design/themes/check.py.

export interface ContrastRule {
  fg: string
  bg: string
  min: number
  what: string
}

export const CONTRAST_RULES: readonly ContrastRule[] = [
  { fg: 'text', bg: 'bg', min: 7, what: 'body text on the page' },
  { fg: 'text', bg: 'panel', min: 7, what: 'body text on panels' },
  { fg: 'text-body', bg: 'panel', min: 4.5, what: 'leaf text in the Peek' },
  { fg: 'muted', bg: 'bg', min: 4.5, what: 'secondary text on the page' },
  { fg: 'muted', bg: 'panel', min: 4.5, what: 'secondary text on panels' },
  { fg: 'faint', bg: 'panel', min: 4.5, what: 'word counts in the Explorer' },
  { fg: 'accent', bg: 'bg', min: 4.5, what: 'accent text and threads on the page' },
  { fg: 'accent', bg: 'panel', min: 4.5, what: 'headings and @mentions in the Peek' },
  { fg: 'on-accent', bg: 'accent', min: 4.5, what: 'text on accent buttons' },
  { fg: 'node', bg: 'bg', min: 3, what: 'leaf dots on the map' },
]

function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
const toHex = (rgb: number[]) =>
  '#' +
  rgb
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex) as [number, number, number]
  const hi = Math.max(r, g, b)
  const lo = Math.min(r, g, b)
  const l = (hi + lo) / 2
  if (hi === lo) return [0, 0, l]
  const d = hi - lo
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = hi === r ? ((g - b) / d) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}

function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  return toHex([r + m, g + m, b + m])
}

/**
 * A `#RRGGBB` colour that reaches each minimum against its background (ARCHITECTURE.md §13):
 * unchanged if it already does, otherwise moved to the nearest lightness that passes,
 * keeping its hue.
 */
export function readable(color: string, against: readonly { bg: string; min: number }[]): string {
  const passes = (c: string) => against.every(({ bg, min }) => contrastRatio(c, bg) >= min)
  if (passes(color)) return color
  const darkBackground =
    against.reduce((sum, { bg }) => sum + luminance(bg), 0) / against.length < 0.18
  const [h, s, l] = toHsl(color)
  // The nearest lightness that passes, trying the direction that suits the backgrounds first.
  const directions = darkBackground ? [1, -1] : [-1, 1]
  for (let step = 1; step <= 100; step++) {
    for (const sign of directions) {
      const next = fromHsl(h, s, Math.min(1, Math.max(0, l + (sign * step) / 100)))
      if (passes(next)) return next
    }
  }
  return toHex(darkBackground ? [1, 1, 1] : [0, 0, 0])
}
