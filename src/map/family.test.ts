import { describe, expect, it } from 'vitest'
import { makeFixture } from '../../test/fake-github/fixture'
import { buildGraph, type Graph } from '../model/graph'
import { parseLeaf } from '../model/parse'
import { buildTree, ROOT } from '../model/tree'
import { familyLayout, familyNodeAt, positionOf, treeGraph, treesOf } from './family'

function graphOf(files: Record<string, string>, title = 'Family'): Graph {
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

// Two branches, a top-level leaf with a sub-leaf, a lone top-level leaf, and what isn't a Tree.
const small = graphOf({
  '.yeraz.json': '{"name":"Family"}',
  '.github/notes.md': '# Hidden\n',
  'assets/diagram.md': '# Not a leaf\n',
  'Identity/keycloak.md': '# 🔐 Keycloak\n\n[OIDC](/Identity/oidc.md) and [Realms](/realms.md)\n',
  'Identity/oidc.md': '# OIDC\n',
  'Chess/openings.md': '# Openings\n\n[Keycloak](/Identity/keycloak.md)\n',
  'realms.md': '# Realms\n\n[Sub](/realms/sub.md)\n',
  'realms/sub.md': '# Sub\n\n[Lone](/lone.md)\n',
  'lone.md': '# Lone\n',
  'README.md': '# Family\n\nStart at [Realms](/realms.md).\n',
})

describe('treeGraph', () => {
  it('is one top-level entry, rooted at itself, with only its own threads', () => {
    const tree = treeGraph(small, 'Identity')
    expect([...tree.nodes.keys()].sort()).toEqual(['', 'Identity/keycloak.md', 'Identity/oidc.md'])
    const root = tree.nodes.get(ROOT)!
    expect(root).toMatchObject({ kind: 'root', title: 'Identity', parent: null })
    expect(tree.nodes.get('Identity/oidc.md')!.parent).toBe(ROOT)
    expect(tree.threads).toEqual([{ from: 'Identity/keycloak.md', to: 'Identity/oidc.md' }])
    expect(tree.stats).toMatchObject({ leaves: 2, words: root.total })
  })

  it('makes a top-level leaf the core of its Tree, its sub-leaves around it', () => {
    const tree = treeGraph(small, 'realms.md')
    expect(tree.nodes.get(ROOT)!.title).toBe('Realms')
    expect(tree.nodes.get(ROOT)!.children).toEqual(['realms/sub.md'])
    expect(tree.threads).toEqual([{ from: ROOT, to: 'realms/sub.md' }])
  })
})

describe('familyLayout', () => {
  const family = familyLayout(small)

  it('makes every top-level folder and leaf a Tree, and nothing else', () => {
    expect(family.trees.map((t) => t.id)).toEqual(['Chess', 'Identity', 'lone.md', 'realms.md'])
    for (const id of small.nodes.keys())
      if (id !== ROOT && id !== 'README.md') expect(family.treeOf.get(id)?.id, id).toBeDefined()
    // The repository's README.md is the Family's own text, not a Tree.
    expect(small.nodes.get('README.md')?.kind).toBe('leaf')
    expect(family.treeOf.has('README.md')).toBe(false)
    expect(treesOf(small)).toEqual(family.trees.map((t) => t.id))
    expect(family.treeOf.get('realms/sub.md')!.id).toBe('realms.md')
  })

  it('draws threads between Trees between them, and keeps the rest inside each Tree', () => {
    expect(family.between.map((t) => `${t.from}>${t.to}`).sort()).toEqual([
      'Chess/openings.md>Identity/keycloak.md',
      'Identity/keycloak.md>realms.md',
      'realms/sub.md>lone.md',
    ])
    for (const t of family.between) expect(t.d).toMatch(/^M[-\d.]+,[-\d.]+/)
    const inside = family.trees.flatMap((t) => t.layout.threads)
    // Every thread but the README's.
    expect(inside).toHaveLength(small.threads.length - 1 - family.between.length)
  })

  it('gives a Tree of one leaf no empty rings', () => {
    const lone = family.treeOf.get('lone.md')!
    expect(lone.layout.nodes).toHaveLength(0)
    expect(lone.layout.rings).toEqual([])
  })

  it('places dots in Family coordinates: a Tree’s own id is its core', () => {
    const identity = family.treeOf.get('Identity')!
    expect(positionOf(family, 'Identity')).toEqual({
      x: identity.x,
      y: identity.y,
      r: identity.layout.coreR,
    })
    const dot = identity.layout.byId.get('Identity/oidc.md')!
    expect(positionOf(family, 'Identity/oidc.md')).toEqual({
      x: identity.x + dot.x,
      y: identity.y + dot.y,
      r: dot.r,
    })
    expect(positionOf(family, ROOT)).toBeNull()
  })

  it('finds the dot under a point, the Tree on its core, and nothing between Trees', () => {
    const at = positionOf(family, 'Identity/oidc.md')!
    expect(familyNodeAt(family, at.x, at.y, 0)).toBe('Identity/oidc.md')
    expect(familyNodeAt(family, at.x + at.r + 3, at.y, 5)).toBe('Identity/oidc.md')
    const core = positionOf(family, 'realms.md')!
    expect(familyNodeAt(family, core.x, core.y, 0)).toBe('realms.md')
    const b = family.bounds
    expect(familyNodeAt(family, b.x1 + 500, b.y1 + 500, 10)).toBeNull()
  })

  it('is computed once per graph', () => {
    expect(familyLayout(small)).toBe(family)
  })
})

describe.each([300, 1000])('a %i-leaf Family', (leaves) => {
  const graph = graphOf(
    makeFixture({ leaves, threads: Math.round(leaves * 1.5), seed: 7 }).files,
    'Fixture',
  )
  const family = familyLayout(graph)

  it('keeps Trees apart and inside the bounds', () => {
    expect(family.trees).toHaveLength(graph.nodes.get(ROOT)!.children.length)
    for (const [i, a] of family.trees.entries()) {
      const box = a.layout.bounds
      expect(a.x + box.x0).toBeGreaterThanOrEqual(family.bounds.x0)
      expect(a.y + box.y1).toBeLessThanOrEqual(family.bounds.y1)
      for (const b of family.trees.slice(i + 1))
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.id} / ${b.id}`).toBeGreaterThan(
          a.r + b.r - 2, // centres are rounded to whole units
        )
    }
  })

  it('draws every thread once: inside a Tree or between two', () => {
    const inside = family.trees.reduce((n, t) => n + t.layout.threads.length, 0)
    expect(inside + family.between.length).toBe(graph.threads.length)
    expect(family.between.length).toBeGreaterThan(0)
    for (const t of family.between) expect(t.d).not.toMatch(/NaN|Infinity/)
  })
})
