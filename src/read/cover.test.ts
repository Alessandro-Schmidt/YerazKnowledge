import { describe, expect, it } from 'vitest'
import { coverPosition, dragCover } from './cover'

describe('coverPosition', () => {
  it('reads line 2’s position, a percentage from the top, centred by default', () => {
    expect(coverPosition({ cover: '/assets/a.png', coverPosition: 30 })).toBe(30)
    expect(coverPosition({ cover: '/assets/a.png' })).toBe(50)
    expect(coverPosition(null)).toBe(50)
  })

  it('ignores what isn’t a percentage', () => {
    expect(coverPosition({ coverPosition: '30' })).toBe(50)
    expect(coverPosition({ coverPosition: Number.NaN })).toBe(50)
    expect(coverPosition({ coverPosition: 140 })).toBe(100)
    expect(coverPosition({ coverPosition: -5 })).toBe(0)
  })
})

describe('dragCover', () => {
  // A 1500 × 1000 photo in a 600 × 200 slot: drawn 600 × 400, so 200 px are hidden.
  const box = { width: 600, height: 200 }
  const photo = { width: 1500, height: 1000 }

  it('moves the image with the pointer: dragging down shows more of the top', () => {
    expect(dragCover(50, 100, box, photo)).toBe(0)
    expect(dragCover(50, -50, box, photo)).toBe(75)
    expect(dragCover(50, -1000, box, photo)).toBe(100)
  })

  it('does nothing when the image has no hidden height', () => {
    expect(dragCover(50, 80, box, { width: 3000, height: 500 })).toBe(50)
  })
})
