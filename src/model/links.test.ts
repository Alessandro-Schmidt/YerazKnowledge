import { describe, expect, it } from 'vitest'
import { destination, rewriteFileLinks, rewriteLinks } from './links'
import { parseLeaf } from './parse'

const moves = new Map([
  ['identity/keycloak.md', 'auth/keycloak.md'],
  ['a b.md', 'c/a b.md'],
])

describe('rewriteLinks', () => {
  it('points links at the new path and changes nothing else', () => {
    const text = '# T\r\n\r\nSee [Keycloak](/identity/keycloak.md) and [Other](/other.md).\r\n'
    expect(rewriteLinks(text, moves)).toBe(
      '# T\r\n\r\nSee [Keycloak](/auth/keycloak.md) and [Other](/other.md).\r\n',
    )
  })

  it('keeps anchors and titles, and handles angle brackets and encoded spaces', () => {
    expect(rewriteLinks('[K](/identity/keycloak.md#realms "Title")', moves)).toBe(
      '[K](/auth/keycloak.md#realms "Title")',
    )
    expect(rewriteLinks('[A](</a b.md>)', moves)).toBe('[A](</c/a b.md>)')
    expect(rewriteLinks('[A](/a%20b.md)', moves)).toBe('[A](</c/a b.md>)')
  })

  it('leaves links in code, images and other Trees alone', () => {
    const text = [
      '`[K](/identity/keycloak.md)`',
      '```',
      '[K](/identity/keycloak.md)',
      '```',
      '![K](/identity/keycloak.md)',
      '[K](https://github.com/u/r/blob/main/identity/keycloak.md)',
    ].join('\n')
    expect(rewriteLinks(text, moves)).toBe(text)
  })

  it('rewrites every link to a moved leaf, and the result parses to the new targets', () => {
    const text = '# T\n\n[a](/identity/keycloak.md) [b](/identity/keycloak.md)\n'
    const out = rewriteLinks(text, moves)
    expect(parseLeaf(out).links).toEqual([{ path: 'auth/keycloak.md', repo: null }])
  })
})

describe('rewriteFileLinks', () => {
  const moves = new Map([['assets/a.png', 'assets/a-2.png']])

  it('rewrites images and links to a renamed file, keeping their width and anchors', () => {
    expect(
      rewriteFileLinks(
        '![Realm](/assets/a.png "width=50%")\n[Download](/assets/a.png#x)\n![](/assets/b.png)\n',
        moves,
      ),
    ).toBe(
      '![Realm](/assets/a-2.png "width=50%")\n[Download](/assets/a-2.png#x)\n![](/assets/b.png)\n',
    )
  })

  it('leaves code and other addresses alone', () => {
    const text = '`![x](/assets/a.png)`\n![x](https://example.com/assets/a.png)\n'
    expect(rewriteFileLinks(text, moves)).toBe(text)
  })
})

describe('destination', () => {
  it('uses angle brackets only when the path needs them', () => {
    expect(destination('AI Agents/prompting.md')).toBe('</AI Agents/prompting.md>')
    expect(destination('ai/prompting.md')).toBe('/ai/prompting.md')
  })
})
