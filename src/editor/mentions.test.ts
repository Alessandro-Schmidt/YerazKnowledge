import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { parseLeaf } from '../model/parse'
import { mentionLink } from '../model/links'
import { completeMention, mentionSource, type MentionLeaf } from './mentions'

const LEAVES: MentionLeaf[] = [
  { path: 'identity/keycloak.md', title: 'Keycloak', icon: '🔐' },
  { path: 'identity/oauth.md', title: 'OAuth 2.0', icon: null },
  { path: 'notes/a [draft].md', title: 'A [draft] (v2)', icon: null },
]

const source = {
  leaves: () => LEAVES,
  leaf: (path: string) => LEAVES.find((l) => l.path === path) ?? null,
  open: () => undefined,
}

function complete(doc: string, explicit = false): CompletionResult | null {
  const state = EditorState.create({ doc, extensions: [mentionSource.of(source)] })
  return completeMention(new CompletionContext(state, doc.length, explicit)) as CompletionResult
}

describe('mentionLink', () => {
  it('writes a root-relative Markdown link: a thread', () => {
    expect(mentionLink('Keycloak', 'identity/keycloak.md')).toBe(
      '[Keycloak](/identity/keycloak.md)',
    )
  })

  it('escapes brackets in the title and wraps paths that need it', () => {
    const link = mentionLink('A [draft] (v2)', 'notes/a [draft].md')
    expect(link).toBe('[A \\[draft\\] (v2)](</notes/a [draft].md>)')
    expect(parseLeaf(`# T\n\n${link}\n`).links).toEqual([
      { path: 'notes/a [draft].md', repo: null },
    ])
  })
})

describe('completeMention', () => {
  it('offers every leaf, with its icon, right after an @', () => {
    const result = complete('See @')!
    expect(result.from).toBe(5)
    expect(result.options.map((o) => o.displayLabel)).toEqual([
      '🔐 Keycloak',
      'OAuth 2.0',
      'A [draft] (v2)',
    ])
  })

  it('keeps the query after the @ for filtering', () => {
    expect(complete('See @key')!.from).toBe(5)
  })

  it('needs the @ at the start of a word: an e-mail address is not a mention', () => {
    expect(complete('me@exa')).toBeNull()
    expect(complete('@')).not.toBeNull()
  })

  it('stays out of the way without a leaf list', () => {
    const state = EditorState.create({ doc: '@' })
    expect(completeMention(new CompletionContext(state, 1, false))).toBeNull()
  })
})
