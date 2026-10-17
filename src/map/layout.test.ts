import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { designTrees } from '../../test/fake-github/designFixture'
import { makeFixture } from '../../test/fake-github/fixture'
import { buildGraph, type Graph } from '../model/graph'
import { parseLeaf } from '../model/parse'
import { buildTree, ROOT } from '../model/tree'
import { dotRadius, ICON_R, layoutTree, nodeAt, overlaps, threadRoute } from './layout'

function graphOf(files: Record<string, string>, title: string): Graph {
  const model = buildTree(
    Object.entries(files).map(([path, text]) => ({
      path,
      type: 'blob' as const,
      sha: path,
      size: text.length,
    })),
  )
  const parsed = new Map(model.leaves.map((p) => [p, parseLeaf(files[p]!)]))
  return buildGraph(model, parsed, title)
}

function fixtureGraph(leaves: number): Graph {
  const { files } = makeFixture({ leaves, threads: Math.round(leaves * 1.5), seed: 7 })
  return graphOf(files, 'Fixture')
}

/** knowledge-base-example/, the example Tree in this repository. */
function exampleGraph(): Graph {
  const root = 'knowledge-base-example'
  const files: Record<string, string> = {}
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else files[relative(root, path)] = readFileSync(path, 'utf8')
    }
  }
  walk(root)
  return graphOf(files, 'Armenia, Mathematics & Chess')
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

  it('spaces neighbours on every ring at least 15 px apart, and holds every node in its bounds', () => {
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
    const { x0, y0, x1, y1 } = layout.bounds
    for (const n of layout.nodes) {
      expect(n.x - n.r).toBeGreaterThan(x0)
      expect(n.x + n.r).toBeLessThan(x1)
      expect(n.y - n.r).toBeGreaterThan(y0)
      expect(n.y + n.r).toBeLessThan(y1)
    }
  })
})

describe('labels', () => {
  const trees: [string, Graph][] = [
    ['the example Tree', exampleGraph()],
    ...designTrees().map(
      (t) => [t.repo, graphOf(t.files as Record<string, string>, t.repo)] as [string, Graph],
    ),
    ...[12, 30, 40, 60, 80, 300].map((n) => [`${n} leaves`, fixtureGraph(n)] as [string, Graph]),
    ['1000 leaves', graphs[1]![1]],
  ]

  it.each(trees)('never overlap each other or a dot: %s', (_, graph) => {
    expect(overlaps(layoutTree(graph))).toEqual([])
  })

  // Odd shapes: long single-child chains, wide fans, long titles (some one unbroken word),
  // huge leaves, branches and leaves mixed at every depth.
  function randomTree(seed: number, icons = false): Record<string, string> {
    let state = seed
    const rand = () => {
      state = (state + 0x6d2b79f5) | 0
      let t = Math.imul(state ^ (state >>> 15), 1 | state)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
    const syllables = ['ka', 'lo', 'rin', 'te', 'mas', 'quo', 'vel', 'dra', 'sen', 'pho']
    const word = () => Array.from({ length: int(1, 4) }, () => syllables[int(0, 9)]).join('')
    const title = () =>
      rand() < 0.1
        ? Array.from({ length: int(8, 14) }, () => syllables[int(0, 9)]).join('')
        : Array.from({ length: int(1, rand() < 0.2 ? 9 : 3) }, word).join(' ')
    const files: Record<string, string> = { '.yeraz.json': '{"name":"Random"}\n' }
    let budget = int(5, 400)
    const fill = (dir: string, depth: number) => {
      const shape = rand()
      const count =
        depth === 0 ? int(1, 9) : shape < 0.25 ? 1 : shape < 0.9 ? int(1, 5) : int(10, 80)
      for (let i = 0; i < count && budget > 0; i++, budget--) {
        const name = `${dir}n${depth}-${i}`
        const deeper = depth < 7 && rand() < (shape < 0.25 ? 0.9 : 0.35)
        if (deeper && rand() < 0.3) {
          fill(`${name}/`, depth + 1) // a branch: a folder of its own
          continue
        }
        const words = rand() < 0.05 ? int(5000, 30000) : int(0, 800)
        const icon = icons && i % 2 === 0 ? `${['🔐', '🇦🇲', '♟️', '📐'][i % 4]} ` : ''
        files[`${name}.md`] = `# ${icon}${title()}\n\n${'word '.repeat(words)}\n`
        if (deeper) fill(`${name}/`, depth + 1) // a leaf with sub-leaves
      }
    }
    fill('', 0)
    return files
  }

  it('never overlap each other or a dot, whatever the shape of the Tree', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const layout = layoutTree(graphOf(randomTree(seed), `Random ${seed}`))
      expect(overlaps(layout), `seed ${seed}`).toEqual([])
    }
  })

  it('never overlap an emoji drawn on its dot', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const layout = layoutTree(graphOf(randomTree(seed, true), `Icons ${seed}`))
      expect(overlaps(layout), `seed ${seed}`).toEqual([])
    }
  })

  it('stay horizontal on small Trees where they fit, and follow the radius on large ones', () => {
    const big = layoutTree(graphs[0]![1])
    expect(big.nodes.some((n) => n.kind === 'leaf' && n.labelRotate !== 0)).toBe(true)
    const small = layoutTree(fixtureGraph(12))
    expect(small.nodes.filter((n) => n.labelRotate === 0).length).toBeGreaterThan(
      small.nodes.length / 2,
    )
  })

  it('keep a long Tree title inside the core', () => {
    const layout = layoutTree(exampleGraph())
    expect(layout.coreLines).toEqual(['Armenia,', 'Mathematics & Chess'])
    expect(layout.coreR).toBeGreaterThan(70)
    expect(layoutTree(fixtureGraph(12)).coreLines).toEqual(['Fixture'])
  })

  it('upper-cases top-level branch names', () => {
    const layout = layoutTree(graphs[0]![1])
    const tops = layout.nodes.filter((n) => n.depth === 1 && n.kind === 'branch')
    expect(tops.every((n) => n.label === n.label.toUpperCase())).toBe(true)
  })
})

