import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createFakeGitHub, type FakeGitHub } from '../../test/fake-github/fakeGitHub'
import { fakeGitHubHandlers } from '../../test/fake-github/msw'
import { gitBlobSha } from '../model/sha'
import { createGitHubClient, GitHubError } from './client'
import { discoverTrees, fetchBlobs, lookupTree } from './graphql'

let fake: FakeGitHub
const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())

const client = createGitHubClient({ token: 'test' })

beforeEach(async () => {
  fake = createFakeGitHub({ login: 'you', tokens: ['test'] })
  server.resetHandlers(...fakeGitHubHandlers(fake))
  await fake.addRepo('you/engineering', {
    '.yeraz.json': '{"name":"Engineering","color":"green"}\n',
    'a.md': '# A\n',
  })
  await fake.addRepo('you/dotfiles', { 'README.md': '# dotfiles\n' }, { private: false })
  await fake.addRepo('you/broken', { '.yeraz.json': 'not json', 'b.md': '# B\n' })
  await fake.addRepo('you/empty')
})

describe('discoverTrees', () => {
  it('returns only repositories with .yeraz.json, with name, colour and branch', async () => {
    expect(await discoverTrees(client)).toEqual([
      {
        owner: 'you',
        name: 'broken',
        repo: 'you/broken',
        branch: 'main',
        isPrivate: true,
        title: 'broken',
        color: null,
      },
      {
        owner: 'you',
        name: 'engineering',
        repo: 'you/engineering',
        branch: 'main',
        isPrivate: true,
        title: 'Engineering',
        color: 'green',
      },
    ])
  })

  it('pages through more than 100 repositories', async () => {
    for (let i = 0; i < 120; i++)
      await fake.addRepo(`you/r${i}`, { '.yeraz.json': '{}', 'x.md': '# X\n' })
    fake.resetLog()
    expect(await discoverTrees(client)).toHaveLength(122)
    expect(fake.log).toHaveLength(2)
  })
})

describe('lookupTree', () => {
  it('finds a Tree by owner/name, returns null for a plain repository, throws when missing', async () => {
    expect(await lookupTree(client, 'you/engineering')).toMatchObject({
      title: 'Engineering',
      branch: 'main',
    })
    expect(await lookupTree(client, 'you/dotfiles')).toBeNull()
    await expect(lookupTree(client, 'you/nope')).rejects.toMatchObject({ kind: 'not-found' })
  })
})

describe('fetchBlobs', () => {
  it('returns texts by SHA and null for unknown ones', async () => {
    const sha = await gitBlobSha('# A\n')
    const blobs = await fetchBlobs(client, 'you/engineering', [sha, '0'.repeat(40)])
    expect([...blobs]).toEqual([
      [sha, '# A\n'],
      ['0'.repeat(40), null],
    ])
  })

  it('refuses anything that is not a SHA, so nothing can be injected into the query', async () => {
    await expect(fetchBlobs(client, 'you/engineering', ['") { x } #'])).rejects.toThrow(
      'Not a blob SHA',
    )
  })
})

describe('client errors', () => {
  it('maps HTTP failures to kinds', async () => {
    const bad = createGitHubClient({ token: 'wrong' })
    await expect(bad.getTree('you/engineering', 'main')).rejects.toMatchObject({
      kind: 'auth',
      status: 401,
    })
    await expect(client.getTree('you/nope', 'main')).rejects.toMatchObject({
      kind: 'not-found',
      status: 404,
    })
    await expect(client.getTree('you/empty', 'main')).rejects.toMatchObject({
      kind: 'empty',
      status: 409,
    })
    fake.faults.offline = true
    const offline = await client.getTree('you/engineering', 'main').catch((e: unknown) => e)
    expect(offline).toBeInstanceOf(GitHubError)
    expect(offline).toMatchObject({ kind: 'network' })
  })

  it('recognises rate limiting', async () => {
    const limited = createGitHubClient({
      token: 't',
      fetch: async () =>
        new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0' },
        }),
    })
    await expect(limited.getTree('you/engineering', 'main')).rejects.toMatchObject({
      kind: 'rate-limit',
    })
  })
})
