import { describe, expect, it } from 'vitest'
import {
  buildGraph,
  compactWords,
  crumbs,
  humanize,
  neighbours,
  textFile,
  threadEnd,
} from './graph'
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

describe("a branch's text (its folder's README.md)", () => {
  const texts: Record<string, string> = {
    'AI Agents/README.md':
      '# 🤖 Agents, renamed\n\nHow we use [Prompting](</AI Agents/prompting.md>) and [Keycloak](/keycloak.md).\n',
    'AI Agents/prompting.md': '# Prompting\n\nSee [the branch](</AI Agents/README.md>).\n',
    'keycloak.md': '# Keycloak\n\nOne two three.\n',
  }
  const g = (() => {
    const model = buildTree(
      Object.entries(texts).map(([path, text]) => ({
        path,
        type: 'blob' as const,
        sha: `sha-${path}`,
        size: text.length,
      })),
    )
    const parsed = new Map(Object.entries(texts).map(([p, t]) => [p, parseLeaf(t)]))
    return buildGraph(model, parsed, 'T')
  })()

  it('keeps the folder name and adds no words, leaves or icon', () => {
    expect(g.nodes.get('AI Agents')).toMatchObject({
      kind: 'branch',
      title: 'AI Agents',
      icon: null,
      words: 0,
      total: g.nodes.get('AI Agents/prompting.md')!.words,
      sha: 'sha-AI Agents/README.md',
    })
    expect(g.nodes.has('AI Agents/README.md')).toBe(false)
    expect(g.stats).toMatchObject({ leaves: 2, branches: 1 })
  })

  it('makes its links threads from the branch, and links to it threads to the branch', () => {
    expect(g.threads).toEqual([
      { from: 'AI Agents/prompting.md', to: 'AI Agents' },
      { from: 'AI Agents', to: 'AI Agents/prompting.md' },
      { from: 'AI Agents', to: 'keycloak.md' },
    ])
    expect(g.in.get('keycloak.md')).toEqual(['AI Agents'])
    expect(threadEnd(g, 'AI Agents/README.md')).toBe('AI Agents')
    expect(threadEnd(g, 'keycloak.md')).toBe('keycloak.md')
    expect(threadEnd(g, 'nope.md')).toBeNull()
    expect(textFile(g, 'AI Agents')).toBe('AI Agents/README.md')
    expect(textFile(g, 'keycloak.md')).toBe('keycloak.md')
    expect(textFile(g, ROOT)).toBeNull()
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
