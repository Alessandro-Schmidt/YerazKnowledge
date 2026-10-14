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
