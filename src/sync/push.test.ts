import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createFakeGitHub, type FakeGitHub } from '../../test/fake-github/fakeGitHub'
import { fakeGitHubHandlers } from '../../test/fake-github/msw'
import { createGitHubClient } from '../github/client'
import { createTreeRepository, lookupTree, type TreeRef } from '../github/graphql'
import { gitBlobSha } from '../model/sha'
import { memoryStore } from '../store/db'
import { pullTree } from './pull'
import { describe as describeCommit, pushTree } from './push'

let fake: FakeGitHub
const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
const client = createGitHubClient({ token: 't' })
let ref: TreeRef

const KEYCLOAK = '# Keycloak\n\nOne.\n\nTwo.\n\nThree.\n'

beforeEach(async () => {
  fake = createFakeGitHub({ login: 'you' })
  server.resetHandlers(...fakeGitHubHandlers(fake))
  await fake.addRepo('you/eng', {
    '.yeraz.json': '{"name":"Eng"}\n',
    'identity/keycloak.md': KEYCLOAK,
    'welcome.md': '# Welcome\n',
  })
  ref = (await lookupTree(client, 'you/eng'))!
})

async function setUp() {
  const store = memoryStore()
  await pullTree(ref, { client, store })
  fake.resetLog()
  return store
}

describe('pushTree', () => {
  it('commits only the changed files, in one request', async () => {
    const store = await setUp()
    const base = await gitBlobSha(KEYCLOAK)
    const text = KEYCLOAK.replace('One.', 'One, edited.')
    const pushed = await pushTree(
      ref,
      { 'identity/keycloak.md': { text, base } },
      { client, store },
    )
    expect(fake.log).toEqual([
      expect.objectContaining({ kind: 'graphql', operation: 'mutation', status: 200 }),
    ])
    const repo = fake.repo('you/eng')
    expect(pushed).toEqual({
      head: repo.head!.oid,
      committed: ['identity/keycloak.md'],
      conflicts: [],
    })
    expect(repo.read('identity/keycloak.md')).toBe(text)
    expect(repo.head!.message).toBe('Update Keycloak')
    expect([...repo.head!.files.keys()].sort()).toEqual([
      '.yeraz.json',
      'identity/keycloak.md',
      'welcome.md',
    ])
  })

  it('leaves the cache at the new head: the next open makes one request and downloads nothing', async () => {
    const store = await setUp()
    const text = KEYCLOAK.replace('Two.', 'Two!')
    await pushTree(
      ref,
      { 'identity/keycloak.md': { text, base: await gitBlobSha(KEYCLOAK) } },
      { client, store },
    )
    fake.resetLog()
    const pulled = await pullTree(ref, { client, store })
    expect(fake.log).toEqual([expect.objectContaining({ kind: 'head', status: 200, blobs: 0 })])
    expect(pulled.head).toBe(fake.repo('you/eng').head!.oid)
    expect(pulled.leaves.get('identity/keycloak.md')!.words).toBeGreaterThan(0)
  })

  it('adds and deletes files, and skips deleting a file that never reached GitHub', async () => {
    const store = await setUp()
    await pushTree(
      ref,
      {
        'new.md': { text: '# New leaf\n\n', base: null },
        'welcome.md': { text: null, base: await gitBlobSha('# Welcome\n') },
        'scratch.md': { text: null, base: null },
      },
      { client, store },
    )
    const repo = fake.repo('you/eng')
    expect(repo.read('new.md')).toBe('# New leaf\n\n')
    expect(repo.read('welcome.md')).toBeUndefined()
    expect(repo.head!.message).toBe('Update 2 files\n\nAdd new.md\nDelete welcome.md')
  })

  it('merges with another device’s commit when they changed different lines', async () => {
    const store = await setUp()
    fake.faults.pushBeforeNextCommit = {
      message: 'phone',
      additions: [
        {
          path: 'identity/keycloak.md',
          contents: KEYCLOAK.replace('Three.', 'Three, from the phone.'),
        },
      ],
    }
    const ours = KEYCLOAK.replace('One.', 'One, from the laptop.')
    const pushed = await pushTree(
      ref,
      { 'identity/keycloak.md': { text: ours, base: await gitBlobSha(KEYCLOAK) } },
      { client, store },
    )
    expect(pushed.conflicts).toEqual([])
    expect(fake.repo('you/eng').read('identity/keycloak.md')).toBe(
      '# Keycloak\n\nOne, from the laptop.\n\nTwo.\n\nThree, from the phone.\n',
    )
    const mutations = fake.log.filter((e) => e.operation === 'mutation')
    expect(mutations).toHaveLength(2)
  })

  it('merges an edit made before a pull brought another device’s commit, without a refusal', async () => {
    const store = await setUp()
    const base = await gitBlobSha(KEYCLOAK)
    await fake.repo('you/eng').commit({
      message: 'phone',
      additions: [
        {
          path: 'identity/keycloak.md',
          contents: KEYCLOAK.replace('Three.', 'Three, from the phone.'),
        },
      ],
    })
    await pullTree(ref, { client, store })
    fake.resetLog()
    const ours = KEYCLOAK.replace('One.', 'One, from the laptop.')
    const pushed = await pushTree(
      ref,
      { 'identity/keycloak.md': { text: ours, base } },
      { client, store },
    )
    expect(pushed.conflicts).toEqual([])
    expect(fake.repo('you/eng').read('identity/keycloak.md')).toBe(
      '# Keycloak\n\nOne, from the laptop.\n\nTwo.\n\nThree, from the phone.\n',
    )
    expect(fake.log.filter((e) => e.operation === 'mutation')).toHaveLength(1)
  })

  it('keeps both versions when both devices changed the same lines', async () => {
    const store = await setUp()
    const theirs = KEYCLOAK.replace('Two.', 'Two, from the phone.')
    fake.faults.pushBeforeNextCommit = {
      message: 'phone',
      additions: [{ path: 'identity/keycloak.md', contents: theirs }],
    }
    const ours = KEYCLOAK.replace('Two.', 'Two, from the laptop.')
    const pushed = await pushTree(
      ref,
      { 'identity/keycloak.md': { text: ours, base: await gitBlobSha(KEYCLOAK) } },
      {
        client,
        store,
        now: () => new Date('2026-10-15T09:00:00Z'),
      },
    )
    const repo = fake.repo('you/eng')
    expect(pushed.conflicts).toEqual(['identity/keycloak.conflict-2026-10-15.md'])
    expect(repo.read('identity/keycloak.md')).toBe(theirs)
    expect(repo.read('identity/keycloak.conflict-2026-10-15.md')).toBe(ours)
  })

  it('commits an image byte for byte with the leaf that shows it, in one request', async () => {
    const store = await setUp()
    const png = Uint8Array.from({ length: 300 }, (_, i) => (i * 37) % 256)
    const text = `${KEYCLOAK}\n![Realm diagram](/assets/2026-10-15-realm-diagram.png)\n`
    await pushTree(
      ref,
      {
        'assets/2026-10-15-realm-diagram.png': { text: png, base: null },
        'identity/keycloak.md': { text, base: await gitBlobSha(KEYCLOAK) },
      },
      { client, store },
    )
    expect(fake.log.filter((e) => e.operation === 'mutation')).toHaveLength(1)
    const repo = fake.repo('you/eng')
    const sha = repo.head!.files.get('assets/2026-10-15-realm-diagram.png')!
    expect(sha).toBe(await gitBlobSha(png))
    expect(repo.blobs.get(sha)).toEqual(png)
    expect(repo.head!.message).toBe(
      'Update 2 files\n\nAdd assets/2026-10-15-realm-diagram.png\nUpdate identity/keycloak.md',
    )
    // Cached by SHA, so showing it never downloads it.
    expect(await store.get(`asset:${sha}`)).toEqual(png)
  })

  it('keeps an image as it is when another device committed first', async () => {
    const store = await setUp()
    fake.faults.pushBeforeNextCommit = {
      message: 'phone',
      additions: [{ path: 'welcome.md', contents: '# Welcome, phone\n' }],
    }
    const png = new Uint8Array([137, 80, 78, 71, 0, 1, 2])
    const pushed = await pushTree(
      ref,
      { 'assets/dot.png': { text: png, base: null } },
      { client, store },
    )
    expect(pushed.conflicts).toEqual([])
    const repo = fake.repo('you/eng')
    expect(repo.blobs.get(repo.head!.files.get('assets/dot.png')!)).toEqual(png)
  })

  it('throws a network error offline, keeping nothing half-done', async () => {
    const store = await setUp()
    fake.faults.offline = true
    await expect(
      pushTree(ref, { 'welcome.md': { text: '# Hi\n', base: null } }, { client, store }),
    ).rejects.toMatchObject({ kind: 'network' })
    fake.faults.offline = false
    expect(fake.repo('you/eng').read('welcome.md')).toBe('# Welcome\n')
  })
})

