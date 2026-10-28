import { describe, expect, it } from 'vitest'
import type { TreeRef } from '../github/graphql'
import { buildGraph, neighbours, type Graph } from '../model/graph'
import { parseLeaf } from '../model/parse'
import { buildTree, ROOT } from '../model/tree'
import { allId, familiesLayout, mergeFamilies, splitId } from './families'
import { familyNodeAt, positionOf } from './family'

function graphOf(files: Record<string, string>, title: string): Graph {
  const model = buildTree(
    Object.entries(files).map(([path, text]) => ({
      path,
      type: 'blob' as const,
      sha: path,
      size: text.length,
    })),
  )
  return buildGraph(model, new Map(model.leaves.map((p) => [p, parseLeaf(files[p]!)])), title)
}

const ref = (repo: string, title: string): TreeRef => {
  const [owner, name] = repo.split('/') as [string, string]
  return { owner, name, repo, branch: 'main', isPrivate: true, title, color: null }
}

const engineering = {
  ref: ref('you/Engineering', 'Engineering'),
  graph: graphOf(
    {
      'Identity/keycloak.md':
        '# Keycloak\n\n[OIDC](/Identity/oidc.md), [Baroque](https://github.com/you/art/blob/main/Baroque/caravaggio.md)\n',
      'Identity/oidc.md': '# OIDC\n',
      'welcome.md': '# Welcome\n\n[Nowhere](https://github.com/else/where/blob/main/x.md)\n',
      'README.md': '# Engineering\n',
    },
    'Engineering',
  ),
}
const art = {
  ref: ref('you/art', 'Art'),
  graph: graphOf({ 'Baroque/caravaggio.md': '# Caravaggio\n', 'welcome.md': '# Welcome\n' }, 'Art'),
}

describe('mergeFamilies', () => {
  const merged = mergeFamilies([engineering, art], 'All Families')

  it('puts every Family’s Trees under one root, ids prefixed so two welcome.md never clash', () => {
    expect(merged.nodes.get(ROOT)!.children.sort()).toEqual([
      'you/art::Baroque',
      'you/art::welcome.md',
      'you/engineering::Identity',
      'you/engineering::welcome.md',
    ])
    // The Family's README.md is its text, not a Tree.
    expect(merged.nodes.has('you/engineering::README.md')).toBe(false)
    expect(merged.nodes.get('you/engineering::Identity/oidc.md')).toMatchObject({
      parent: 'you/engineering::Identity',
      title: 'OIDC',
    })
    expect(merged.stats.leaves).toBe(engineering.graph.stats.leaves + art.graph.stats.leaves)
  })

  it('keeps threads inside a Family, and links to another connected Family become threads', () => {
    const keycloak = allId('you/Engineering', 'Identity/keycloak.md')
    const caravaggio = allId('you/art', 'Baroque/caravaggio.md')
    expect(merged.threads).toContainEqual({
      from: keycloak,
      to: allId('you/engineering', 'Identity/oidc.md'),
    })
    expect(merged.threads).toContainEqual({ from: keycloak, to: caravaggio })
    expect(neighbours(merged, caravaggio)).toContain(keycloak)
    // A link to a repository that isn't connected leads nowhere on this map.
    expect(merged.threads.some((t) => t.from.endsWith('::welcome.md'))).toBe(false)
  })

  it('links to another Family’s branch or Tree, or to a Family kept in a folder (root), are threads', () => {
    const notes = {
      ref: { ...ref('you/project', 'Project'), root: 'notes' },
      graph: graphOf({ 'Plans/roadmap.md': '# Roadmap\n', 'Plans/README.md': '# Plans\n' }, 'P'),
    }
    const from = {
      ref: ref('you/home', 'Home'),
      graph: graphOf(
        {
          'links.md':
            '# Links\n\n[Plans](https://github.com/you/project/blob/main/notes/Plans/README.md), ' +
            '[Roadmap](https://github.com/you/project/blob/main/notes/Plans/roadmap.md), ' +
            '[Baroque](https://github.com/you/art/blob/main/Baroque/README.md)\n',
        },
        'Home',
      ),
    }
    const all = mergeFamilies([from, notes, art], 'All Families')
    const links = allId('you/home', 'links.md')
    expect(all.threads).toContainEqual({ from: links, to: allId('you/project', 'Plans') })
    expect(all.threads).toContainEqual({
      from: links,
      to: allId('you/project', 'Plans/roadmap.md'),
    })
    // A branch without its README.md yet: still the branch.
    expect(all.threads).toContainEqual({ from: links, to: allId('you/art', 'Baroque') })
  })

  it('splits a merged id back into its Family and node', () => {
    expect(splitId('you/engineering::Identity/oidc.md')).toEqual({
      repo: 'you/engineering',
      id: 'Identity/oidc.md',
    })
    expect(splitId(ROOT)).toBeNull()
  })
})

describe('familiesLayout', () => {
  const merged = mergeFamilies([engineering, art], 'All Families')
  const layout = familiesLayout(merged)

  it('packs each Family’s Trees together, inside its own ring', () => {
    expect(layout.groups.map((g) => g.id).sort()).toEqual(['you/art', 'you/engineering'])
    for (const t of layout.trees) {
      const g = layout.groups.find((g) => g.id === splitId(t.id)!.repo)!
      expect(Math.hypot(t.x - g.x, t.y - g.y) + t.r).toBeLessThanOrEqual(g.r + 1)
    }
    const [a, b] = layout.groups as [(typeof layout.groups)[0], (typeof layout.groups)[0]]
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r - 1)
  })

  it('draws the thread between Families, and finds every dot', () => {
    expect(layout.between.map((t) => t.to)).toContain('you/art::Baroque/caravaggio.md')
    const p = positionOf(layout, 'you/art::Baroque/caravaggio.md')!
    expect(familyNodeAt(layout, p.x, p.y, 2)).toBe('you/art::Baroque/caravaggio.md')
  })
})
