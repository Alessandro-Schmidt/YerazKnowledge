import { describe, expect, it } from 'vitest'
import { buildGraph, compactWords, crumbs, humanize, neighbours, treeThreads } from './graph'
import { parseLeaf } from './parse'
import { buildTree, ROOT } from './tree'

const files: Record<string, string> = {
  '.yeraz.json': '{"name":"Engineering"}',
  'identity/keycloak.md':
    '# 🔐 Keycloak\n\nUses [OAuth](/identity/oauth.md) and [OIDC](/identity/oidc.md).\n',
  'identity/keycloak/realms.md':
    '# Realms\n\nOne realm per environment. See [Keycloak](/identity/keycloak.md).\n',
  'identity/oauth.md':
    '# OAuth 2.0\n\nSee [missing](/nope.md), [self](/identity/oauth.md), [art](https://github.com/u/art/blob/main/b.md).\n',
  'identity/oidc.md': 'no title line\n',
  'ai-agents/prompting.md': '# Prompting\n\nThree words here.\n',
}

const graphOf = (parsedPaths = Object.keys(files)) => {
  const model = buildTree(
    Object.entries(files).map(([path, text]) => ({
      path,
      type: 'blob' as const,
      sha: path,
      size: text.length,
    })),
  )
  const leaves = new Map(
    parsedPaths.filter((p) => p.endsWith('.md')).map((p) => [p, parseLeaf(files[p]!)]),
  )
  return buildGraph(model, leaves, 'Engineering')
}

describe('buildGraph', () => {
  it('takes titles and icons from leaves, names from folders, the Tree name for the root', () => {
    const g = graphOf()
    expect(g.nodes.get(ROOT)!.title).toBe('Engineering')
    expect(g.nodes.get('identity/keycloak.md')).toMatchObject({
      title: 'Keycloak',
      icon: '🔐',
      kind: 'leaf',
    })
    expect(g.nodes.get('ai-agents')).toMatchObject({ title: 'Ai Agents', kind: 'branch' })
    expect(g.nodes.get('identity/oidc.md')!.title).toBe('Oidc')
  })

  it('adds up words from leaves to the root', () => {
    const g = graphOf()
    const own = (id: string) => g.nodes.get(id)!.words
    expect(g.nodes.get('ai-agents')!.total).toBe(own('ai-agents/prompting.md'))
    expect(g.nodes.get('identity/keycloak.md')!.total).toBe(
      own('identity/keycloak.md') + own('identity/keycloak/realms.md'),
    )
    expect(g.stats.words).toBe(
      [
        'identity/keycloak.md',
        'identity/keycloak/realms.md',
        'identity/oauth.md',
        'identity/oidc.md',
        'ai-agents/prompting.md',
      ]
        .map(own)
        .reduce((a, b) => a + b),
    )
  })

  it('estimates words from size until content arrives', () => {
    const g = graphOf([])
    const keycloak = g.nodes.get('identity/keycloak.md')!
    expect(keycloak).toMatchObject({ loaded: false, title: 'Keycloak', icon: null })
    expect(keycloak.words).toBe(Math.round(files['identity/keycloak.md']!.length / 6))
  })

  it('keeps threads to existing leaves only, without self-links, and lists links to other Trees', () => {
    const g = graphOf()
    expect(g.threads).toEqual([
      { from: 'identity/keycloak.md', to: 'identity/oauth.md' },
      { from: 'identity/keycloak.md', to: 'identity/oidc.md' },
      { from: 'identity/keycloak/realms.md', to: 'identity/keycloak.md' },
    ])
    expect(g.in.get('identity/keycloak.md')).toEqual(['identity/keycloak/realms.md'])
    expect(g.out.get('identity/keycloak.md')).toEqual(['identity/oauth.md', 'identity/oidc.md'])
    expect(g.external).toEqual([{ from: 'identity/oauth.md', repo: 'u/art', path: 'b.md' }])
    expect(g.stats).toMatchObject({ leaves: 5, branches: 2, threads: 3 })
  })
})

describe('neighbours and crumbs', () => {
  it('keeps the parent, children and thread ends bright', () => {
    expect([...neighbours(graphOf(), 'identity/keycloak.md')].sort()).toEqual([
      'identity',
      'identity/keycloak.md',
      'identity/keycloak/realms.md',
      'identity/oauth.md',
      'identity/oidc.md',
    ])
  })

  it('lists ancestor titles below the root', () => {
    expect(crumbs(graphOf(), 'identity/keycloak/realms.md')).toEqual(['Identity', 'Keycloak'])
    expect(crumbs(graphOf(), 'identity')).toEqual([])
  })
})

describe('formatting', () => {
  it('humanizes names and compacts word counts', () => {
    expect(humanize('rest-design')).toBe('Rest Design')
    expect(humanize('iOS_notes')).toBe('IOS Notes')
    expect(compactWords(40_512)).toBe('40.5k')
    expect(compactWords(900)).toBe('900')
    expect(compactWords(1000)).toBe('1k')
  })
})

describe('treeThreads: threads between Trees, for Home', () => {
  const tree = (title: string, files: Record<string, string>) => {
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
  const art = tree('Art', {
    'baroque.md':
      '# Baroque\n\n[Bach](https://github.com/You/Music/blob/main/bach.md), [fugue](https://github.com/you/music/blob/main/fugue.md)\n',
    'self.md': '# Self\n\n[me](https://github.com/you/art/blob/main/baroque.md)\n',
    'elsewhere.md': '# Elsewhere\n\n[x](https://github.com/someone/else/blob/main/x.md)\n',
  })
  const music = tree('Music', {
    'bach.md': '# Bach\n\n[Baroque](https://github.com/you/art/blob/main/baroque.md)\n',
  })

  it('counts each direction between connected Trees, ignoring itself and unknown repositories', () => {
    expect(
      treeThreads([
        { repo: 'you/art', graph: art },
        { repo: 'you/music', graph: music },
      ]),
    ).toEqual([
      { from: 'you/art', to: 'you/music', count: 2 },
      { from: 'you/music', to: 'you/art', count: 1 },
    ])
  })
})
