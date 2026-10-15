import { describe, expect, it } from 'vitest'
import { searchTitles, type Searchable } from './search'

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

describe('searchTitles', () => {
  it('ranks a title that starts with the query before one that contains it', () => {
    expect(searchTitles('key', items).map((r) => r.id)).toEqual([
      'identity/keycloak.md',
      'identity/oauth.md',
    ])
  })

  it('matches the start of any word, across Trees', () => {
    expect(searchTitles('petro', items).map((r) => r.id)).toEqual(['chess/petrosian.md'])
  })

  it('ignores case and accents', () => {
    expect(searchTitles('EJMIA', items).map((r) => r.id)).toEqual(['armenia/etchmiadzin.md'])
  })

  it('finds branches too, and needs every word', () => {
    expect(searchTitles('ident', items)[0]!.id).toBe('identity')
    expect(searchTitles('oauth tokens', items).map((r) => r.id)).toEqual(['identity/oauth.md'])
    expect(searchTitles('oauth cats', items)).toEqual([])
  })

  it('returns nothing for an empty query, and at most the limit', () => {
    expect(searchTitles('  ', items)).toEqual([])
    expect(searchTitles('a', items, 2)).toHaveLength(2)
  })
})
