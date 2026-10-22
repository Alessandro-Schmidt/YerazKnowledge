import { describe, expect, it } from 'vitest'
import { convexHull, layoutGraph } from './graph'
import { engineering, engineeringWithText } from './testGraph'

describe('layoutGraph', () => {
  const graph = engineering()
  const layout = layoutGraph(graph)

  it('draws every leaf once, and a hull per Tree around its own leaves', () => {
    expect(layout.dots).toHaveLength(graph.stats.leaves)
    expect(layout.hulls.map((h) => h.id).sort()).toEqual(
      ['AI Agents', 'Backend', 'Cloud', 'Data', 'Frontend', 'Identity'].sort(),
    )
    for (const h of layout.hulls) expect(h.d).toMatch(/^M.*Z$/)
  })

  it('puts the Tree most threads run through in the middle', () => {
    expect(layout.hub).not.toBeNull()
    const hubDots = layout.dots.filter((d) => d.tree === layout.hub)
    const cx = hubDots.reduce((s, d) => s + d.x, 0) / hubDots.length
    const cy = hubDots.reduce((s, d) => s + d.y, 0) / hubDots.length
    expect(Math.hypot(cx, cy)).toBeLessThan(40)
  })

  it('leaves the Family’s README.md out: it is not in a Tree', () => {
    const withText = layoutGraph(engineeringWithText())
    expect(withText.byId.has('README.md')).toBe(false)
    expect(withText.dots).toHaveLength(layout.dots.length)
  })

  it('keeps Trees apart: no leaf sits closer to another Tree’s centre than to its own', () => {
    const centre = (id: string) => {
      const ds = layout.dots.filter((d) => d.tree === id)
      return [
        ds.reduce((s, d) => s + d.x, 0) / ds.length,
        ds.reduce((s, d) => s + d.y, 0) / ds.length,
      ]
    }
    const centres = new Map(layout.hulls.map((h) => [h.id, centre(h.id)]))
    for (const d of layout.dots) {
      const own = centres.get(d.tree)!
      const mine = Math.hypot(d.x - own[0]!, d.y - own[1]!)
      for (const [id, c] of centres)
        if (id !== d.tree) expect(Math.hypot(d.x - c[0]!, d.y - c[1]!)).toBeGreaterThan(mine)
    }
  })

  it('is the same every time', () => {
    expect(layoutGraph(graph).dots).toEqual(layout.dots)
  })

  it('has one thread path per thread between leaves, and sub-leaf links', () => {
    expect(layout.threads.length).toBeGreaterThan(10)
    expect(layout.struct).toContainEqual({
      from: 'Identity/keycloak/realms.md',
      to: 'Identity/keycloak.md',
    })
  })
})

describe('convexHull', () => {
  it('keeps the corners only', () => {
    expect(
      convexHull([
        [0, 0],
        [2, 0],
        [1, 1],
        [2, 2],
        [0, 2],
      ]),
    ).toHaveLength(4)
  })
})
