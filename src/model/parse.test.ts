import { describe, expect, it } from 'vitest'
import { ownPath, parseLeaf, repairHeader, withIcon, withMeta } from './parse'

describe('title and icon', () => {
  it('reads the title from line 1', () => {
    expect(parseLeaf('# Keycloak\n\nBody.\n')).toMatchObject({ title: 'Keycloak', icon: null })
  })

  it('takes a leading emoji as the icon', () => {
    expect(parseLeaf('# 🔐 Keycloak\n')).toMatchObject({ title: 'Keycloak', icon: '🔐' })
    expect(parseLeaf('# 🔐Keycloak\n')).toMatchObject({ title: 'Keycloak', icon: '🔐' })
  })

  it('keeps multi-codepoint emoji whole: ZWJ sequences, skin tones, flags, variation selectors', () => {
    expect(parseLeaf('# 👩‍💻 Pairing\n')).toMatchObject({ icon: '👩‍💻', title: 'Pairing' })
    expect(parseLeaf('# 🧑🏽‍🔬 Lab\n')).toMatchObject({ icon: '🧑🏽‍🔬', title: 'Lab' })
    expect(parseLeaf('# 🇧🇷 Português\n')).toMatchObject({ icon: '🇧🇷', title: 'Português' })
    expect(parseLeaf('# ⚙️ Settings\n')).toMatchObject({ icon: '⚙️', title: 'Settings' })
    expect(parseLeaf('# 🏳️‍🌈 Pride\n')).toMatchObject({ icon: '🏳️‍🌈', title: 'Pride' })
  })

  it('does not take text-style symbols or digits as icons', () => {
    expect(parseLeaf('# © 2026 Notes\n')).toMatchObject({ icon: null, title: '© 2026 Notes' })
    expect(parseLeaf('# 1984\n')).toMatchObject({ icon: null, title: '1984' })
  })

  it('returns a null title when line 1 is not a heading', () => {
    expect(parseLeaf('Just text\n')).toMatchObject({ title: null, icon: null })
    expect(parseLeaf('')).toMatchObject({ title: null, words: 0, links: [] })
    expect(parseLeaf('## Second level\n')).toMatchObject({ title: null })
    expect(parseLeaf('#NoSpace\n')).toMatchObject({ title: null })
  })

  it('handles an icon-only title, closing hashes, indentation and a BOM', () => {
    expect(parseLeaf('# 🔐\n')).toMatchObject({ icon: '🔐', title: null })
    expect(parseLeaf('#\n')).toMatchObject({ title: null })
    expect(parseLeaf('# Keycloak ##\n')).toMatchObject({ title: 'Keycloak' })
    expect(parseLeaf('   # Indented\n')).toMatchObject({ title: 'Indented' })
    expect(parseLeaf('﻿# With BOM\n')).toMatchObject({ title: 'With BOM' })
  })
})

describe('line endings', () => {
  it('parses CRLF and lone CR the same as LF', () => {
    const lf = parseLeaf('# Title\n<!-- yeraz {"cover":"x"} -->\n\nSee [A](/a.md).\n')
    expect(parseLeaf('# Title\r\n<!-- yeraz {"cover":"x"} -->\r\n\r\nSee [A](/a.md).\r\n')).toEqual(
      lf,
    )
    expect(parseLeaf('# Title\r<!-- yeraz {"cover":"x"} -->\r\rSee [A](/a.md).\r')).toEqual(lf)
  })
})

describe('metadata (line 2)', () => {
  it('reads the yeraz comment on line 2', () => {
    const text =
      '# 🔐 Keycloak\n<!-- yeraz {"cover":"https://x/y.jpg","color":{"heading":"amber"}} -->\n'
    expect(parseLeaf(text).meta).toEqual({ cover: 'https://x/y.jpg', color: { heading: 'amber' } })
  })

  it('ignores it anywhere else, when malformed, or when not an object', () => {
    expect(parseLeaf('# T\n\n<!-- yeraz {"cover":"x"} -->\n').meta).toBeNull()
    expect(parseLeaf('# T\n<!-- yeraz {cover:x} -->\n').meta).toBeNull()
    expect(parseLeaf('# T\n<!-- yeraz [1,2] -->\n').meta).toBeNull()
    expect(parseLeaf('# T\n<!-- other {"a":1} -->\n').meta).toBeNull()
  })

  it('does not count the metadata as words', () => {
    expect(
      parseLeaf('# One\n<!-- yeraz {"cover":"https://images.unsplash.com/a-b-c"} -->\n').words,
    ).toBe(1)
  })
})

