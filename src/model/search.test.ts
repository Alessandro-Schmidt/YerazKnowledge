import { describe, expect, it } from 'vitest'
import { bodyOf, search, snippet, type Searchable } from './search'

const items: Searchable[] = [
  { repo: 'you/eng', id: 'identity/keycloak.md', title: 'Keycloak', kind: 'leaf', icon: '🔐' },
  { repo: 'you/eng', id: 'identity', title: 'Identity', kind: 'branch', icon: null },
  {
    repo: 'you/eng',
    id: 'identity/oauth.md',
    title: 'OAuth 2.0 and Keycloak tokens',
    kind: 'leaf',
    icon: null,
  },
  {
    repo: 'you/art',
    id: 'armenia/etchmiadzin.md',
    title: 'Ējmiatsin Cathedral',
    kind: 'leaf',
    icon: null,
  },
  {
    repo: 'you/art',
    id: 'chess/petrosian.md',
    title: 'Tigran Petrosian',
    kind: 'leaf',
    icon: '♟️',
  },
]

describe('search', () => {
  it('ranks a title that starts with the query before one that contains it', () => {
    expect(search('key', items).map((r) => r.id)).toEqual([
      'identity/keycloak.md',
      'identity/oauth.md',
    ])
  })

  it('matches the start of any word, across Trees', () => {
    expect(search('petro', items).map((r) => r.id)).toEqual(['chess/petrosian.md'])
  })

  it('ignores case and accents', () => {
    expect(search('EJMIA', items).map((r) => r.id)).toEqual(['armenia/etchmiadzin.md'])
  })

  it('finds branches too, and needs every word', () => {
    expect(search('ident', items)[0]!.id).toBe('identity')
    expect(search('oauth tokens', items).map((r) => r.id)).toEqual(['identity/oauth.md'])
    expect(search('oauth cats', items)).toEqual([])
  })

  it('returns nothing for an empty query', () => {
    expect(search('  ', items)).toEqual([])
  })
})

describe('search in text', () => {
  const notes: Searchable[] = [
    {
      repo: 'you/eng',
      id: 'identity/keycloak.md',
      title: 'Keycloak',
      kind: 'leaf',
      icon: '🔐',
      text: '# 🔐 Keycloak\n<!-- yeraz {"cover":"https://example.com/realm.png"} -->\n\nRealms hold users and their tokens.\n',
    },
    {
      repo: 'you/eng',
      id: 'identity/realms.md',
      title: 'Realms',
      kind: 'leaf',
      icon: null,
      text: '# Realms\n\nSee [Keycloak](/identity/keycloak.md).\n',
    },
    {
      repo: 'you/art',
      id: 'armenia/etchmiadzin.md',
      title: 'Etchmiadzin',
      kind: 'leaf',
      icon: null,
      text: '# Etchmiadzin\n\nThe Mother Cathedral of Ējmiatsin, built in 301.\n',
    },
  ]

  it('finds leaves by their text, after every title match', () => {
    expect(search('realms', notes).map((r) => r.id)).toEqual([
      'identity/realms.md',
      'identity/keycloak.md',
    ])
    expect(search('realms', notes).map((r) => r.inText)).toEqual([false, true])
  })

  it('needs every word, in the title or the text, across Trees, ignoring accents', () => {
    expect(search('keycloak tokens', notes).map((r) => r.id)).toEqual(['identity/keycloak.md'])
    expect(search('cathedral EJMIA', notes).map((r) => r.id)).toEqual(['armenia/etchmiadzin.md'])
    expect(search('cathedral cats', notes)).toEqual([])
  })

  it('skips the title line and the metadata line', () => {
    expect(search('example', notes)).toEqual([])
    expect(bodyOf('﻿# Title\r\n<!-- yeraz {} -->\r\nText')).toBe('Text')
    expect(bodyOf('No heading\nText')).toBe('No heading\nText')
  })

  it('cuts a snippet around the first word found, in the original spelling', () => {
    expect(snippet(notes[2]!.text!, 'ejmiatsin')).toEqual({
      before: 'The Mother Cathedral of ',
      match: 'Ējmiatsin',
      after: ', built in 301.',
    })
    expect(snippet(notes[0]!.text!, 'nothing here')).toBeNull()
    const long = `# Long\n\n${'word '.repeat(30)}needle ${'more '.repeat(30)}`
    const cut = snippet(long, 'NEEDLE')!
    expect(cut.match).toBe('needle')
    expect(cut.before).toMatch(/^…word /)
    expect(cut.after).toMatch(/ more…$/)
  })

  it('keeps offsets right when folding changes the length', () => {
    // "ﬁ" folds to two letters, a decomposed "é" to one.
    expect(snippet('# T\n\nﬁne café au lait', 'au')).toEqual({
      before: 'ﬁne café ',
      match: 'au',
      after: ' lait',
    })
  })
})
