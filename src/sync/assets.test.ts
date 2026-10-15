import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createFakeGitHub, type FakeGitHub } from '../../test/fake-github/fakeGitHub'
import { fakeGitHubHandlers } from '../../test/fake-github/msw'
import { createGitHubClient } from '../github/client'
import { gitBlobSha } from '../model/sha'
import { memoryStore } from '../store/db'
import { assetBytes, assetPath, mimeOf } from './assets'

let fake: FakeGitHub
const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
const client = createGitHubClient({ token: 't' })
const png = Uint8Array.from({ length: 2000 }, (_, i) => (i * 7) % 256)

beforeEach(async () => {
  fake = createFakeGitHub({ login: 'you' })
  server.resetHandlers(...fakeGitHubHandlers(fake))
  await fake.addRepo('you/eng', { '.yeraz.json': '{"name":"Eng"}\n' })
  await fake.repo('you/eng').commit({
    message: 'image',
    additions: [{ path: 'assets/diagram.png', contents: png }],
  })
})

describe('assetBytes', () => {
  it('downloads an image once, by SHA, then serves it from this device', async () => {
    const store = memoryStore()
    const sha = await gitBlobSha(png)
    expect(await assetBytes('you/eng', sha, { client, store })).toEqual(png)
    expect(await assetBytes('you/eng', sha, { client, store })).toEqual(png)
    expect(fake.log.filter((e) => e.kind === 'blob')).toEqual([
      expect.objectContaining({ status: 200 }),
    ])
  })
})

describe('assetPath', () => {
  const date = new Date('2026-10-14T22:30:00Z')

  it('names a file assets/YYYY-MM-DD-slug.ext, from the local date', () => {
    expect(assetPath('Realm Diagram.PNG', 'png', date, () => false)).toMatch(
      /^assets\/2026-10-1[45]-realm-diagram\.png$/,
    )
  })

  it('takes the new extension when the image was converted', () => {
    expect(assetPath('photo.jpg', 'webp', date, () => false)).toMatch(/-photo\.webp$/)
  })

  it('never reuses a name', () => {
    const taken = new Set([assetPath('a.png', 'png', date, () => false)])
    const next = assetPath('a.png', 'png', date, (p) => taken.has(p))
    expect(next).toMatch(/-a-2\.png$/)
  })

  it('names a pasted image without a file name', () => {
    expect(assetPath('', 'png', date, () => false)).toMatch(/-image\.png$/)
  })
})

describe('mimeOf', () => {
  it('knows the media types the app shows', () => {
    expect(mimeOf('assets/a.png')).toBe('image/png')
    expect(mimeOf('assets/a.JPG')).toBe('image/jpeg')
    expect(mimeOf('assets/a.svg')).toBe('image/svg+xml')
    expect(mimeOf('assets/a.pdf')).toBe('application/pdf')
    expect(mimeOf('assets/a.mp4')).toBe('video/mp4')
    expect(mimeOf('assets/a.en.vtt')).toBe('text/vtt')
    expect(mimeOf('assets/a.bin')).toBe('application/octet-stream')
  })
})
