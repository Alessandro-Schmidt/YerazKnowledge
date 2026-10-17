import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createFakeGitHub, type FakeGitHub } from '../../test/fake-github/fakeGitHub'
import { makeFixture } from '../../test/fake-github/fixture'
import { fakeGitHubHandlers } from '../../test/fake-github/msw'
import { createGitHubClient, GitHubError } from '../github/client'
import { lookupTree, type TreeRef } from '../github/graphql'
import { memoryStore } from '../store/db'
import { planBatches, pullTree, type PullProgress } from './pull'

let fake: FakeGitHub
const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())

const fixture = makeFixture({ name: 'Engineering', leaves: 1000, threads: 1500, seed: 7 })
const client = createGitHubClient({ token: 'test' })
let ref: TreeRef

beforeEach(async () => {
  fake = createFakeGitHub({ login: 'you' })
  server.resetHandlers(...fakeGitHubHandlers(fake))
  await fake.addRepo('you/engineering', fixture.files)
  ref = (await lookupTree(client, 'you/engineering'))!
  fake.resetLog()
})

describe('pullTree', () => {
  it('first open: the head, one tree request, about ten blob requests, every leaf parsed', async () => {
    const store = memoryStore()
    const pulled = await pullTree(ref, { client, store })
    expect(pulled.offline).toBe(false)
    expect(pulled.model.leaves).toHaveLength(1000)
    expect(pulled.leaves.size).toBe(1000)
    expect(pulled.leaves.get(pulled.model.leaves[0]!)!.title).toBeTruthy()

    const trees = fake.log.filter((e) => e.kind === 'tree')
    const blobs = fake.log.filter((e) => e.kind === 'graphql')
    expect(fake.log[0]).toMatchObject({ kind: 'head', status: 200 })
    expect(trees).toHaveLength(1)
    expect(pulled.head).toBe(fake.repo('you/engineering').head!.oid)
    expect(blobs).toHaveLength(10)
    expect(blobs.reduce((n, e) => n + e.blobs, 0)).toBe(1000)
    const threads = [...pulled.leaves.values()].reduce((n, p) => n + p.links.length, 0)
    expect(threads).toBe(fixture.stats.threads)
  })

  it('second open: exactly one request (a 304) and no blobs', async () => {
    const store = memoryStore()
    await pullTree(ref, { client, store })
    fake.resetLog()
    const again = await pullTree(ref, { client, store })
    expect(fake.log).toEqual([expect.objectContaining({ kind: 'head', status: 304, blobs: 0 })])
    expect(again.leaves.size).toBe(1000)
  })

  it('after another device edits one leaf: fetches exactly that blob', async () => {
    const store = memoryStore()
    await pullTree(ref, { client, store })
    const path = Object.keys(fixture.files).find((p) => p.endsWith('.md'))!
    await fake.repo('you/engineering').commit({
      message: 'edit elsewhere',
      additions: [{ path, contents: '# Rewritten\n\nSee [Other](/elsewhere.md).\n' }],
    })
    fake.resetLog()
    const pulled = await pullTree(ref, { client, store })
    expect(fake.log.map((e) => [e.kind, e.status, e.blobs])).toEqual([
      ['head', 200, 0],
      ['tree', 200, 0],
      ['graphql', 200, 1],
    ])
    expect(pulled.leaves.get(path)).toMatchObject({
      title: 'Rewritten',
      links: [{ path: 'elsewhere.md', repo: null }],
    })
  })

  it('fetches a blob once when two leaves share the same content', async () => {
    await fake.addRepo('you/twins', {
      '.yeraz.json': '{}',
      'a.md': '# Same\n',
      'b/c.md': '# Same\n',
    })
    const twins = (await lookupTree(client, 'you/twins'))!
    fake.resetLog()
    const pulled = await pullTree(twins, { client, store: memoryStore() })
    expect(fake.log.find((e) => e.kind === 'graphql')!.blobs).toBe(1)
    expect([...pulled.leaves.keys()].sort()).toEqual(['a.md', 'b/c.md'])
  })

  it("fetches and parses a branch's text (its README.md) with the leaves, in the same request", async () => {
    await fake.addRepo('you/texts', {
      '.yeraz.json': '{}',
      'README.md': '# The repository\n',
      'AI Agents/README.md': '# AI Agents\n\nStart at [Prompting](</AI Agents/prompting.md>).\n',
      'AI Agents/prompting.md': '# Prompting\n',
    })
    const texts = (await lookupTree(client, 'you/texts'))!
    fake.resetLog()
    const pulled = await pullTree(texts, { client, store: memoryStore() })
    expect(pulled.model.leaves).toEqual(['AI Agents/prompting.md', 'README.md'])
    expect(pulled.leaves.get('AI Agents/README.md')!.links).toEqual([
      { path: 'AI Agents/prompting.md', repo: null },
    ])
    const blobs = fake.log.filter((e) => e.kind === 'graphql')
    expect(blobs).toHaveLength(1)
    expect(blobs[0]!.blobs).toBe(3)
  })

  it('reports structure first, then content as it arrives', async () => {
    const events: PullProgress[] = []
    await pullTree(ref, { client, store: memoryStore(), onProgress: (p) => events.push(p) })
    expect(events[0]).toMatchObject({ stage: 'structure', missing: 1000 })
    expect(events[0]!.stage === 'structure' && events[0]!.model.leaves.length).toBe(1000)
    const content = events.slice(1)
    expect(content).toHaveLength(10)
    expect(content.at(-1)).toEqual({ stage: 'content', fetched: 1000, total: 1000 })
  })

  it('lists subtrees one at a time when the listing is truncated', async () => {
    fake.faults.truncateTrees = true
    const pulled = await pullTree(ref, { client, store: memoryStore() })
    expect(pulled.model.leaves).toHaveLength(1000)
    expect(fake.log.filter((e) => e.kind === 'tree').length).toBeGreaterThan(2)
  })

  it('works offline from the cache, and fails offline without one', async () => {
    const store = memoryStore()
    await pullTree(ref, { client, store })
    fake.faults.offline = true
    const offline = await pullTree(ref, { client, store })
    expect(offline.offline).toBe(true)
    expect(offline.leaves.size).toBe(1000)
    await expect(pullTree(ref, { client, store: memoryStore() })).rejects.toMatchObject({
      kind: 'network',
    })
  })

  it('reports partial content offline when the cache lacks some leaves', async () => {
    const store = memoryStore()
    await pullTree(ref, { client, store })
    const evicted = [...store.data.keys()].filter((k) => k.startsWith('leaf:')).slice(0, 5)
    evicted.forEach((k) => store.data.delete(k))
    fake.faults.offline = true
    const pulled = await pullTree(ref, { client, store })
    expect(pulled.leaves.size).toBeLessThanOrEqual(995)
    expect(pulled.model.leaves).toHaveLength(1000)
  })

  it('surfaces GitHub errors with a kind', async () => {
    fake.faults.serverError = true
    const error = await pullTree(ref, { client, store: memoryStore() }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GitHubError)
    expect(error).toMatchObject({ kind: 'server', status: 500 })
  })
})

describe('planBatches', () => {
  it('splits by bytes and by count, keeping order', () => {
    const items = [400, 400, 400, 100, 2000, 10].map((size, i) => ({ i, size }))
    expect(planBatches(items, 1000, 3).map((b) => b.map((x) => x.i))).toEqual([
      [0, 1],
      [2, 3],
      [4],
      [5],
    ])
    expect(planBatches(items, 10_000, 2).map((b) => b.length)).toEqual([2, 2, 2])
    expect(planBatches([], 1000, 3)).toEqual([])
  })
})
