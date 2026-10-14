import { describe, expect, it } from 'vitest'
import { buildGraph } from '../model/graph'
import { parseLeaf } from '../model/parse'
import { buildTree } from '../model/tree'
import { planDelete, planMove, planNewBranch, planNewLeaf, StructureError } from './structure'

const files: Record<string, string> = {
  'identity/keycloak.md': '# Keycloak\n\nUses [OAuth](/identity/oauth.md).\n',
  'identity/keycloak/realms.md': '# Realms\n\nBack to [Keycloak](/identity/keycloak.md#top).\n',
  'identity/oauth.md':
    '# OAuth\n\nSee [Realms](/identity/keycloak/realms.md) and `[code](/identity/keycloak.md)`.\n',
  'AI Agents/prompting.md': '# Prompting\n\nAbout [Keycloak](/identity/keycloak.md).\n',
  'welcome.md': '# Welcome\n',
}
const graph = (() => {
  const model = buildTree(
    Object.keys(files).map((path) => ({ path, type: 'blob' as const, sha: path, size: 1 })),
  )
  return buildGraph(model, new Map(model.leaves.map((p) => [p, parseLeaf(files[p]!)])), 'T')
})()
const textOf = (p: string) => files[p]!

describe('planNewLeaf', () => {
  it('creates a slugged file at the root, in a branch, or in a leaf’s sibling folder', () => {
    expect(planNewLeaf(graph, '', 'Getting Started')).toEqual({
      path: 'getting-started.md',
      text: '# Getting Started\n\n',
    })
    expect(planNewLeaf(graph, 'identity', 'OIDC (v2)')).toMatchObject({
      path: 'identity/oidc-v2.md',
    })
    expect(planNewLeaf(graph, 'identity/keycloak.md', 'Tokens')).toMatchObject({
      path: 'identity/keycloak/tokens.md',
    })
  })

  it('never reuses a name taken by a leaf or a folder', () => {
    expect(planNewLeaf(graph, '', 'Welcome').path).toBe('welcome-2.md')
    expect(planNewLeaf(graph, 'identity', 'Keycloak').path).toBe('identity/keycloak-2.md')
    expect(planNewLeaf(graph, '', 'Assets').path).toBe('assets-2.md')
  })
})

describe('planNewBranch', () => {
  it('keeps the folder name as typed and adds a first leaf', () => {
    expect(planNewBranch(graph, '', 'Distributed Systems')).toEqual({
      branch: 'Distributed Systems',
      leaf: { path: 'Distributed Systems/untitled.md', text: '# Untitled\n\n' },
    })
    expect(planNewBranch(graph, 'identity', 'CI/CD', 'Pipelines').leaf.path).toBe(
      'identity/CI-CD/pipelines.md',
    )
  })

  it("avoids names already taken, ignoring case, and names a folder can't hold", () => {
    expect(planNewBranch(graph, '', 'ai agents').branch).toBe('ai agents 2')
    expect(planNewBranch(graph, '', '.hidden').branch).toBe('hidden')
    expect(planNewBranch(graph, '', '   ').branch).toBe('Untitled branch')
  })
})

describe('planMove', () => {
  it('moves a leaf with its sub-leaves and rewrites every backlink in the same change set', () => {
    const { changes, moves } = planMove(graph, textOf, 'identity/keycloak.md', 'AI Agents')
    expect([...moves]).toEqual([
      ['identity/keycloak.md', 'AI Agents/keycloak.md'],
      ['identity/keycloak/realms.md', 'AI Agents/keycloak/realms.md'],
    ])
    const byPath = Object.fromEntries(changes.map((c) => [c.path, c.text]))
    expect(byPath['identity/keycloak.md']).toBeNull()
    expect(byPath['identity/keycloak/realms.md']).toBeNull()
    // The moved leaf's own link to OAuth is root-relative: unchanged.
    expect(byPath['AI Agents/keycloak.md']).toBe(files['identity/keycloak.md'])
    // A moved leaf linking to another moved leaf is rewritten, anchor kept.
    expect(byPath['AI Agents/keycloak/realms.md']).toContain('(</AI Agents/keycloak.md#top>)')
    // Leaves outside: links rewritten, code left alone.
    expect(byPath['AI Agents/prompting.md']).toContain('(</AI Agents/keycloak.md>)')
    expect(byPath['identity/oauth.md']).toBe(
      '# OAuth\n\nSee [Realms](</AI Agents/keycloak/realms.md>) and `[code](/identity/keycloak.md)`.\n',
    )
    expect(byPath['welcome.md']).toBeUndefined()
  })

  it('refuses to move a leaf inside itself, and does nothing when the parent is the same', () => {
    expect(() =>
      planMove(graph, textOf, 'identity/keycloak.md', 'identity/keycloak/realms.md'),
    ).toThrow(StructureError)
    expect(planMove(graph, textOf, 'identity/oauth.md', 'identity').changes).toEqual([])
  })

  it('renames on arrival when the name is taken', () => {
    const { moves } = planMove(graph, textOf, 'identity/keycloak/realms.md', 'identity')
    expect(moves.get('identity/keycloak/realms.md')).toBe('identity/realms.md')
    const again = planMove(graph, textOf, 'welcome.md', 'identity')
    expect(again.moves.get('welcome.md')).toBe('identity/welcome.md')
  })
})

describe('planDelete', () => {
  it('deletes a leaf with its sub-leaves and lists the leaves that link to them', () => {
    const { changes, linkedFrom } = planDelete(graph, 'identity/keycloak.md')
    expect(changes).toEqual([
      { path: 'identity/keycloak.md', text: null },
      { path: 'identity/keycloak/realms.md', text: null },
    ])
    expect(linkedFrom.sort()).toEqual(['AI Agents/prompting.md', 'identity/oauth.md'])
  })

  it('deletes a whole branch', () => {
    expect(planDelete(graph, 'identity').changes).toHaveLength(3)
    expect(planDelete(graph, 'identity').linkedFrom).toEqual(['AI Agents/prompting.md'])
  })
})
