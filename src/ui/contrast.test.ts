import { describe, expect, it } from 'vitest'
import { contrastRatio, readable } from './contrast'

describe('readable (ARCHITECTURE.md §13: a custom colour that fails is adjusted)', () => {
  it('leaves a colour that already passes as it is', () => {
    expect(readable('#5AC8FA', [{ bg: '#030303', min: 4.5 }])).toBe('#5AC8FA')
  })

  it('lightens a colour that is too dark for a dark background, until it passes', () => {
    const fixed = readable('#1A2B6D', [{ bg: '#030303', min: 4.5 }])
    expect(contrastRatio(fixed, '#030303')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(fixed, '#030303')).toBeLessThan(5.2)
    expect(parseInt(fixed.slice(5, 7), 16)).toBeGreaterThan(parseInt(fixed.slice(1, 3), 16))
  })

  it('darkens a colour that is too light for a light background', () => {
    const fixed = readable('#F5C46B', [{ bg: '#FBFAF6', min: 4.5 }])
    expect(contrastRatio(fixed, '#FBFAF6')).toBeGreaterThanOrEqual(4.5)
  })

  it('passes against every background at once, each with its own minimum', () => {
    const fixed = readable('#444444', [
      { bg: '#030303', min: 7 },
      { bg: '#121514', min: 4.5 },
    ])
    expect(contrastRatio(fixed, '#030303')).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(fixed, '#121514')).toBeGreaterThanOrEqual(4.5)
  })
})
