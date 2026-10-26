import { describe, expect, it } from 'vitest'
import {
  buildGraph,
  compactWords,
  ancestors,
  crumbs,
  ghostsFrom,
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

  it('keeps the folder name and adds no words or leaves; its icon and look are the text’s', () => {
    expect(g.nodes.get('AI Agents')).toMatchObject({
      kind: 'branch',
      title: 'AI Agents',
      icon: '🤖',
      words: 0,
      total: g.nodes.get('AI Agents/prompting.md')!.words,
      sha: 'sha-AI Agents/README.md',
    })
    expect(g.nodes.has('AI Agents/README.md')).toBe(false)
    expect(g.stats).toMatchObject({ leaves: 2, branches: 1 })
  })

  it('takes a cover and an image icon from its text’s line 2', () => {
    const files = {
      'Art/README.md':
        '# Art\n<!-- yeraz {"cover":"/assets/c.png","icon":"/assets/i.png","iconPosition":"center"} -->\n',
      'Art/caravaggio.md': '# Caravaggio\n',
    }
    const model = buildTree(
      Object.keys(files).map((path) => ({ path, type: 'blob' as const, sha: path, size: 1 })),
    )
    const parsed = new Map(Object.entries(files).map(([p, t]) => [p, parseLeaf(t)]))
    expect(buildGraph(model, parsed, 'T').nodes.get('Art')).toMatchObject({
      title: 'Art',
      icon: null,
      image: '/assets/i.png',
      meta: { cover: '/assets/c.png', iconPosition: 'center' },
    })
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

describe('ghost leaves: links to leaves not written yet', () => {
  const tree: Record<string, string> = {
    'identity/keycloak.md':
      '# Keycloak\n\n[OAuth](/identity/oauth.md), [PKCE](/identity/oauth/pkce.md), [Realms](/identity/keycloak/realms.md).\n',
    'identity/oidc.md':
      '# OIDC\n\nBuilt on [OAuth](</identity/oauth.md#flows>), [Keycloak](/identity/Keycloak.md).\n',
    'identity/README.md': '# Identity\n\n[Glossary](/identity/glossary.md)\n',
    'notes.md':
      '# Notes\n\n[new tree](/later/plan.md) [asset](/assets/a.md) [hidden](/.github/x.md) [text](/x/README.md) [self](/notes.md) [other](https://github.com/u/r/blob/main/z.md)\n',
  }
  const graphWith = (extra: Record<string, string> = {}) => {
    const all = { ...tree, ...extra }
    const model = buildTree(
      Object.keys(all).map((path) => ({ path, type: 'blob' as const, sha: path, size: 1 })),
    )
    return buildGraph(model, new Map(Object.entries(all).map(([p, t]) => [p, parseLeaf(t)])), 'T')
  }

  it('turns a link to a missing leaf into one ghost, with every leaf that links to it', () => {
    const g = graphWith()
    expect(g.ghosts.get('identity/oauth.md')).toEqual({
      id: 'identity/oauth.md',
      parent: 'identity',
      title: 'Oauth',
      from: ['identity/keycloak.md', 'identity/oidc.md'],
    })
    // Ghosts are not nodes, threads or leaves: the counts are of what is written.
    expect(g.nodes.has('identity/oauth.md')).toBe(false)
    expect(g.threads).toEqual([])
    expect(g.stats).toMatchObject({ leaves: 3, threads: 0 })
  })

  it('places a ghost under the nearest node its path implies', () => {
    const g = graphWith()
    // Sub-leaf of an existing leaf: in its sibling folder.
    expect(g.ghosts.get('identity/keycloak/realms.md')!.parent).toBe('identity/keycloak.md')
    // Its folder doesn't exist yet (and neither does oauth.md): the nearest branch holds it.
    expect(g.ghosts.get('identity/oauth/pkce.md')!.parent).toBe('identity')
    // From a branch's text.
    expect(g.ghosts.get('identity/glossary.md')!.from).toEqual(['identity'])
    // In a Tree not planted yet: at the top of the Family.
    expect(g.ghosts.get('later/plan.md')!.parent).toBe(ROOT)
  })

  it('ignores assets, hidden paths, branch texts, self-links, other Trees and case twins', () => {
    expect([...graphWith().ghosts.keys()].sort()).toEqual([
      'identity/glossary.md',
      'identity/keycloak/realms.md',
      'identity/oauth.md',
      'identity/oauth/pkce.md',
      'later/plan.md',
    ])
  })

  it('becomes a thread once the leaf is written', () => {
    const g = graphWith({ 'identity/oauth.md': '# OAuth\n' })
    expect(g.ghosts.has('identity/oauth.md')).toBe(false)
    expect(g.ghosts.get('identity/oauth/pkce.md')!.parent).toBe('identity/oauth.md')
    expect(g.in.get('identity/oauth.md')).toEqual(['identity/keycloak.md', 'identity/oidc.md'])
  })

  it('lights a ghost with its linkers, and a leaf with its ghosts', () => {
    const g = graphWith()
    expect(ghostsFrom(g, 'identity/oidc.md')).toEqual(['identity/oauth.md'])
    expect([...neighbours(g, 'identity/oauth.md')].sort()).toEqual([
      'identity',
      'identity/keycloak.md',
      'identity/oauth.md',
      'identity/oidc.md',
    ])
    expect(neighbours(g, 'identity/oidc.md').has('identity/oauth.md')).toBe(true)
  })
})

describe('hidden nodes (line 2 `"hidden": true`)', () => {
  const hiddenFiles: Record<string, string> = {
    '.yeraz.json': '{"name":"Engineering"}',
    'identity/keycloak.md':
      '# 🔐 Keycloak\n<!-- yeraz {"hidden":true} -->\n\nUses [OAuth](/identity/oauth.md).\n',
    'identity/keycloak/realms.md': '# Realms\n\nSee [OAuth](/identity/oauth.md).\n',
    'identity/oauth.md':
      '# OAuth 2.0\n\nSee [Keycloak](/identity/keycloak.md) and [Realms](/identity/keycloak/realms.md).\n',
    'archive/README.md': '# 📦 Old\n<!-- yeraz {"hidden":true} -->\n',
    'archive/2019.md': '# 2019\n\nWords words.\n',
    'ai-agents/prompting.md': '# Prompting\n\nThree words here.\n',
  }
  const graph = () => {
    const model = buildTree(
      Object.entries(hiddenFiles).map(([path, text]) => ({
        path,
        type: 'blob' as const,
        sha: path,
        size: text.length,
      })),
    )
    const leaves = new Map(
      Object.keys(hiddenFiles)
        .filter((p) => p.endsWith('.md'))
        .map((p) => [p, parseLeaf(hiddenFiles[p]!)]),
    )
    return buildGraph(model, leaves, 'Engineering')
  }

  it('leaves the graph with everything under it, and is listed to be shown again', () => {
    const g = graph()
    expect([...g.nodes.keys()].sort()).toEqual([
      '',
      'ai-agents',
      'ai-agents/prompting.md',
      'identity',
      'identity/oauth.md',
    ])
    expect(g.nodes.get('identity')!.children).toEqual(['identity/oauth.md'])
    expect(g.hidden).toEqual([
      { id: 'archive', kind: 'branch', title: 'Archive', icon: '📦' },
      { id: 'identity/keycloak.md', kind: 'leaf', title: 'Keycloak', icon: '🔐' },
    ])
    const words =
      g.nodes.get('identity/oauth.md')!.words + g.nodes.get('ai-agents/prompting.md')!.words
    expect(g.stats).toMatchObject({ leaves: 2, branches: 2, words })
    expect(g.nodes.get('')!.total).toBe(words)
  })

  it('makes no thread from or to a hidden leaf, and no ghost for a link to one', () => {
    const g = graph()
    expect(g.threads).toEqual([])
    expect(g.out.get('identity/oauth.md')).toBeUndefined()
    expect(g.ghosts.size).toBe(0)
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
    // The trail above it, root first, for the Peek's breadcrumbs.
    expect(ancestors(graphOf(), 'identity/keycloak/realms.md').map((n) => n.id)).toEqual([
      '',
      'identity',
      'identity/keycloak.md',
    ])
    expect(ancestors(graphOf(), '')).toEqual([])
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
