import { resolveObjectURL } from 'node:buffer'
import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createFakeGitHub, type FakeGitHub } from '../../test/fake-github/fakeGitHub'
import { fakeGitHubHandlers } from '../../test/fake-github/msw'
import { createGitHubClient } from '../github/client'
import { gitBlobSha } from '../model/sha'
import { memoryStore } from '../store/db'
import { assetBytes, assetPath, mimeOf, objectUrl } from './assets'

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

  it('adds no extension to a file that has none', () => {
    expect(assetPath('Makefile', '', date, () => false)).toMatch(/-makefile$/)
    const taken = new Set([assetPath('Makefile', '', date, () => false)])
    expect(assetPath('Makefile', '', date, (p) => taken.has(p))).toMatch(/-makefile-2$/)
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

describe('objectUrl', () => {
  it('gives an SVG a data: address, never a blob: one in the app’s origin', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    const url = objectUrl(new TextEncoder().encode(svg), 'assets/Logo.SVG')
    expect(url).toBe(`data:image/svg+xml;base64,${btoa(svg)}`)
  })

  it('keeps a large SVG whole', () => {
    const bytes = new Uint8Array(200_000).map((_, i) => 32 + (i % 90))
    const url = objectUrl(bytes, 'assets/big.svg')
    const back = Uint8Array.from(atob(url.split(',')[1]!), (c) => c.charCodeAt(0))
    expect(back).toEqual(bytes)
  })

  it('gives other files a blob: address of their type', () => {
    const url = objectUrl(new Uint8Array([1, 2, 3]), 'assets/a.png')
    expect(url).toMatch(/^blob:/)
    expect(resolveObjectURL(url)?.type).toBe('image/png')
  })
})