describe('createTreeRepository', () => {
  it('creates a private repository holding .yeraz.json and a welcome leaf, and no README', async () => {
    const tree = await createTreeRepository(client, { name: 'notes', title: 'My Notes' })
    expect(tree).toMatchObject({
      repo: 'you/notes',
      branch: 'main',
      isPrivate: true,
      title: 'My Notes',
    })
    const repo = fake.repo('you/notes')
    expect(repo.isPrivate).toBe(true)
    expect(JSON.parse(repo.read('.yeraz.json')!)).toEqual({ name: 'My Notes' })
    expect(repo.read('welcome.md')).toMatch(/^# 🌱 Welcome\n/)
    expect(repo.read('README.md')).toBeUndefined()
    expect(await lookupTree(client, 'you/notes')).toMatchObject({ title: 'My Notes' })
  })
})

describe('describe', () => {
  it('writes the message a person would', () => {
    const existing = new Set(['a.md'])
    expect(describeCommit([{ path: 'a.md', text: '# Alpha\n' }], existing).headline).toBe(
      'Update Alpha',
    )
    expect(describeCommit([{ path: 'b.md', text: '# Beta\n' }], existing).headline).toBe('Add Beta')
    expect(describeCommit([{ path: 'a.md', text: null }], existing).headline).toBe('Delete a')
    expect(
      describeCommit(
        [
          { path: 'a.md', text: null },
          { path: 'x/a.md', text: '# A\n' },
        ],
        existing,
      ),
    ).toEqual({
      headline: 'Update 2 files',
      body: 'Add x/a.md\nDelete a.md',
    })
  })
})
