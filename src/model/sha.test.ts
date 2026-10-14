import { describe, expect, it } from 'vitest'
import { gitBlobSha } from './sha'

// Expected values come from `git hash-object --no-filters` on the same bytes.
describe('gitBlobSha', () => {
  it('matches git for ASCII', async () => {
    expect(await gitBlobSha('plain ascii\n')).toBe('e4eb4865aa462fdf316a0086f17b0109a1c2d645')
  })

  it('matches git for UTF-8, including emoji ZWJ sequences', async () => {
    expect(await gitBlobSha('Ação · 🔐 Keycloak — naïve 👩‍💻\n')).toBe(
      '2e9ad983dbc7864f18d15798d872c1a5805f9d26',
    )
  })

  it('matches git for CRLF line endings, byte for byte', async () => {
    expect(await gitBlobSha('# Title\r\n\r\nLine two\r\n')).toBe(
      '5257d1c3646f971cf46d4c2e5df183a995b95464',
    )
  })

  it('matches git for an empty file', async () => {
    expect(await gitBlobSha('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
  })

  it('hashes bytes and the equivalent string the same way', async () => {
    const text = 'Ação\n'
    expect(await gitBlobSha(new TextEncoder().encode(text))).toBe(await gitBlobSha(text))
  })
})
