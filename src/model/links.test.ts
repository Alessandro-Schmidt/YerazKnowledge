import { describe, expect, it } from 'vitest'
import { destination, rewriteLinks } from './links'
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

describe('destination', () => {
  it('uses angle brackets only when the path needs them', () => {
    expect(destination('AI Agents/prompting.md')).toBe('</AI Agents/prompting.md>')
    expect(destination('ai/prompting.md')).toBe('/ai/prompting.md')
  })
})
