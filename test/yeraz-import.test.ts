// The standalone import skill (skills/yeraz-import/convert.mjs): one file, no dependencies,
// the same repository format as src/import/convert.ts, plus an emoji on every title.

import { describe, expect, it } from 'vitest'
import { buildGraph } from '../src/model/graph'
import { parseLeaf } from '../src/model/parse'
import { buildTree } from '../src/model/tree'
import { importNotes, logseqToMarkdown, suggestEmoji } from '../skills/yeraz-import/convert.mjs'

const from = (files: Record<string, string>) => new Map(Object.entries(files))
const texts = (files: Map<string, string | Uint8Array>) =>
  Object.fromEntries([...files].filter(([p]) => /\.(md|json)$/.test(p))) as Record<string, string>
const familyOf = (t: Record<string, string>) => {
  const model = buildTree(
    Object.keys(t).map((path) => ({ path, type: 'blob' as const, sha: path })),
  )
  const leaves = new Map(
    Object.entries(t).flatMap(([p, x]) => (p.endsWith('.md') ? [[p, parseLeaf(x)] as const] : [])),
  )
  return buildGraph(model, leaves as Map<string, ReturnType<typeof parseLeaf>>, 'Family')
}

describe('yeraz-import', () => {
  it('converts an Obsidian vault and gives every leaf a title with an emoji', () => {
    const { files, report, pages } = importNotes(
      from({
        '.obsidian/app.json': '{}',
        'Identity/Identity.md': 'About identity.\n',
        'Identity/Keycloak.md':
          '---\ntitle: "Keycloak (IdP)"\n---\nSee [[OAuth|the protocol]] and [[OAuth#Refresh tokens]].\n\n![[realm.png]]\n',
        'Identity/OAuth.md': '# 🔑 OAuth\n\nBack to [[Keycloak]] and [[Missing note]].\n',
        'Attachments/realm.png': 'PNG',
      }),
      { name: 'Vault' },
    )
    const t = texts(files)
    expect(Object.keys(t).sort()).toEqual([
      '.yeraz.json',
      'Identity/Keycloak.md',
      'Identity/OAuth.md',
      'Identity/README.md',
    ])
    expect(files.get('assets/realm.png')).toBe('PNG')
    expect(t['Identity/Keycloak.md']).toBe(
      '# 🔐 Keycloak (IdP)\n\n<!-- Front matter, as imported:\ntitle: "Keycloak (IdP)"\n-->\n\n' +
        'See [the protocol](/Identity/OAuth.md) and [OAuth](/Identity/OAuth.md#refresh-tokens).\n\n![](/assets/realm.png)\n',
    )
    // An emoji already in the title stays; the branch's text gets one too.
    expect(t['Identity/OAuth.md']).toMatch(/^# 🔑 OAuth\n/)
    expect(t['Identity/README.md']).toBe('# 🔐 Identity\n\nAbout identity.\n')
    expect(report).toMatchObject({ leaves: 3, assets: 1, unresolved: ['Missing note'] })
    expect(pages.find((p) => p.path === 'Identity/OAuth.md')).toMatchObject({
      emoji: '🔑',
      suggested: false,
    })
    const graph = familyOf(t)
    expect(graph.nodes.get('Identity/Keycloak.md')).toMatchObject({
      title: 'Keycloak (IdP)',
      icon: '🔐',
    })
    expect(graph.out.get('Identity/Keycloak.md')).toContain('Identity/OAuth.md')
    expect(graph.ghosts.has('Identity/Missing note.md')).toBe(true)
  })

  it('takes emojis from a map by new or old path, then a guess, then the default', () => {
    const { files, pages } = importNotes(
      from({ 'Plain.md': 'Nothing in particular.\n', 'Trip.md': 'Flight at nine.\n' }),
      { emojis: { 'Plain.md': '🫓' }, defaultEmoji: '📄' },
    )
    const t = texts(files)
    expect(t['Plain.md']).toBe('# 🫓 Plain\n\nNothing in particular.\n')
    expect(t['Trip.md']).toBe('# ✈️ Trip\n\nFlight at nine.\n')
    expect(pages.map((p) => [p.path, p.emoji, p.suggested])).toEqual([
      ['Plain.md', '🫓', false],
      ['Trip.md', '✈️', true],
    ])
    const bare = texts(importNotes(from({ 'Plain.md': 'x\n' }), { emoji: false }).files)
    expect(bare['Plain.md']).toBe('# Plain\n\nx\n')
    expect(suggestEmoji('Untitled')).toBeNull()
    expect(texts(importNotes(from({ 'Untitled.md': 'x\n' })).files)['Untitled.md']).toMatch(
      /^# 📝 /,
    )
  })

  it('converts a Notion export: ids out of names, a page with its folder, a database as a file', () => {
    const id = '0123456789abcdef0123456789abcdef'
    const { files } = importNotes(
      from({
        [`Projects ${id}.md`]: `# Projects\n\n[Yeraz](Projects%20${id}/Yeraz%20${id}.md)\n`,
        [`Projects ${id}/Yeraz ${id}.md`]: `# Yeraz\n\nA map of notes.\n`,
        [`Projects ${id}/Tasks ${id}.csv`]: 'Name,Done\nShip,Yes\n',
      }),
    )
    const t = texts(files)
    expect(Object.keys(t).sort()).toEqual(['.yeraz.json', 'Projects.md', 'Projects/Yeraz.md'])
    expect(files.get('assets/tasks.csv')).toBe('Name,Done\nShip,Yes\n')
    expect(t['Projects.md']).toBe('# 🗂️ Projects\n\n[Yeraz](/Projects/Yeraz.md)\n')
    expect(t['Projects/Yeraz.md']).toMatch(/^# .+ Yeraz\n\nA map of notes\.\n$/)
  })

  it('converts a Logseq graph: pages, journals, namespaces, properties and the outline', () => {
    const { files, report } = importNotes(
      from({
        'logseq/config.edn': '{}',
        'pages/Cooking.md':
          'tags:: food\ntitle:: Cooking at home\n\n- Weeknight ideas\n\t- [[Cooking/Pasta]] and [[Soup]]\n\t- TODO buy salt\n- DONE plan the week ((6a1b2c3d-0000-4000-8000-000000000000))\n',
        'pages/Cooking___Pasta.md': '- Boil, then toss.\n',
        'journals/2026_10_26.md': '- Wrote the import skill #[[yeraz]]\n',
      }),
      { name: 'Graph' },
    )
    const t = texts(files)
    // A namespace is a leaf with sub-leaves, as Yeraz keeps them: `Cooking.md` + `Cooking/`.
    expect(Object.keys(t).sort()).toEqual([
      '.yeraz.json',
      'Cooking.md',
      'Cooking/Pasta.md',
      'Journals/2026-10-26.md',
    ])
    expect(t['Cooking.md']).toBe(
      '# 🍳 Cooking at home\n\n<!-- Properties, as imported:\ntags:: food\n-->\n\n' +
        'Weeknight ideas\n- [Cooking/Pasta](/Cooking/Pasta.md) and [Soup](/Soup.md)\n- [ ] buy salt\n\n[x] plan the week\n',
    )
    expect(t['Cooking/Pasta.md']).toBe('# 🍳 Pasta\n\nBoil, then toss.\n')
    expect(t['Journals/2026-10-26.md']).toBe('# 📓 2026-10-26\n\nWrote the import skill #yeraz\n')
    expect(report.unresolved).toEqual(['Soup'])
    expect(logseqToMarkdown('Plain prose, no bullets.\n')).toBeNull()
  })

  it('converts a Bear export: the title line, tags and the attachments folder', () => {
    const t = texts(
      importNotes(
        from({
          'Trip to Yerevan.md':
            '# Trip to Yerevan\n#travel #armenia\n\n![](Trip%20to%20Yerevan/cascade.jpg)\n',
          'Trip to Yerevan/cascade.jpg': 'JPG',
        }),
      ).files,
    )
    expect(t['Trip to Yerevan.md']).toBe(
      '# ✈️ Trip to Yerevan\n\n#travel #armenia\n\n![](/assets/cascade.jpg)\n',
    )
  })

  it('converts a OneNote page exported as HTML or MHT, with its images', () => {
    const html =
      '<html><head><title>Meeting notes</title><style>p{}</style></head><body>' +
      '<h1>Agenda</h1><p>Talk about <b>pricing</b> &amp; <a href="https://mercio.io">Mercio</a>.</p>' +
      '<ul><li>One</li><li>Two</li></ul><img src="data:image/png;base64,UE5H" alt="board">' +
      '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table></body></html>'
    const { files } = importNotes(from({ 'Work/Meeting.html': html }))
    const t = texts(files)
    expect(t['Work/Meeting.md']).toBe(
      '# 🗓️ Agenda\n\nTalk about **pricing** & [Mercio](https://mercio.io).\n\n- One\n- Two\n\n' +
        '![board](/assets/meeting-1.png)\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n',
    )
    expect(new TextDecoder().decode(files.get('assets/meeting-1.png') as Uint8Array)).toBe('PNG')

    const mht =
      'MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="----=_B"\r\n\r\n' +
      '------=_B\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n' +
      '<html><head><title>Idea</title></head><body><p>Caf=C3=A9 <img src="cid:pic1"></p></body></html>\r\n' +
      '------=_B\r\nContent-Type: image/jpeg\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <pic1>\r\n\r\nSlBH\r\n------=_B--\r\n'
    const m = texts(importNotes(from({ 'Idea.mht': mht })).files)
    expect(m['Idea.md']).toBe('# 💡 Idea\n\nCafé ![](/assets/idea-1.jpg)\n')
  })

  it('reports what it cannot convert, and marks the root', () => {
    const { files, report } = importNotes(from({ 'Note.md': 'x\n', 'Old.docx': 'DOCX' }), {
      name: 'Mine',
      color: 'amber',
    })
    expect(files.get('.yeraz.json')).toBe('{"name":"Mine","color":"amber"}\n')
    expect(report.skipped).toEqual(['Old.docx'])
  })
})
