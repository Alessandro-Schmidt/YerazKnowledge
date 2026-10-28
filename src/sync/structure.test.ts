import { describe, expect, it } from 'vitest'
import { buildGraph } from '../model/graph'
import { parseLeaf } from '../model/parse'
import { buildTree, ROOT } from '../model/tree'
import {
  planDelete,
  planMove,
  planMoveAcross,
  planNewBranch,
  planNewLeaf,
  planNewLeaves,
  planGhostLeaf,
  leavesUnder,
  moveReads,
  planBranchText,
  planTemplate,
  StructureError,
  titlesIn,
} from './structure'

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

  it('starts from a template, filled with the title, the day and the Tree', () => {
    const template = '# 📝 Meeting\n\n{{title}} in {{tree}} on {{date}}\n'
    const now = new Date(2026, 9, 27)
    expect(planNewLeaf(graph, 'identity/keycloak.md', 'Tokens', { template, now })).toEqual({
      path: 'identity/keycloak/tokens.md',
      text: '# 📝 Tokens\n\nTokens in Identity on 2026-10-27\n',
    })
    // At the top of the Family the leaf is a Tree of its own.
    expect(planNewLeaf(graph, ROOT, 'Plans', { template, now }).text).toBe(
      '# 📝 Plans\n\nPlans in Plans on 2026-10-27\n',
    )
    expect(
      planNewLeaves(graph, 'AI Agents', ['A', 'B'], { template, now }).map((c) => c.text),
    ).toEqual([
      '# 📝 A\n\nA in AI Agents on 2026-10-27\n',
      '# 📝 B\n\nB in AI Agents on 2026-10-27\n',
    ])
  })
})

describe('planTemplate', () => {
  it('writes a template in .yeraz/templates/, named as typed, never over another', () => {
    expect(planTemplate(graph, 'Meeting notes')).toEqual({
      path: '.yeraz/templates/meeting-notes.md',
      text: '# Meeting notes\n\n',
    })
    const withOne = { ...graph, templates: [{ path: '.yeraz/templates/meeting-notes.md' }] }
    expect(
      planTemplate(withOne as typeof graph, 'Meeting Notes', '# 📝 Meeting Notes\n\nx\n'),
    ).toEqual({
      path: '.yeraz/templates/meeting-notes-2.md',
      text: '# 📝 Meeting Notes\n\nx\n',
    })
  })
})

describe('planGhostLeaf', () => {
  const ghost = { id: 'identity/oauth/pkce.md', parent: 'identity', title: 'Pkce', from: [] }
  it('writes the leaf at the linked path, titled as the link reads', () => {
    const linking =
      '# K\n\n`[no](/identity/oauth/pkce.md)` [**PKCE** flow](</identity/oauth/pkce.md#x>)\n'
    expect(planGhostLeaf(ghost, linking)).toEqual({
      path: 'identity/oauth/pkce.md',
      text: '# PKCE flow\n\n',
    })
    expect(planGhostLeaf(ghost, '# K\n\n[@PKCE](/identity/oauth/pkce.md)').text).toBe('# PKCE\n\n')
  })

  it('falls back to the file name without a readable label', () => {
    expect(planGhostLeaf(ghost, null).text).toBe('# Pkce\n\n')
    expect(planGhostLeaf(ghost, '# K\n\n[](/identity/oauth/pkce.md)').text).toBe('# Pkce\n\n')
  })
})

describe('planNewLeaves', () => {
  it('creates every leaf under one parent, named like a single new leaf', () => {
    expect(planNewLeaves(graph, 'identity/keycloak.md', ['🔐 Tokens', 'Clients'])).toEqual([
      { path: 'identity/keycloak/tokens.md', text: '# 🔐 Tokens\n\n' },
      { path: 'identity/keycloak/clients.md', text: '# Clients\n\n' },
    ])
    expect(planNewLeaves(graph, 'AI Agents', ['Evals']).map((c) => c.path)).toEqual([
      'AI Agents/evals.md',
    ])
  })

  it('never reuses a name, whether taken in the folder or earlier in the batch', () => {
    expect(
      planNewLeaves(graph, 'identity', ['OAuth', 'Notes', 'notes', 'NOTES!', '🔐']).map(
        (c) => c.path,
      ),
    ).toEqual([
      'identity/oauth-2.md',
      'identity/notes.md',
      'identity/notes-2.md',
      'identity/notes-3.md',
      'identity/untitled.md',
    ])
  })
})