describe('words', () => {
  it('counts words in the title and body', () => {
    expect(parseLeaf('# Two words\n\nThree more here.\n').words).toBe(5)
  })

  it('counts accented, hyphenated and apostrophe words once each', () => {
    expect(parseLeaf("# Ação\n\nIt's a well-known café, naïve.\n").words).toBe(6)
  })

  it('counts link text but not link destinations', () => {
    expect(parseLeaf('# T\n\nSee [the realms](/identity/keycloak/realms.md).\n').words).toBe(4)
  })

  it('ignores Markdown syntax', () => {
    expect(parseLeaf('# T\n\n- [ ] **bold** _it_\n> quote\n---\n').words).toBe(4)
  })
})

describe('links', () => {
  it('finds root-relative links to leaves, decoded and without anchors', () => {
    const text =
      '# T\n\n[A](/a.md) [B](/b/c.md#part) [Space](</with space.md>) [Enc](/x%20y.md "Title")\n'
    expect(parseLeaf(text).links).toEqual([
      { path: 'a.md', repo: null },
      { path: 'b/c.md', repo: null },
      { path: 'with space.md', repo: null },
      { path: 'x y.md', repo: null },
    ])
  })

  it('finds links to leaves in other Trees as full GitHub URLs', () => {
    const text =
      '# T\n\n[Baroque](https://github.com/user/art-history/blob/main/periods/baroque.md#top)\n'
    expect(parseLeaf(text).links).toEqual([
      { path: 'periods/baroque.md', repo: 'user/art-history' },
    ])
  })

  it('ignores relative links, other files, images, external sites and escaped brackets', () => {
    const text = [
      '# T',
      '',
      '[rel](a.md) [up](../a.md) [img file](/assets/x.png) ![pic](/a.md)',
      '[site](https://example.com/a.md) [repo](https://github.com/user/repo)',
      '\\[not a link](/a.md) [//](//cdn.example.com/x.md)',
    ].join('\n')
    expect(parseLeaf(text).links).toEqual([])
  })

  it('ignores links inside fenced code blocks and inline code', () => {
    const text = [
      '# T',
      '',
      '```ts',
      "const s = '[no](/fenced.md)'",
      '```',
      '~~~~',
      '[no](/tilde.md)',
      '```',
      '[still code](/still.md)',
      '~~~~',
      'Inline `[no](/inline.md)` and ``[no](/double.md) ` x`` but [yes](/yes.md).',
    ].join('\n')
    expect(parseLeaf(text).links).toEqual([{ path: 'yes.md', repo: null }])
  })

  it('treats an unclosed fence as code until the end', () => {
    expect(parseLeaf('# T\n\n```\n[no](/a.md)\n').links).toEqual([])
  })

  it('handles brackets inside link text and links across lines', () => {
    const text = '# T\n\n[a [b] c](/nested.md) and [split\ntext](/split.md)\n'
    expect(parseLeaf(text).links.map((l) => l.path)).toEqual(['nested.md', 'split.md'])
  })

  it('lists each target once, in order of first appearance', () => {
    expect(
      parseLeaf('# T\n\n[A](/a.md) [B](/b.md) [A again](/a.md)\n').links.map((l) => l.path),
    ).toEqual(['a.md', 'b.md'])
  })
})

describe('on a generated Tree', () => {
  it('finds every thread the fixture wrote, and none of its decoys in code', async () => {
    const { makeFixture } = await import('../../test/fake-github/fixture')
    const { files, stats } = makeFixture({ leaves: 1000, threads: 1500, seed: 7 })
    const parsed = Object.entries(files)
      .filter(([path]) => path.endsWith('.md'))
      .map(([, text]) => parseLeaf(text))
    expect(parsed.every((p) => p.title !== null)).toBe(true)
    expect(parsed.reduce((n, p) => n + p.links.length, 0)).toBe(stats.threads)
    expect(parsed.some((p) => p.icon !== null)).toBe(true)
    expect(parsed.some((p) => p.meta !== null)).toBe(true)
  })
})

describe('withIcon', () => {
  it('sets, replaces and removes the icon, changing only line 1', () => {
    expect(withIcon('# Keycloak\r\n\r\nBody\r\n', '🔐')).toBe('# 🔐 Keycloak\r\n\r\nBody\r\n')
    expect(withIcon('# 🔐 Keycloak\nBody', '👩‍💻')).toBe('# 👩‍💻 Keycloak\nBody')
    expect(withIcon('# 🔐 Keycloak\nBody', null)).toBe('# Keycloak\nBody')
    expect(withIcon('# 🔐', null)).toBe('# Untitled')
  })

  it('adds a title line when there is none', () => {
    expect(withIcon('Just text\n', '📚')).toBe('# 📚 Untitled\n\nJust text\n')
  })
})

describe('ownPath', () => {
  it('reads a root-relative destination as a path in this repository', () => {
    expect(ownPath('/assets/2026-10-14-diagram.png')).toBe('assets/2026-10-14-diagram.png')
    expect(ownPath('</assets/my diagram.png>')).toBe('assets/my diagram.png')
    expect(ownPath('/assets/my%20diagram.png')).toBe('assets/my diagram.png')
  })

  it('leaves other destinations alone', () => {
    expect(ownPath('https://example.com/a.png')).toBeNull()
    expect(ownPath('//cdn.example.com/a.png')).toBeNull()
    expect(ownPath('assets/relative.png')).toBeNull()
  })
})

