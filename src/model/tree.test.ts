import { describe, expect, it } from 'vitest'
import { branchText, buildTree, isLeafPath, ROOT, type TreeEntryLike } from './tree'

const blob = (path: string, size = 60): TreeEntryLike => ({
  path,
  type: 'blob',
  sha: `sha-${path}`,
  size,
})
const dir = (path: string): TreeEntryLike => ({ path, type: 'tree', sha: `tree-${path}` })

const shape = (entries: TreeEntryLike[]) => {
  const tree = buildTree(entries)
  return Object.fromEntries(
    [...tree.nodes.values()].map((n) => [n.id || '(root)', `${n.kind}: ${n.children.join(', ')}`]),
  )
}

describe('buildTree', () => {
  it('turns a folder into a branch', () => {
    expect(shape([dir('identity'), blob('identity/keycloak.md')])).toEqual({
      '(root)': 'root: identity',
      identity: 'branch: identity/keycloak.md',
      'identity/keycloak.md': 'leaf: ',
    })
  })

  it('turns a .md file into a leaf', () => {
    expect(shape([blob('welcome.md')])).toEqual({
      '(root)': 'root: welcome.md',
      'welcome.md': 'leaf: ',
    })
  })

  it('puts the contents of a same-named sibling folder under the leaf (sub-leaves and sub-branches)', () => {
    expect(
      shape([
        blob('identity/keycloak.md'),
        blob('identity/keycloak/realms.md'),
        blob('identity/keycloak/clients/public.md'),
      ]),
    ).toEqual({
      '(root)': 'root: identity',
      identity: 'branch: identity/keycloak.md',
      'identity/keycloak.md': 'leaf: identity/keycloak/clients, identity/keycloak/realms.md',
      'identity/keycloak/clients': 'branch: identity/keycloak/clients/public.md',
      'identity/keycloak/clients/public.md': 'leaf: ',
      'identity/keycloak/realms.md': 'leaf: ',
    })
  })

  it('applies the sibling-folder rule at the root', () => {
    expect(shape([blob('notes.md'), dir('notes'), blob('notes/today.md')])).toEqual({
      '(root)': 'root: notes.md',
      'notes.md': 'leaf: notes/today.md',
      'notes/today.md': 'leaf: ',
    })
  })

  it('leaves out folders with no leaves in them', () => {
    expect(shape([dir('empty'), dir('pictures'), blob('pictures/cat.png'), blob('a.md')])).toEqual({
      '(root)': 'root: a.md',
      'a.md': 'leaf: ',
    })
  })

  it('creates intermediate branches for deep leaves', () => {
    expect(shape([blob('a/b/c/d.md')])).toEqual({
      '(root)': 'root: a',
      a: 'branch: a/b',
      'a/b': 'branch: a/b/c',
      'a/b/c': 'branch: a/b/c/d.md',
      'a/b/c/d.md': 'leaf: ',
    })
  })

  it('ignores assets, dotfiles, dot-folders and non-Markdown files', () => {
    expect(
      shape([
        blob('.yeraz.json'),
        blob('.github/workflows/notes.md'),
        blob('assets/diagram.md'),
        blob('assets/x.png'),
        blob('drafts/.hidden.md'),
        blob('README.MD'),
        { path: 'vendor', type: 'commit', sha: 'submodule' },
        blob('real.md'),
      ]),
    ).toEqual({
      '(root)': 'root: real.md',
      'real.md': 'leaf: ',
    })
  })

  it("makes README.md in a branch's folder the branch's text, not a leaf", () => {
    const tree = buildTree([blob('AI Agents/README.md', 90), blob('AI Agents/prompting.md')])
    expect(shape([blob('AI Agents/README.md'), blob('AI Agents/prompting.md')])).toEqual({
      '(root)': 'root: AI Agents',
      'AI Agents': 'branch: AI Agents/prompting.md',
      'AI Agents/prompting.md': 'leaf: ',
    })
    expect(tree.leaves).toEqual(['AI Agents/prompting.md'])
    expect(tree.nodes.get('AI Agents')).toMatchObject({
      kind: 'branch',
      name: 'AI Agents',
      text: { path: 'AI Agents/README.md', sha: 'sha-AI Agents/README.md', size: 90 },
    })
    expect(tree.texts).toEqual(new Map([['AI Agents/README.md', 'AI Agents']]))
    expect(branchText('AI Agents')).toBe('AI Agents/README.md')
  })

  it('keeps a folder holding only its README.md as a branch with text', () => {
    const tree = buildTree([blob('a/b/README.md'), blob('x.md')])
    expect(shape([blob('a/b/README.md'), blob('x.md')])).toEqual({
      '(root)': 'root: a, x.md',
      a: 'branch: a/b',
      'a/b': 'branch: ',
      'x.md': 'leaf: ',
    })
    expect(tree.nodes.get('a')).toMatchObject({ text: null })
    expect(tree.nodes.get('a/b')).toMatchObject({ text: { path: 'a/b/README.md' } })
  })

  it('leaves README.md at the root and in a leaf’s sibling folder an ordinary leaf', () => {
    expect(
      shape([blob('README.md'), blob('identity/keycloak.md'), blob('identity/keycloak/README.md')]),
    ).toEqual({
      '(root)': 'root: identity, README.md',
      'README.md': 'leaf: ',
      identity: 'branch: identity/keycloak.md',
      'identity/keycloak.md': 'leaf: identity/keycloak/README.md',
      'identity/keycloak/README.md': 'leaf: ',
    })
  })

  it('matches the name README.md exactly, case included', () => {
    expect(shape([blob('notes/readme.md'), blob('notes/Readme.md')])).toEqual({
      '(root)': 'root: notes',
      notes: 'branch: notes/readme.md, notes/Readme.md',
      'notes/Readme.md': 'leaf: ',
      'notes/readme.md': 'leaf: ',
    })
  })

  it('makes a folder named README beside a branch text a branch, not a leaf’s sub-folder', () => {
    expect(shape([blob('x/README.md'), blob('x/README/y.md')])).toEqual({
      '(root)': 'root: x',
      x: 'branch: x/README',
      'x/README': 'branch: x/README/y.md',
      'x/README/y.md': 'leaf: ',
    })
  })

  it('orders branches before leaves, then by name, numbers naturally', () => {
    const tree = buildTree([
      blob('b.md'),
      blob('a.md'),
      blob('z/x.md'),
      blob('item10.md'),
      blob('item9.md'),
    ])
    expect(tree.nodes.get(ROOT)!.children).toEqual(['z', 'a.md', 'b.md', 'item9.md', 'item10.md'])
  })

  it('records names, parents, depths, SHAs and sizes', () => {
    const tree = buildTree([blob('identity/keycloak.md', 120), blob('identity/keycloak/realms.md')])
    expect(tree.nodes.get('identity/keycloak/realms.md')).toEqual({
      kind: 'leaf',
      id: 'identity/keycloak/realms.md',
      name: 'realms',
      parent: 'identity/keycloak.md',
      depth: 3,
      children: [],
      sha: 'sha-identity/keycloak/realms.md',
      size: 60,
    })
    expect(tree.nodes.get('identity')).toMatchObject({
      kind: 'branch',
      name: 'identity',
      parent: ROOT,
      depth: 1,
    })
    expect(tree.leaves).toEqual(['identity/keycloak.md', 'identity/keycloak/realms.md'])
  })

  it('builds a 5,000-leaf fixture with every leaf reachable from the root', async () => {
    const { makeFixture } = await import('../../test/fake-github/fixture')
    const { files, stats } = makeFixture({ leaves: 5000, threads: 7500, seed: 7 })
    const tree = buildTree(Object.keys(files).map((p) => blob(p)))
    expect(tree.leaves).toHaveLength(5000)
    let reached = 0
    const walk = (id: string) => {
      const node = tree.nodes.get(id)!
      if (node.kind === 'leaf') reached++
      node.children.forEach(walk)
    }
    walk(ROOT)
    expect(reached).toBe(5000)
    expect(Math.max(...tree.leaves.map((id) => tree.nodes.get(id)!.depth))).toBe(stats.maxDepth)
  })
})

describe('isLeafPath', () => {
  it('accepts Markdown files outside assets and hidden folders', () => {
    expect(isLeafPath('a.md')).toBe(true)
    expect(isLeafPath('notes/assets/a.md')).toBe(true)
    expect(isLeafPath('assets/a.md')).toBe(false)
    expect(isLeafPath('.github/a.md')).toBe(false)
    expect(isLeafPath('a.markdown')).toBe(false)
  })
})
