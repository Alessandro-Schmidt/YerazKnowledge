import { describe, expect, it } from 'vitest'
import themes from '../../design/themes/themes.json'
import { contrastRatio } from '../ui/contrast'
import { themeCss } from '../ui/theme'
import { leafColors } from './colors'

describe('leafColors (ARCHITECTURE.md §13)', () => {
  it('resolves named colours through the theme', () => {
    expect(leafColors({ color: { heading: 'amber', text: 'blue' } })).toEqual({
      '--leaf-heading': 'var(--c-amber)',
      '--leaf-text': 'var(--c-blue)',
    })
    expect(leafColors({ color: { heading: 'pink' } })).toEqual({})
    expect(leafColors(null)).toEqual({})
  })

  it('takes a raw hex colour, adjusted to stay readable on every base of each mode', () => {
    const style = leafColors({ color: { heading: '#1A2B6D' } }) as Record<string, string>
    const surfaces = (mode: string) =>
      Object.values(themes.bases)
        .filter((b) => b.mode === mode)
        .flatMap((b) => [b.tokens.bg, b.tokens.panel])
    for (const mode of ['dark', 'light']) {
      const value = style[`--leaf-heading-${mode}`]!
      for (const bg of surfaces(mode)) expect(contrastRatio(value, bg)).toBeGreaterThanOrEqual(4.5)
    }
    expect(style['--leaf-heading']).toBeUndefined()
  })

  it('ignores a value that is not a colour', () => {
    expect(leafColors({ color: { heading: 'url(x)', text: '#12' } })).toEqual({})
  })
})

describe('themeCss picks a hex leaf colour by mode', () => {
  const css = themeCss()
  it('on screen, from the mode on <html>', () => {
    expect(css).toContain(
      ":root[data-mode='dark'] [data-leaf]{--leaf-heading:var(--leaf-heading-dark);--leaf-text:var(--leaf-text-dark);}",
    )
    expect(css).toContain(
      ":root[data-mode='light'] [data-leaf]{--leaf-heading:var(--leaf-heading-light);--leaf-text:var(--leaf-text-light);}",
    )
  })
  it('in print, always the light one', () => {
    expect(css.slice(css.indexOf('@media print'))).toContain(
      '[data-leaf]{--leaf-heading:var(--leaf-heading-light);--leaf-text:var(--leaf-text-light);}',
    )
  })
})