describe('icons', () => {
  const graph = exampleGraph()
  const layout = layoutTree(graph)

  it("carries each leaf's emoji to its dot, and only a leaf's", () => {
    const withIcon = layout.nodes.filter((n) => n.icon !== null)
    expect(withIcon.map((n) => n.icon)).toContain('🇦🇲')
    for (const n of layout.nodes) expect(n.icon).toBe(graph.nodes.get(n.id)!.icon)
  })

  it('gives an emoji a dot big enough to hold it; words still grow it', () => {
    for (const n of layout.nodes.filter((n) => n.icon !== null))
      expect(n.r).toBeGreaterThanOrEqual(ICON_R)
    const leaf = { kind: 'leaf', words: 10, total: 10, icon: null } as Parameters<
      typeof dotRadius
    >[0]
    expect(dotRadius({ ...leaf, icon: '🔐' })).toBe(ICON_R)
    expect(dotRadius({ ...leaf, words: 9000, icon: '🔐' })).toBe(
      dotRadius({ ...leaf, words: 9000 }),
    )
  })
})

describe('edges', () => {
  it('know their depth, so the hierarchy can thin out from the core', () => {
    const layout = layoutTree(exampleGraph())
    for (const e of layout.edges) expect(e.depth).toBe(layout.byId.get(e.id)!.depth)
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

describe('nodeAt', () => {
  const layout = layoutTree(fixtureGraph(100))
  const leaf = layout.nodes.find((n) => n.kind === 'leaf')!

  it('finds the node under a point, and the nearest one within reach', () => {
    expect(nodeAt(layout, leaf.x, leaf.y, 0)).toBe(leaf.id)
    expect(nodeAt(layout, leaf.x + leaf.r + 2, leaf.y, 3)).toBe(leaf.id)
    const gap = (n: { x: number; y: number; r: number }) => Math.hypot(n.x - 5, n.y - 300) - n.r
    const nearest = [...layout.nodes].sort((a, b) => gap(a) - gap(b))[0]!
    expect(nodeAt(layout, 5, 300, 1000)).toBe(nearest.id)
  })

  it('answers the Tree itself on the core, and nothing on empty space', () => {
    expect(nodeAt(layout, 0, 0, 0)).toBe(ROOT)
    expect(nodeAt(layout, layout.coreR - 1, 0, 0)).toBe(ROOT)
    expect(nodeAt(layout, layout.R * 3, layout.R * 3, 4)).toBeNull()
  })
})
