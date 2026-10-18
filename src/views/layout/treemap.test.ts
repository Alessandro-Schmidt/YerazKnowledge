import { describe, expect, it } from 'vitest'
import { layoutTreemap, leavesInOrder, squarify } from './treemap'
import { engineering } from './testGraph'

describe('squarify', () => {
  it('fills the rectangle, each area in proportion to its value', () => {
    const rects = squarify([6, 6, 4, 3, 2, 2, 1], 0, 0, 600, 400)
    const area = rects.reduce((s, r) => s + r.w * r.h, 0)
    expect(area).toBeCloseTo(600 * 400)
    expect(rects[0]!.w * rects[0]!.h).toBeCloseTo((6 / 24) * 600 * 400)
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(-1e-6)
      expect(r.x + r.w).toBeLessThanOrEqual(600 + 1e-6)
      expect(r.y + r.h).toBeLessThanOrEqual(400 + 1e-6)
    }
  })

  it('keeps tiles close to square', () => {
    for (const r of squarify([1, 1, 1, 1], 0, 0, 400, 400)) expect(r.w / r.h).toBeCloseTo(1)
  })
})

describe('layoutTreemap', () => {
  const graph = engineering()
  const groups = layoutTreemap(graph, { x: 0, y: 0, w: 1400, h: 750 })

  it('has one group per Tree, largest first, and one tile per leaf', () => {
    expect(groups[0]!.id).toBe('Backend')
    expect(groups.reduce((s, g) => s + g.tiles.length, 0)).toBe(graph.stats.leaves)
  })

  it('follows each leaf with its sub-leaves, which know the leaf they are in', () => {
    const order = leavesInOrder(graph, 'Identity').map((n) => n.id)
    const k = order.indexOf('Identity/keycloak.md')
    expect(order.slice(k + 1, k + 3).sort()).toEqual(
      ['Identity/keycloak/realms.md', 'Identity/keycloak/tokens.md'].sort(),
    )
    const realms = groups
      .flatMap((g) => g.tiles)
      .find((t) => t.id === 'Identity/keycloak/realms.md')!
    expect(realms.within).toBe('Identity/keycloak.md')
  })
})
