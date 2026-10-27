import { describe, expect, it } from 'vitest'
import { layoutRings, PITH, R } from './rings'
import { engineering, engineeringWithText } from './testGraph'

const graph = engineering()
const leaves = [...graph.nodes.values()].filter((n) => n.kind === 'leaf')
// Planted over a year: one leaf a month in turn, Keycloak in September 2026.
const planted = new Map(
  leaves.map((l, i) => [
    l.id,
    l.id === 'Identity/keycloak.md'
      ? '2026-09-12T10:00:00Z'
      : new Date(Date.UTC(2025, 10 + (i % 12), 3)).toISOString(),
  ]),
)
const now = new Date('2026-10-18T12:00:00Z')

describe('layoutRings', () => {
  const layout = layoutRings(graph, planted, now)

  it('has one ring per month from the first leaf to now, filling the trunk', () => {
    expect(layout.months).toHaveLength(12)
    expect(layout.months[0]!.long).toBe('November 2025')
    expect(layout.months.at(-1)!.long).toBe('October 2026')
    expect(layout.edges[0]).toBe(PITH)
    expect(layout.edges.at(-1)).toBeCloseTo(R)
    for (let i = 1; i < layout.edges.length; i++)
      expect(layout.edges[i]! - layout.edges[i - 1]!).toBeGreaterThanOrEqual(9 - 1e-9)
  })

  it('puts each leaf in the ring of the month it was planted, between that ring’s edges', () => {
    const keycloak = layout.byId.get('Identity/keycloak.md')!
    expect(layout.months[keycloak.month]!.long).toBe('September 2026')
    const r = Math.hypot(keycloak.x, keycloak.y)
    expect(r).toBeGreaterThan(layout.edges[keycloak.month]! * 0.9)
    expect(r).toBeLessThan(layout.edges[keycloak.month + 1]! * 1.1)
    expect(layout.dots).toHaveLength(leaves.length)
  })

  it('makes a ring wider when more words were planted in it', () => {
    const width = (m: number) => layout.edges[m + 1]! - layout.edges[m]!
    const busiest = layout.busiest
    const words = layout.months.map((m) => m.words)
    const quietest = words.indexOf(Math.min(...words))
    expect(width(busiest)).toBeGreaterThan(width(quietest))
  })

  it('has a sector per Tree, and shows the Family as it was in an earlier month', () => {
    expect(layout.sectors).toHaveLength(6)
    const earlier = layoutRings(graph, planted, now, 3)
    expect(earlier.months).toHaveLength(4)
    expect(earlier.byId.has('Identity/keycloak.md')).toBe(false)
    expect(earlier.dots.every((d) => d.month <= 3)).toBe(true)
  })

  it('is the same every time', () => {
    expect(layoutRings(graph, planted, now).bark).toEqual(layout.bark)
  })

  it('leaves the Family’s README.md out: it is not in a Tree', () => {
    const withText = layoutRings(engineeringWithText(), planted, now)
    expect(withText.byId.has('README.md')).toBe(false)
    expect(withText.dots).toHaveLength(layout.dots.length)
  })
})