describe('withMeta: line 2, the metadata comment', () => {
  it('survives a round trip byte for byte, whatever its spacing and keys', () => {
    const text =
      '# 🔐 Keycloak\r\n<!-- yeraz { "cover": "/assets/c.png" ,"x-later":[1,2] } -->\r\n\r\nBody\r\n'
    expect(withMeta(text, parseLeaf(text).meta)).toBe(text)
  })

  it('writes changed metadata on line 2, keeping keys it doesn’t know and the line endings', () => {
    const text = '# Keycloak\r\n<!-- yeraz {"x-later":true} -->\r\nBody\r\n'
    const meta = { ...parseLeaf(text).meta, color: { heading: 'amber' } }
    expect(withMeta(text, meta)).toBe(
      '# Keycloak\r\n<!-- yeraz {"x-later":true,"color":{"heading":"amber"}} -->\r\nBody\r\n',
    )
  })

  it('adds line 2 when there is none, and removes it when nothing is left', () => {
    const plain = '# Keycloak\n\nBody\n'
    const styled = withMeta(plain, { cover: '/assets/c.png' })
    expect(styled).toBe('# Keycloak\n<!-- yeraz {"cover":"/assets/c.png"} -->\n\nBody\n')
    expect(parseLeaf(styled)).toMatchObject({ title: 'Keycloak', meta: { cover: '/assets/c.png' } })
    expect(withMeta(styled, {})).toBe(plain)
    expect(withMeta(styled, null)).toBe(plain)
  })

  it('keeps the title line, adding one to text without it', () => {
    expect(withMeta('# T', { cover: 'x' })).toBe('# T\n<!-- yeraz {"cover":"x"} -->')
    expect(withMeta('Just text\n', { cover: 'x' })).toBe(
      '# Untitled\n<!-- yeraz {"cover":"x"} -->\n\nJust text\n',
    )
  })

  it('never writes "-->" inside the comment', () => {
    const line = withMeta('# T\n', { cover: 'https://e.com/a-->b' }).split('\n')[1]!
    expect(line.indexOf('-->')).toBe(line.length - 3)
    expect(parseLeaf(withMeta('# T\n', { cover: 'https://e.com/a-->b' })).meta).toEqual({
      cover: 'https://e.com/a-->b',
    })
  })
})

describe('repairHeader: a header repeated, or pushed below line 2', () => {
  const amber = '<!-- yeraz {"color":{"heading":"amber"}} -->'
  const cover =
    '<!-- yeraz {"color":{"heading":"amber"},"cover":"/assets/2026-10-17-orbis-2026-10-02.png","coverPosition":37} -->'

  it('folds a repeated header into line 1 and 2; the repeat’s metadata, the newer, wins', () => {
    const text = `# 🇦🇲 Armenia\n${amber}\n\n# 🇦🇲 Armenia\n${cover}\n\nYerevan.\n`
    expect(repairHeader(text)).toBe(`# 🇦🇲 Armenia\n${cover}\n\nYerevan.\n`)
    const blue = '<!-- yeraz {"color":{"heading":"blue"},"x":1} -->'
    expect(repairHeader(`# T\n${blue}\n\n# T\n${amber}\nBody`)).toBe(
      '# T\n<!-- yeraz {"color":{"heading":"amber"},"x":1} -->\n\nBody',
    )
  })

  it('puts a comment pushed below the title back on line 2; line 2 wins over it', () => {
    expect(repairHeader(`# T\n\n${amber}\n\nBody\n`)).toBe(`# T\n${amber}\n\nBody\n`)
    const blue = '<!-- yeraz {"color":{"heading":"blue"}} -->'
    expect(repairHeader(`# T\n${blue}\n\n${cover}\n\nBody`)).toBe(
      '# T\n<!-- yeraz {"color":{"heading":"blue"},"cover":"/assets/2026-10-17-orbis-2026-10-02.png","coverPosition":37} -->\n\nBody',
    )
  })

  it('keeps the line endings, and the text as it is when there is nothing to repair', () => {
    expect(repairHeader(`# T\r\n${amber}\r\n\r\n# T\r\n${cover}\r\n\r\nBody\r\n`)).toBe(
      `# T\r\n${cover}\r\n\r\nBody\r\n`,
    )
    for (const text of [`# T\n${amber}\n\nBody\n`, '# T\n\nBody', '', `No title\n\n${amber}`])
      expect(repairHeader(text)).toBe(text)
  })

  it('leaves comments in code alone: there they are text about the format', () => {
    const text = `# T\n\n\`\`\`markdown\n# T\n${amber}\n\`\`\`\n`
    expect(repairHeader(text)).toBe(text)
  })
})
