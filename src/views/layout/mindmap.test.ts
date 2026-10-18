import { describe, expect, it } from 'vitest'
import { layoutMind } from './mindmap'
import { engineering } from './testGraph'

const graph = engineering()

describe('layoutMind', () => {
  const layout = layoutMind(graph, { phone: false, depth: 3, open: null })

  it('puts every Tree on one side or the other, balanced by rows', () => {
    const pills = layout.nodes.filter((n) => n.depth === 1)
    expect(pills.map((p) => p.label).sort()).toEqual(
      ['AI AGENTS', 'BACKEND', 'CLOUD', 'DATA', 'FRONTEND', 'IDENTITY'].sort(),
    )
    const rows = (side: number) =>
      layout.nodes.filter((n) => n.side === side && !graph.nodes.get(n.id)!.children.length).length
    expect(Math.abs(rows(1) - rows(-1))).toBeLessThanOrEqual(4)
  })

  it('places each level in a column further out, and a parent level with its rows', () => {
    const keycloak = layout.byId.get('Identity/keycloak.md')!
    const kids = graph.nodes.get('Identity/keycloak.md')!.children.map((c) => layout.byId.get(c)!)
    expect(kids).toHaveLength(2)
    for (const k of kids) expect(Math.abs(k.x)).toBeGreaterThan(Math.abs(keycloak.x))
    expect(keycloak.y).toBeCloseTo((kids[0]!.y + kids[1]!.y) / 2)
    expect(layout.edges).toHaveLength(layout.nodes.length)
  })

  it('hides levels past `depth`, except on the way to the selection', () => {
    const shallow = layoutMind(graph, { phone: false, depth: 2, open: null })
    expect(shallow.byId.has('Identity/keycloak/realms.md')).toBe(false)
    const open = layoutMind(graph, { phone: false, depth: 2, open: 'Identity/keycloak/realms.md' })
    expect(open.byId.has('Identity/keycloak/realms.md')).toBe(true)
  })

  it('is one-sided and vertical on a phone, under the core card', () => {
    const phone = layoutMind(graph, { phone: true, depth: 3, open: null })
    expect(new Set(phone.nodes.map((n) => n.side))).toEqual(new Set([1]))
    expect(Math.min(...phone.nodes.map((n) => n.y))).toBeGreaterThan(phone.core.y + phone.core.h)
    expect(phone.spine).not.toBeNull()
  })
})
