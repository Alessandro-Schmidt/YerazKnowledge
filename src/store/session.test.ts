import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createFakeGitHub, type FakeGitHub } from '../../test/fake-github/fakeGitHub'
import { makeFixture } from '../../test/fake-github/fixture'
import { fakeGitHubHandlers } from '../../test/fake-github/msw'
import { memoryStore } from './db'
import { createSession } from './session'

let fake: FakeGitHub
const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())

beforeEach(async () => {
  fake = createFakeGitHub({ login: 'you', tokens: ['good'] })
  server.resetHandlers(...fakeGitHubHandlers(fake))
  await fake.addRepo(
    'you/engineering',
    makeFixture({ name: 'Engineering', leaves: 60, threads: 80, seed: 3 }).files,
  )
  await fake.addRepo('you/dotfiles', { 'README.md': '# dotfiles\n' })
  await fake.addRepo(
    'friend/shared',
    { '.yeraz.json': '{"name":"Shared"}', 'a.md': '# A\n' },
    { private: false },
  )
})

describe('session', () => {
  it('starts signed out, signs in with a good token, and remembers it', async () => {
    const store = memoryStore()
    const s = createSession({ store })
    await s.getState().start()
    expect(s.getState().phase).toBe('signed-out')

    await expect(s.getState().signIn('bad')).rejects.toThrow("GitHub didn't accept this token")
    expect(s.getState().phase).toBe('signed-out')

    await s.getState().signIn(' good ')
    expect(s.getState()).toMatchObject({ phase: 'signed-in', token: 'good' })
    expect(s.getState().trees.map((t) => t.title)).toEqual(['Shared', 'Engineering'])

    const again = createSession({ store })
    await again.getState().start()
    expect(again.getState()).toMatchObject({ phase: 'signed-in', token: 'good' })
    expect(again.getState().trees).toHaveLength(2)
  })

  it('opens a Tree: structure first, then the full graph', async () => {
    const s = createSession({ store: memoryStore() })
    await s.getState().signIn('good')
    const states: string[] = []
    const unsubscribe = s.subscribe((st) => {
      const d = st.data['you/engineering']
      if (d && states.at(-1) !== d.status) states.push(d.status)
    })
    await Promise.all([s.getState().open('you/engineering'), s.getState().open('you/engineering')])
    unsubscribe()
    expect(states).toEqual(['loading', 'ready'])
    const data = s.getState().data['you/engineering']!
    expect(data.status).toBe('ready')
    expect(data.status === 'ready' && data.graph.stats.leaves).toBe(60)
    expect(fake.log.filter((e) => e.kind === 'tree')).toHaveLength(1)
  })

  it('opens a Tree it has never heard of by looking it up (a shared link)', async () => {
    const s = createSession({ store: memoryStore() })
    await s.getState().signIn('good')
    await s.getState().signOut()
    await s.getState().signIn('good')
    s.setState({ trees: [] })
    await s.getState().open('you/engineering')
    expect(s.getState().data['you/engineering']!.status).toBe('ready')
    expect(s.getState().trees.map((t) => t.repo)).toContain('you/engineering')
  })

  it('reports a missing Tree as an error', async () => {
    const s = createSession({ store: memoryStore() })
    await s.getState().signIn('good')
    await s.getState().open('you/dotfiles')
    expect(s.getState().data['you/dotfiles']).toMatchObject({ status: 'error', kind: 'not-found' })
  })

  it('connects a repository by name, and keeps it after rediscovery', async () => {
    const store = memoryStore()
    const s = createSession({ store })
    await s.getState().signIn('good')
    await expect(s.getState().connect('nonsense')).rejects.toThrow('owner/name')
    await expect(s.getState().connect('you/dotfiles')).rejects.toThrow("isn't a Tree yet")
    await expect(s.getState().connect('you/missing')).rejects.toThrow("doesn't exist")
    await fake.addRepo('friend/other', { '.yeraz.json': '{}', 'b.md': '# B\n' }, { private: false })
    // The fake's discovery lists every repository; real GitHub would not list a stranger's.
    await s.getState().connect('https://github.com/friend/other.git')
    expect(s.getState().trees.map((t) => t.repo)).toContain('friend/other')
    await s.getState().discover()
    expect(s.getState().trees.map((t) => t.repo)).toContain('friend/other')
  })

  it('signs out and forgets the token, Trees and graphs', async () => {
    const store = memoryStore()
    const s = createSession({ store })
    await s.getState().signIn('good')
    await s.getState().open('you/engineering')
    await s.getState().signOut()
    expect(s.getState()).toMatchObject({ phase: 'signed-out', token: null, trees: [], data: {} })
    const again = createSession({ store })
    await again.getState().start()
    expect(again.getState().phase).toBe('signed-out')
  })
})
