import { describe, expect, it } from 'vitest'
import { buildGraph } from '../model/graph'
import { parseLeaf } from '../model/parse'
import { buildTree } from '../model/tree'
import { importNotes } from './convert'

const encoder = new TextEncoder()
const from = (files: Record<string, string>) =>
  new Map(Object.entries(files).map(([p, t]) => [p, encoder.encode(t)]))
const texts = (files: Map<string, string | Uint8Array>) =>
  Object.fromEntries([...files].filter(([, v]) => typeof v === 'string')) as Record<string, string>

describe('importNotes', () => {
  it('converts an Obsidian vault: wikilinks, aliases, headings, embeds, folder notes', () => {
    const { files, report } = importNotes(
      from({
        '.obsidian/app.json': '{}',
        'Identity/Identity.md': 'About identity.\n',
        'Identity/Keycloak.md':
          '---\ntitle: "Keycloak (IdP)"\ntags: [auth]\n---\nSee [[OAuth|the protocol]] and [[OAuth#Refresh tokens]].\n\n![[realm.png]]\n',
        'Identity/OAuth.md':
          '# OAuth\n\nBack to [[Keycloak]]. `[[not a link]]` and [[Missing note]].\n',
        'Attachments/realm.png': '\x89PNG',
      }),
      'Vault',
    )
    expect([...files.keys()].sort()).toEqual([
      '.yeraz.json',
      'Identity/Keycloak.md',
      'Identity/OAuth.md',
      'Identity/README.md',
      'assets/realm.png',
    ])
    expect(files.get('.yeraz.json')).toBe('{"name":"Vault"}\n')
    const t = texts(files)
    expect(t['Identity/README.md']).toBe('# Identity\n\nAbout identity.\n')
    expect(t['Identity/Keycloak.md']).toBe(
      '# Keycloak (IdP)\n\n<!-- Front matter, as imported:\ntitle: "Keycloak (IdP)"\ntags: [auth]\n-->\n\n' +
        'See [the protocol](/Identity/OAuth.md) and [OAuth](/Identity/OAuth.md#refresh-tokens).\n\n![](/assets/realm.png)\n',
    )
    expect(t['Identity/OAuth.md']).toBe(
      '# OAuth\n\nBack to [Keycloak](/Identity/Keycloak.md). `[[not a link]]` and [Missing note](</Identity/Missing note.md>).\n',
    )
    expect(report).toEqual({ leaves: 3, assets: 1, links: 5, unresolved: ['Missing note'] })

    // The result reads as a Family: threads between the leaves, the missing note a ghost.
    const model = buildTree(
      Object.keys(t).map((path) => ({ path, type: 'blob' as const, sha: path })),
    )
    const leaves = new Map(
      Object.entries(t).flatMap(([p, x]) => (p.endsWith('.md') ? [[p, parseLeaf(x)]] : [])),
    )
    const graph = buildGraph(model, leaves as Map<string, ReturnType<typeof parseLeaf>>, 'Vault')
    expect(graph.nodes.get('Identity/Keycloak.md')?.title).toBe('Keycloak (IdP)')
    expect(graph.out.get('Identity/Keycloak.md')).toContain('Identity/OAuth.md')
    expect(graph.ghosts.has('Identity/Missing note.md')).toBe(true)
  })

  it('converts a Notion export: ids out of names, a page with its folder, encoded links', () => {
    const id = '0123456789abcdef0123456789abcdef'
    const other = 'fedcba9876543210fedcba9876543210'
    const { files } = importNotes(
      from({
        [`Projects ${id}.md`]: `# Projects\n\n[Road map](Projects%20${id}/Road%20map%20${other}.md)\n`,
        [`Projects ${id}/Road map ${other}.md`]: `# Road map\n\n![Plan](Road%20map%20${other}/plan.png)\n`,
        [`Projects ${id}/Road map ${other}/plan.png`]: 'png',
      }),
      'Notion',
    )
    const t = texts(files)
    expect(Object.keys(t).sort()).toEqual(['.yeraz.json', 'Projects.md', 'Projects/Road map.md'])
    expect(t['Projects.md']).toBe('# Projects\n\n[Road map](</Projects/Road map.md>)\n')
    expect(t['Projects/Road map.md']).toBe('# Road map\n\n![Plan](/assets/plan.png)\n')
    expect(files.get('assets/plan.png')).toBeInstanceOf(Uint8Array)
  })

  it('converts a plain folder: titles from names, relative links, clashing assets', () => {
    const { files } = importNotes(
      from({
        'notes/a.md': 'Text with [b](../other/b.md#part "B") and [web](https://example.com).\n',
        'other/b.md': '![one](img/photo.jpg) ![two](../notes/img/photo.JPG)\n',
        'other/img/photo.jpg': '1',
        'notes/img/photo.JPG': '2',
      }),
      'Plain',
    )
    const t = texts(files)
    expect(t['notes/a.md']).toBe(
      '# a\n\nText with [b](/other/b.md#part "B") and [web](https://example.com).\n',
    )
    expect(t['other/b.md']).toBe('# b\n\n![one](/assets/photo-2.jpg) ![two](/assets/photo.jpg)\n')
    expect(files.has('assets/photo.jpg') && files.has('assets/photo-2.jpg')).toBe(true)
  })
})
