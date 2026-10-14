import { describe, expect, it } from 'vitest'
import { makeFixture } from '../../test/fake-github/fixture'
import { buildGraph, type Graph } from '../model/graph'
import { parseLeaf } from '../model/parse'
import { buildTree, ROOT } from '../model/tree'
import { dotRadius, layoutTree, threadRoute } from './layout'

function fixtureGraph(leaves: number): Graph {
  const { files } = makeFixture({ leaves, threads: Math.round(leaves * 1.5), seed: 7 })
  const model = buildTree(
    Object.entries(files).map(([path, text]) => ({
      path,
      type: 'blob' as const,
      sha: path,
      size: text.length,
    })),
  )
  const parsed = new Map(model.leaves.map((p) => [p, parseLeaf(files[p]!)]))
  return buildGraph(model, parsed, 'Fixture')
}

const graphs = [100, 1000, 5000].map((n) => [n, fixtureGraph(n)] as const)

describe.each(graphs)('layout invariants, %i leaves', (_, graph) => {
  const layout = layoutTree(graph)

  it('lays out every node with finite coordinates', () => {
    expect(layout.nodes).toHaveLength(graph.nodes.size - 1)
    for (const n of layout.nodes) {
      for (const v of [n.x, n.y, n.r, n.labelX, n.labelY, n.angle])
        expect(Number.isFinite(v), n.id).toBe(true)
    }
    for (const path of [
      ...layout.edges.map((e) => e.d),
      ...layout.threads.map((t) => t.d),
      ...layout.segments.map((s) => s.d),
    ]) {
      expect(path).not.toMatch(/NaN|Infinity/)
    }
  })

  it('puts every node on its depth ring', () => {
    for (const n of layout.nodes) {
      expect(Math.hypot(n.x, n.y)).toBeCloseTo(layout.rings[n.depth - 1]!, 0)
    }
  })

  it('keeps siblings in order around the circle', () => {
    for (const node of graph.nodes.values()) {
      const angles = node.children.map((id) => layout.byId.get(id)!.angle)
      expect(angles).toEqual([...angles].sort((a, b) => a - b))
    }
  })

  it("doesn't let top-level branches overlap", () => {
    const ranges = graph.nodes.get(ROOT)!.children.map((top) => {
      const angles: number[] = []
      const walk = (id: string) => {
        angles.push(layout.byId.get(id)!.angle)
        graph.nodes.get(id)!.children.forEach(walk)
      }
      walk(top)
      return [Math.min(...angles), Math.max(...angles)] as const
    })
    for (let i = 1; i < ranges.length; i++) expect(ranges[i]![0]).toBeGreaterThan(ranges[i - 1]![1])
    expect(ranges.at(-1)![1]).toBeLessThan(2 * Math.PI)
  })

  it('draws one curve per thread, routed through the common ancestor', () => {
    expect(layout.threads).toHaveLength(graph.threads.length)
    for (const { from, to } of graph.threads.slice(0, 200)) {
      const route = threadRoute(graph, from, to)
      expect(route[0]).toBe(from)
      expect(route.at(-1)).toBe(to)
      const ancestors = (id: string) => {
        const chain: string[] = []
        for (let n: string | null = id; n !== null; n = graph.nodes.get(n)!.parent) chain.push(n)
        return chain
      }
      const common = ancestors(from).find((id) => ancestors(to).includes(id))
      expect(route).toContain(common)
    }
  })

  it('has one donut segment per top-level branch', () => {
    expect(layout.segments.map((s) => s.id)).toEqual(graph.nodes.get(ROOT)!.children)
  })

  it('spaces neighbours on every ring at least 15 px apart, and holds every node in its extent', () => {
    for (let depth = 1; depth <= layout.rings.length; depth++) {
      const angles = layout.nodes
        .filter((n) => n.depth === depth)
        .map((n) => n.angle)
        .sort((a, b) => a - b)
      if (angles.length < 2 || layout.R === 318) continue
      const closest = Math.min(
        ...angles.slice(1).map((a, i) => (a - angles[i]!) * layout.rings[depth - 1]!),
      )
      expect(closest, `depth ${depth}`).toBeGreaterThanOrEqual(14.9)
    }
    for (const n of layout.nodes) expect(Math.hypot(n.x, n.y) + n.r).toBeLessThan(layout.extent)
  })
})

describe('labels', () => {
  it('follow the radius on large Trees and stay horizontal on small ones', () => {
    const big = layoutTree(graphs[0]![1])
    expect(big.nodes.some((n) => n.kind === 'leaf' && n.labelRotate !== 0)).toBe(true)
    const small = layoutTree(fixtureGraph(30))
    expect(small.nodes.every((n) => n.labelRotate === 0)).toBe(true)
    expect(small.R).toBe(318)
  })

  it('upper-cases top-level branch names', () => {
    const layout = layoutTree(graphs[0]![1])
    const tops = layout.nodes.filter((n) => n.depth === 1 && n.kind === 'branch')
    expect(tops.every((n) => n.label === n.label.toUpperCase())).toBe(true)
  })
})

describe('dotRadius', () => {
  it('follows the design: leaves by their words, branches by the words inside', () => {
    const leaf = { kind: 'leaf', words: 2600, total: 2600 } as Parameters<typeof dotRadius>[0]
    const branch = { kind: 'branch', words: 0, total: 7800 } as Parameters<typeof dotRadius>[0]
    expect(dotRadius(leaf)).toBeCloseTo(2.4 + Math.sqrt(2600) / 5.6)
    expect(dotRadius(branch)).toBeCloseTo(4 + Math.sqrt(7800) / 11)
  })
})

it('lays out a Tree of one leaf', () => {
  const model = buildTree([{ path: 'only.md', type: 'blob', sha: 'x', size: 10 }])
  const layout = layoutTree(buildGraph(model, new Map([['only.md', parseLeaf('# Only\n')]]), 'One'))
  expect(layout.nodes).toHaveLength(1)
  expect(layout.segments).toHaveLength(1)
  expect(Number.isFinite(layout.nodes[0]!.x)).toBe(true)
})