describe('titlesIn', () => {
  it('reads one title per line, skipping blank lines and list bullets', () => {
    expect(
      titlesIn('  Tokens \n\n- 🔐 Realms\r\n* Clients\n+ Scopes\n-1 below zero\n   \n'),
    ).toEqual(['Tokens', '🔐 Realms', 'Clients', 'Scopes', '-1 below zero'])
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

  it('moves a Tree (a branch) under another Tree, everything in it, links rewritten (#81)', () => {
    const { changes, moves, id } = planMove(graph, textOf, 'identity', 'AI Agents')
    expect(id).toBe('AI Agents/identity')
    expect([...moves].sort()).toEqual([
      ['identity/keycloak.md', 'AI Agents/identity/keycloak.md'],
      ['identity/keycloak/realms.md', 'AI Agents/identity/keycloak/realms.md'],
      ['identity/oauth.md', 'AI Agents/identity/oauth.md'],
    ])
    const byPath = Object.fromEntries(changes.map((c) => [c.path, c.text]))
    expect(byPath['identity/oauth.md']).toBeNull()
    expect(byPath['AI Agents/identity/oauth.md']).toContain(
      '(</AI Agents/identity/keycloak/realms.md>)',
    )
    expect(byPath['AI Agents/prompting.md']).toContain('(</AI Agents/identity/keycloak.md>)')
    // And back to the top, where it is a Tree again.
    expect(planMove(graph, textOf, 'AI Agents', 'identity').id).toBe('identity/AI Agents')
  })

  it('refuses to move a branch inside itself; at its parent already, nothing changes', () => {
    expect(() => planMove(graph, textOf, 'identity', 'identity/keycloak.md')).toThrow(
      StructureError,
    )
    expect(() => planMove(graph, textOf, 'identity', 'identity')).toThrow(StructureError)
    expect(planMove(graph, textOf, 'identity', '').changes).toEqual([])
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

describe("a branch's text (README.md) in structure edits", () => {
  const texts: Record<string, string> = {
    'identity/keycloak.md': '# Keycloak\n',
    'identity/keycloak/clients/README.md':
      '# Clients\n\nKinds of [Keycloak](/identity/keycloak.md).\n',
    'identity/keycloak/clients/public.md':
      '# Public\n\nUp to [clients](/identity/keycloak/clients/README.md).\n',
    'AI Agents/README.md': '# AI Agents\n\nStart with [Keycloak](/identity/keycloak.md).\n',
    'AI Agents/prompting.md': '# Prompting\n',
  }
  const g = (() => {
    const model = buildTree(
      Object.keys(texts).map((path) => ({ path, type: 'blob' as const, sha: path, size: 1 })),
    )
    return buildGraph(model, new Map(Object.entries(texts).map(([p, t]) => [p, parseLeaf(t)])), 'T')
  })()

  it('moves the texts of branches inside a moved leaf, and rewrites links in and to them', () => {
    expect(moveReads(g, 'identity/keycloak.md').sort()).toEqual([
      'AI Agents/README.md',
      'identity/keycloak.md',
      'identity/keycloak/clients/README.md',
      'identity/keycloak/clients/public.md',
    ])
    const { changes, moves } = planMove(g, (p) => texts[p]!, 'identity/keycloak.md', 'AI Agents')
    expect(moves.get('identity/keycloak/clients/README.md')).toBe(
      'AI Agents/keycloak/clients/README.md',
    )
    const byPath = Object.fromEntries(changes.map((c) => [c.path, c.text]))
    expect(byPath['identity/keycloak/clients/README.md']).toBeNull()
    expect(byPath['AI Agents/keycloak/clients/README.md']).toContain('(</AI Agents/keycloak.md>)')
    expect(byPath['AI Agents/keycloak/clients/public.md']).toContain(
      '(</AI Agents/keycloak/clients/README.md>)',
    )
    // A branch's text linking to the moved leaf is rewritten in the same commit.
    expect(byPath['AI Agents/README.md']).toBe(
      '# AI Agents\n\nStart with [Keycloak](</AI Agents/keycloak.md>).\n',
    )
  })

  it("deletes a branch's text with the branch, and names branches that link in", () => {
    expect(planDelete(g, 'AI Agents').changes).toEqual([
      { path: 'AI Agents/README.md', text: null },
      { path: 'AI Agents/prompting.md', text: null },
    ])
    const { changes, linkedFrom } = planDelete(g, 'identity/keycloak.md')
    expect(changes.map((c) => c.path)).toContain('identity/keycloak/clients/README.md')
    expect(linkedFrom).toEqual(['AI Agents'])
  })

  it("starts a branch's text with the branch's name as its heading", () => {
    expect(planBranchText(g, 'AI Agents')).toEqual({
      path: 'AI Agents/README.md',
      text: '# AI Agents\n\n',
    })
    expect(() => planBranchText(g, 'identity/keycloak.md')).toThrow(StructureError)
  })

  it('never names a new leaf or branch README in a branch', () => {
    expect(planNewLeaf(g, 'AI Agents', 'README').path).toBe('AI Agents/readme-2.md')
    expect(planNewBranch(g, 'AI Agents', 'readme').branch).toBe('AI Agents/readme 2')
    expect(planNewLeaf(g, ROOT, 'README').path).toBe('readme.md')
  })
})

describe('hidden leaves and branches in structure edits', () => {
  // Hidden from the map (line 2), but still files of the Tree: names stay taken, and they
  // move and go with what holds them.
  const hiddenFiles: Record<string, string> = {
    'Archive/README.md': '# Archive\n<!-- yeraz {"hidden":true} -->\n',
    'Archive/old.md': '# Old\n',
    'identity/keycloak.md': '# Keycloak\n',
    'identity/keycloak/legacy.md':
      '# Legacy\n<!-- yeraz {"hidden":true} -->\n\nSee [OAuth](/identity/oauth.md).\n',
    'identity/oauth.md': '# OAuth\n',
    'welcome.md': '# Welcome\n',
  }
  const hiddenGraph = (() => {
    const model = buildTree(
      Object.keys(hiddenFiles).map((path) => ({ path, type: 'blob' as const, sha: path, size: 1 })),
    )
    return buildGraph(
      model,
      new Map([...model.leaves, ...model.texts.keys()].map((p) => [p, parseLeaf(hiddenFiles[p]!)])),
      'T',
    )
  })()
  const hiddenText = (p: string) => hiddenFiles[p]!

  it('never takes a name a hidden leaf or branch holds', () => {
    expect(hiddenGraph.nodes.has('Archive')).toBe(false)
    expect(planNewBranch(hiddenGraph, ROOT, 'Archive').branch).toBe('Archive 2')
    expect(planNewLeaf(hiddenGraph, 'identity/keycloak.md', 'Legacy').path).toBe(
      'identity/keycloak/legacy-2.md',
    )
    const moved = planMove(hiddenGraph, hiddenText, 'welcome.md', 'identity/keycloak.md')
    expect(moved.id).toBe('identity/keycloak/welcome.md')
  })

  it('deletes hidden sub-leaves with what holds them', () => {
    const { changes } = planDelete(hiddenGraph, 'identity/keycloak.md')
    expect(changes.map((c) => c.path).sort()).toEqual([
      'identity/keycloak.md',
      'identity/keycloak/legacy.md',
    ])
    // The dialog counts what goes, hidden leaves included.
    expect(leavesUnder(hiddenGraph, 'identity/keycloak.md')).toHaveLength(2)
  })

  it('moves hidden sub-leaves, and rewrites a hidden leaf’s link to a moved one', () => {
    expect(moveReads(hiddenGraph, 'identity/keycloak.md')).toContain('identity/keycloak/legacy.md')
    const { changes } = planMove(hiddenGraph, hiddenText, 'identity/keycloak.md', ROOT)
    expect(changes.map((c) => c.path)).toEqual(
      expect.arrayContaining(['keycloak/legacy.md', 'identity/keycloak/legacy.md']),
    )

    expect(moveReads(hiddenGraph, 'identity/oauth.md')).toContain('identity/keycloak/legacy.md')
    const oauth = planMove(hiddenGraph, hiddenText, 'identity/oauth.md', ROOT)
    expect(oauth.changes).toContainEqual({
      path: 'identity/keycloak/legacy.md',
      text: '# Legacy\n<!-- yeraz {"hidden":true} -->\n\nSee [OAuth](/oauth.md).\n',
    })
  })
})

describe('planMoveAcross: to another Family', () => {
  const graphOf = (files: Record<string, string>) => {
    const model = buildTree(
      Object.keys(files).map((path) => ({ path, type: 'blob' as const, sha: path, size: 1 })),
    )
    return buildGraph(model, new Map(model.leaves.map((p) => [p, parseLeaf(files[p] ?? '')])), 'T')
  }
  const source: Record<string, string> = {
    ...files,
    'identity/keycloak.md':
      '# Keycloak\n\nUses [OAuth](/identity/oauth.md).\n\n![Realm](/assets/realm.png)\n',
    'assets/realm.png': '',
  }
  const other = graphOf({ 'notes/welcome.md': '# Welcome\n', 'assets/realm.png': '' })
  const plan = () =>
    planMoveAcross(
      {
        graph: graphOf(source),
        textOf: (p) => source[p]!,
        url: (p) => `https://github.com/you/work/blob/main/${p}`,
      },
      'identity/keycloak.md',
      {
        graph: other,
        parent: 'notes',
        url: (p) => `https://github.com/you/home/blob/main/${p}`,
        taken: (p) => p === 'assets/realm.png',
      },
    )

  it('writes the leaf and its sub-leaves in the other Family, its images copied beside', () => {
    const { dest, assets, id } = plan()
    expect(id).toBe('notes/keycloak.md')
    const byPath = Object.fromEntries(dest.map((c) => [c.path, c.text]))
    expect(Object.keys(byPath).sort()).toEqual(['notes/keycloak.md', 'notes/keycloak/realms.md'])
    // Links between the moved leaves stay threads; to the Family they left, full URLs.
    expect(byPath['notes/keycloak/realms.md']).toContain('(/notes/keycloak.md#top)')
    expect(byPath['notes/keycloak.md']).toContain(
      '[OAuth](https://github.com/you/work/blob/main/identity/oauth.md)',
    )
    // An image of the same name there already: this one gets its own.
    expect(byPath['notes/keycloak.md']).toContain('![Realm](/assets/realm-2.png)')
    expect([...assets]).toEqual([['assets/realm.png', 'assets/realm-2.png']])
  })

  it('removes them here; links to them from here go to the other Family', () => {
    const byPath = Object.fromEntries(plan().source.map((c) => [c.path, c.text]))
    expect(byPath['identity/keycloak.md']).toBeNull()
    expect(byPath['identity/keycloak/realms.md']).toBeNull()
    expect(byPath['AI Agents/prompting.md']).toContain(
      '[Keycloak](https://github.com/you/home/blob/main/notes/keycloak.md)',
    )
    expect(byPath['identity/oauth.md']).toContain(
      '[Realms](https://github.com/you/home/blob/main/notes/keycloak/realms.md)',
    )
    // The image stays here too: other leaves may show it.
    expect(byPath['assets/realm.png']).toBeUndefined()
  })

  it('moves a whole Tree to the top of the other Family', () => {
    const {
      dest,
      source: here,
      id,
    } = planMoveAcross(
      { graph: graphOf(source), textOf: (p) => source[p]!, url: () => null },
      'identity',
      { graph: other, parent: ROOT, url: () => null, taken: () => false },
    )
    expect(id).toBe('identity')
    expect(dest.map((c) => c.path).sort()).toEqual([
      'identity/keycloak.md',
      'identity/keycloak/realms.md',
      'identity/oauth.md',
    ])
    expect(here.filter((c) => c.text === null)).toHaveLength(3)
  })
})
