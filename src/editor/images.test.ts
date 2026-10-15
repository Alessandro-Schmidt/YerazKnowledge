import { describe, expect, it } from 'vitest'
import { imagePlan, MAX_EDGE } from './images'

describe('imagePlan (ARCHITECTURE.md §8, images at full definition)', () => {
  it('commits images up to 4096 px unchanged, in the formats GitHub shows', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
      expect(imagePlan({ type, width: 1200, height: 800 })).toEqual({ keep: true })
    expect(imagePlan({ type: 'image/png', width: MAX_EDGE, height: 10 })).toEqual({ keep: true })
  })

  it('never touches SVG (vector) or GIF (may be animated), whatever their size', () => {
    expect(imagePlan({ type: 'image/svg+xml', width: 9000, height: 9000 })).toEqual({ keep: true })
    expect(imagePlan({ type: 'image/gif', width: 6000, height: 100 })).toEqual({ keep: true })
  })

  it('scales a large photo to 4096 px on its long edge, as WebP at quality 92', () => {
    expect(imagePlan({ type: 'image/jpeg', width: 6000, height: 4000 })).toEqual({
      keep: false,
      width: 4096,
      height: 2731,
      quality: 0.92,
    })
    expect(imagePlan({ type: 'image/jpeg', width: 3000, height: 8192 })).toMatchObject({
      width: 1500,
      height: 4096,
    })
  })

  it('keeps screenshots and images with transparency lossless', () => {
    expect(imagePlan({ type: 'image/png', width: 5120, height: 2880 })).toEqual({
      keep: false,
      width: 4096,
      height: 2304,
      quality: 1,
    })
  })

  it('re-encodes other formats losslessly, without upscaling', () => {
    expect(imagePlan({ type: 'image/bmp', width: 300, height: 200 })).toEqual({
      keep: false,
      width: 300,
      height: 200,
      quality: 1,
    })
  })
})
