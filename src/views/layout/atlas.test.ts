import { describe, expect, it } from 'vitest'
import { layoutAtlas, SEA } from './atlas'
import { engineering } from './testGraph'

describe('layoutAtlas', () => {
  const graph = engineering()
  const atlas = layoutAtlas(graph)

  it('makes an island per Tree and a peak per leaf, with a coast and contour bands', () => {
    expect(atlas.islands).toHaveLength(6)
    expect(atlas.peaks).toHaveLength(graph.stats.leaves)
    for (const island of atlas.islands) {
      expect(island.coast).toMatch(/^M/)
      expect(island.bands.length).toBeGreaterThan(1)
      expect(island.water.length).toBe(5)
    }
    expect(atlas.top).toBeGreaterThan(SEA)
  })

  it('keeps islands apart: every peak is nearer its own island’s peaks than any other’s', () => {
    const centre = (id: string) => {
      const ps = atlas.peaks.filter((p) => p.island === id)
      return [
        ps.reduce((s, p) => s + p.x, 0) / ps.length,
        ps.reduce((s, p) => s + p.y, 0) / ps.length,
      ]
    }
    const centres = new Map(atlas.islands.map((i) => [i.id, centre(i.id)]))
    for (const p of atlas.peaks) {
      const own = centres.get(p.island)!
      const mine = Math.hypot(p.x - own[0]!, p.y - own[1]!)
      for (const [id, c] of centres)
        if (id !== p.island) expect(Math.hypot(p.x - c[0]!, p.y - c[1]!)).toBeGreaterThan(mine)
    }
  })

  it('names every island, and routes threads by sea between islands and on foot within one', () => {
    for (const i of atlas.islands) expect(i.name.sub).toMatch(/words · \d+ peaks?$/)
    expect(atlas.routes.some((r) => r.sea)).toBe(true)
    expect(atlas.routes.some((r) => !r.sea)).toBe(true)
  })

  it('is the same every time', () => {
    expect(layoutAtlas(graph).islands[0]!.coast).toBe(atlas.islands[0]!.coast)
  })
})
