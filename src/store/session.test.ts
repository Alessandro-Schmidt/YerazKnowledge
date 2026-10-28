import { resolveObjectURL } from 'node:buffer'
import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeGitHub, type FakeGitHub } from '../../test/fake-github/fakeGitHub'
import { makeFixture } from '../../test/fake-github/fixture'
import { fakeGitHubHandlers } from '../../test/fake-github/msw'
import { memoryFolder, memoryFolders } from '../../test/memoryFolder'
import { memoryStore } from './db'
import { planBranchText, planNewLeaves } from '../sync/structure'
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
    expect(fake.log.filter((e) => e.kind === 'head')).toHaveLength(1)
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

  it('turns a repository without .yeraz.json into a Family when asked', async () => {
    const s = createSession({ store: memoryStore() })
    await s.getState().signIn('good')
    const tree = await s.getState().connect('you/dotfiles', true)
    expect(tree).toMatchObject({ repo: 'you/dotfiles', title: 'dotfiles' })
    expect(s.getState().trees.map((t) => t.repo)).toContain('you/dotfiles')
    await s.getState().open('you/dotfiles')
    expect(s.getState().data['you/dotfiles']).toMatchObject({ status: 'ready' })
  })

  it('gives an empty repository its first commit when turning it into a Family', async () => {
    await fake.addRepo('you/empty', null)
    const s = createSession({ store: memoryStore() })
    await s.getState().signIn('good')
    await s.getState().connect('you/empty', true)
    expect(fake.repo('you/empty').read('.yeraz.json')).toBe('{"name":"empty"}\n')
    expect(fake.repo('you/empty').read('empty/welcome.md')).toContain('# 🌱 Welcome')
  })

  it('connects a repository by name, and keeps it after rediscovery', async () => {
    const store = memoryStore()
    const s = createSession({ store })
    await s.getState().signIn('good')
    await expect(s.getState().connect('nonsense')).rejects.toThrow('owner/name')
    await expect(s.getState().connect('you/dotfiles')).rejects.toThrow('into a notebook?')
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

  it('signing in keeps the folders', async () => {
    const store = memoryStore()
    const folders = memoryFolders({ Notes: memoryFolder() })
    const s = createSession({ store, folders })
    folders.choose('Notes')
    await s.getState().addFolder()
    await s.getState().signIn('good')
    expect(s.getState().trees.map((t) => t.repo)).toEqual([
      'friend/shared',
      'you/engineering',
      '~/notes',
    ])
  })

  it('applies edits at once and commits them when the autosave fires', async () => {
    const store = memoryStore()
    const s = createSession({ store, autosaveDelay: 50 })
    await s.getState().signIn('good')
    await s.getState().open('you/engineering')
    const leaf = s.getState().data['you/engineering']!.graph!.nodes.get('')!.children[0]!
    await s.getState().apply('you/engineering', [{ path: 'brand-new.md', text: '# Brand new\n\n' }])
    expect(s.getState().data['you/engineering']!.graph!.nodes.get('brand-new.md')!.title).toBe(
      'Brand new',
    )
    expect(s.getState().sync['you/engineering']).toMatchObject({ status: 'pending', files: 1 })
    expect(fake.repo('you/engineering').read('brand-new.md')).toBeUndefined()
    await vi.waitFor(() =>
      expect(fake.repo('you/engineering').read('brand-new.md')).toBe('# Brand new\n\n'),
    )
    await vi.waitFor(() =>
      expect(s.getState().sync['you/engineering']).toEqual({ status: 'synced' }),
    )
    expect(s.getState().data['you/engineering']!.graph!.nodes.get(leaf)).toBeDefined()
  })

  it('gives every leaf text from the cache, pending edits included, without a request', async () => {
    const s = createSession({ store: memoryStore() })
    await s.getState().signIn('good')
    await s.getState().open('you/engineering')
    const graph = s.getState().data['you/engineering']!.graph!
    const leaves = [...graph.nodes.values()].filter((n) => n.kind === 'leaf')
    const edited = leaves[0]!.id
    await s.getState().apply('you/engineering', [
      { path: edited, text: '# Edited\n\nA needle.\n' },
      { path: 'fresh.md', text: '# Fresh\n' },
    ])
    fake.resetLog()
    const texts = await s.getState().texts('you/engineering')
    expect(fake.log).toHaveLength(0)
    for (const leaf of leaves) expect(texts.has(leaf.id)).toBe(true)
    expect(texts.get(edited)).toBe('# Edited\n\nA needle.\n')
    expect(texts.get('fresh.md')).toBe('# Fresh\n')
    expect(texts.get(leaves[1]!.id)).toBe(
      await s.getState().textOf('you/engineering', leaves[1]!.id),
    )
  })

  it('creates many sub-leaves of a leaf in one commit', async () => {
    const s = createSession({ store: memoryStore() })
    await s.getState().signIn('good')
    await s.getState().open('you/engineering')
    const graph = () => s.getState().data['you/engineering']!.graph!
    const leaf = [...graph().nodes.values()].find((n) => n.kind === 'leaf' && !n.children.length)!
    const changes = planNewLeaves(graph(), leaf.id, ['🧪 Tests', 'Tests', 'Notes'])
    fake.resetLog()
    await s.getState().apply('you/engineering', changes)
    expect(
      graph()
        .nodes.get(leaf.id)!
        .children.map((id) => graph().nodes.get(id)!.title),
    ).toEqual(expect.arrayContaining(['Tests', 'Tests', 'Notes']))
    expect(graph().nodes.get(changes[0]!.path)!.icon).toBe('🧪')
    await s.getState().flush('you/engineering')
    expect(fake.log.filter((e) => e.operation === 'mutation')).toHaveLength(1)
    for (const { path, text } of changes) expect(fake.repo('you/engineering').read(path)).toBe(text)
  })

  it('keeps edits on the device while offline, and commits them when the Tree opens again', async () => {
    const store = memoryStore()
    const first = createSession({ store })
    await first.getState().signIn('good')
    await first.getState().open('you/engineering')
    fake.faults.offline = true
    await first
      .getState()
      .apply('you/engineering', [{ path: 'offline.md', text: '# Written offline\n' }])
    await first.getState().flush('you/engineering')
    expect(first.getState().sync['you/engineering']).toMatchObject({ status: 'offline', files: 1 })
    expect(await first.getState().textOf('you/engineering', 'offline.md')).toBe(
      '# Written offline\n',
    )

    // A reload: a new session over the same storage, back online.
    fake.faults.offline = false
    const second = createSession({ store })
    await second.getState().start()
    await second.getState().open('you/engineering')
    await vi.waitFor(() =>
      expect(fake.repo('you/engineering').read('offline.md')).toBe('# Written offline\n'),
    )
    await vi.waitFor(() =>
      expect(second.getState().sync['you/engineering']).toEqual({ status: 'synced' }),
    )
  })

  it('merges an offline edit with a commit made elsewhere that the reopening pull brought in', async () => {
    const PATH = 'notes.md'
    const v1 = '# Notes\n\nOne.\n\nTwo.\n\nThree.\n'
    await fake.repo('you/engineering').commit({
      message: 'Add Notes',
      additions: [{ path: PATH, contents: v1 }],
    })
    const store = memoryStore()
    const phone = createSession({ store })
    await phone.getState().signIn('good')
    await phone.getState().open('you/engineering')
    fake.faults.offline = true
    await phone
      .getState()
      .apply('you/engineering', [{ path: PATH, text: v1.replace('One.', 'One, from the phone.') }])
    await phone.getState().flush('you/engineering')
    expect(phone.getState().sync['you/engineering']).toMatchObject({ status: 'offline' })

    await fake.repo('you/engineering').commit({
      message: 'laptop',
      additions: [{ path: PATH, contents: v1.replace('Three.', 'Three, from the laptop.') }],
    })
    fake.faults.offline = false
    const again = createSession({ store })
    await again.getState().start()
    await again.getState().open('you/engineering')
    await vi.waitFor(() =>
      expect(again.getState().sync['you/engineering']).toEqual({ status: 'synced' }),
    )
    expect(fake.repo('you/engineering').read(PATH)).toBe(
      '# Notes\n\nOne, from the phone.\n\nTwo.\n\nThree, from the laptop.\n',
    )
  })

  it('opens a Tree whose branch has text, and adds text to another branch in one commit', async () => {
    await fake.addRepo('you/notes', {
      '.yeraz.json': '{"name":"Notes"}',
      'AI Agents/README.md': '# AI Agents\n\nWhat this branch is for.\n',
      'AI Agents/prompting.md': '# Prompting\n',
      'Cloud/docker.md': '# Docker\n',
    })
    const s = createSession({ store: memoryStore() })
    await s.getState().signIn('good')
    await s.getState().open('you/notes')
    const graph = () => s.getState().data['you/notes']!.graph!
    expect(graph().nodes.get('AI Agents')).toMatchObject({ kind: 'branch', title: 'AI Agents' })
    expect(graph().nodes.get('AI Agents')!.sha).not.toBeNull()
    expect(graph().nodes.has('AI Agents/README.md')).toBe(false)
    expect(graph().stats.leaves).toBe(2)
    expect(await s.getState().textOf('you/notes', 'AI Agents/README.md')).toContain(
      'What this branch is for.',
    )

    expect(graph().nodes.get('Cloud')!.sha).toBeNull()
    const text = planBranchText(graph(), 'Cloud')
    expect(text).toEqual({ path: 'Cloud/README.md', text: '# Cloud\n\n' })
    fake.resetLog()
    await s.getState().apply('you/notes', [{ path: text.path, text: `${text.text}Containers.\n` }])
    expect(graph().nodes.get('Cloud')!.sha).not.toBeNull()
    expect(graph().stats.leaves).toBe(2)
    await s.getState().flush('you/notes')
    expect(fake.log.filter((e) => e.operation === 'mutation')).toHaveLength(1)
    expect(fake.repo('you/notes').read('Cloud/README.md')).toBe('# Cloud\n\nContainers.\n')
    expect(s.getState().sync['you/notes']).toEqual({ status: 'synced' })
    expect(graph().nodes.has('Cloud/README.md')).toBe(false)
    expect(await s.getState().textOf('you/notes', 'Cloud/README.md')).toContain('Containers.')
  })

  it('reports conflict copies, and forgets a file made and deleted before it was committed', async () => {
    const s = createSession({ store: memoryStore() })
    await s.getState().signIn('good')
    await s.getState().open('you/engineering')
    await s.getState().apply('you/engineering', [{ path: 'temp.md', text: '# Temp\n' }])
    await s.getState().apply('you/engineering', [{ path: 'temp.md', text: null }])
    expect(s.getState().sync['you/engineering']).toEqual({ status: 'synced' })

    const path =
      s
        .getState()
        .data['you/engineering']!.graph!.nodes.get('')!
        .children.find((id) => id.endsWith('.md')) ??
      [...s.getState().data['you/engineering']!.graph!.nodes.keys()].find((id) =>
        id.endsWith('.md'),
      )!
    const original = await s.getState().textOf('you/engineering', path)
    fake.faults.pushBeforeNextCommit = {
      message: 'phone',
      additions: [{ path, contents: original + 'Phone line.\n' }],
    }
    await s.getState().apply('you/engineering', [{ path, text: original + 'Laptop line.\n' }])
    await s.getState().flush('you/engineering')
    const state = s.getState().sync['you/engineering']!
    expect(state.status).toBe('conflict')
    expect(state.status === 'conflict' && state.copies[0]).toMatch(
      /\.conflict-\d{4}-\d{2}-\d{2}\.md$/,
    )
  })

  it('shows images: pending bytes at once, committed ones without downloading them again', async () => {
    const s = createSession({ store: memoryStore() })
    await s.getState().signIn('good')
    await s.getState().open('you/engineering')
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
    await s.getState().apply('you/engineering', [{ path: 'assets/a.png', text: png }])
    const pending = await s.getState().assetUrl('you/engineering', 'assets/a.png')
    expect(pending).toMatch(/^blob:/)
    const blob = await resolveObjectURL(pending!)!.arrayBuffer()
    expect(new Uint8Array(blob)).toEqual(png)

    await s.getState().flush('you/engineering')
    expect(s.getState().sync['you/engineering']).toEqual({ status: 'synced' })
    fake.resetLog()
    expect(await s.getState().assetUrl('you/engineering', 'assets/a.png')).toMatch(/^blob:/)
    expect(fake.log).toEqual([])
    expect(await s.getState().assetUrl('you/engineering', 'assets/none.png')).toBeNull()
  })

  it('commits an attached file with the leaf that links to it, in one commit, and knows its size', async () => {
    const s = createSession({ store: memoryStore() })
    await s.getState().signIn('good')
    await s.getState().open('you/engineering')
    const leaf = s
      .getState()
      .files('you/engineering')
      .find((p) => p.endsWith('.md'))!
    const text = await s.getState().textOf('you/engineering', leaf)
    const zip = Uint8Array.from({ length: 5000 }, (_, i) => (i * 13) % 256)
    const path = 'assets/2026-10-17-backup.zip'
    await s.getState().apply('you/engineering', [{ path, text: zip }])
    await s
      .getState()
      .apply('you/engineering', [{ path: leaf, text: `${text}\n[backup.zip](/${path})\n` }])
    expect(s.getState().fileSize('you/engineering', path)).toBe(5000)

    fake.resetLog()
    await s.getState().flush('you/engineering')
    expect(fake.log.filter((e) => e.operation === 'mutation')).toHaveLength(1)
    const repo = fake.repo('you/engineering')
    expect(repo.blobs.get(repo.head!.files.get(path)!)).toEqual(zip)
    expect(repo.read(leaf)).toContain(`[backup.zip](/${path})`)
    expect(s.getState().fileSize('you/engineering', path)).toBe(5000)

    // Another device knows the size from the tree listing, without downloading the file.
    const other = createSession({ store: memoryStore() })
    await other.getState().signIn('good')
    await other.getState().open('you/engineering')
    fake.resetLog()
    expect(other.getState().fileSize('you/engineering', path)).toBe(5000)
    expect(other.getState().fileSize('you/engineering', 'assets/none.zip')).toBeNull()
    expect(fake.log).toEqual([])
  })

  it('keeps showing an image while its commit completes', async () => {
    // Asks for the image each time pending edits are saved, as the Peek might mid-commit.
    const base = memoryStore()
    const seen: Promise<string | null>[] = []
    const s = createSession({
      store: {
        ...base,
        async set(key, value) {
          await base.set(key, value)
          if (key.startsWith('dirty:'))
            seen.push(s.getState().assetUrl('you/engineering', 'assets/c.png'))
        },
      },
    })
    await s.getState().signIn('good')
    await s.getState().open('you/engineering')
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 4, 5, 6])
    await s.getState().apply('you/engineering', [{ path: 'assets/c.png', text: png }])
    await s.getState().flush('you/engineering')
    const urls = await Promise.all(seen)
    expect(urls.length).toBeGreaterThan(1)
    expect(urls.filter((url) => url === null)).toEqual([])
  })

  it('downloads an image committed elsewhere, once', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 9, 9, 9])
    await fake.repo('you/engineering').commit({
      message: 'from the phone',
      additions: [{ path: 'assets/b.png', contents: png }],
    })
    const s = createSession({ store: memoryStore() })
    await s.getState().signIn('good')
    await s.getState().open('you/engineering')
    fake.resetLog()
    const url = await s.getState().assetUrl('you/engineering', 'assets/b.png')
    await s.getState().assetUrl('you/engineering', 'assets/b.png')
    expect(new Uint8Array(await resolveObjectURL(url!)!.arrayBuffer())).toEqual(png)
    expect(fake.log.map((e) => e.kind)).toEqual(['blob'])
  })
})

describe('leaf history', () => {
  const REPO = 'you/engineering'
  const PATH = 'notes.md'

  beforeEach(async () => {
    const repo = fake.repo(REPO)
    await repo.commit({
      message: 'Add Notes',
      additions: [{ path: PATH, contents: '# Notes\n\nv1\n' }],
    })
    await repo.commit({
      message: 'Update Notes',
      additions: [{ path: PATH, contents: '# Notes\n\nv2\n' }],
    })
  })

  async function opened() {
    const s = createSession({ store: memoryStore() })
    await s.getState().signIn('good')
    await s.getState().open(REPO)
    fake.resetLog()
    return s
  }

  it('lists versions newest first in one request, and asks again only after a commit', async () => {
    const s = await opened()
    const { versions, next } = await s.getState().history(REPO, PATH)
    expect(versions.map((v) => v.message)).toEqual(['Update Notes', 'Add Notes'])
    expect(next).toBeNull()
    await s.getState().history(REPO, PATH)
    expect(fake.log).toHaveLength(1)

    // An old version's text: one request, then the blob cache.
    expect(await s.getState().versionText(REPO, versions[1]!.blob!)).toBe('# Notes\n\nv1\n')
    expect(await s.getState().versionText(REPO, versions[1]!.blob!)).toBe('# Notes\n\nv1\n')
    expect(fake.log).toHaveLength(2)
  })

  it('restores a version as a new commit, keeping every earlier one', async () => {
    const s = await opened()
    const commits = fake.repo(REPO).commits.length
    const [, first] = (await s.getState().history(REPO, PATH)).versions
    fake.resetLog()
    await s.getState().restore(REPO, PATH, first!.blob!)
    expect(fake.repo(REPO).read(PATH)).toBe('# Notes\n\nv1\n')
    expect(fake.repo(REPO).commits).toHaveLength(commits + 1)
    expect(fake.log.filter((e) => e.operation === 'mutation')).toHaveLength(1)
    expect(s.getState().sync[REPO]).toEqual({ status: 'synced' })
    expect(s.getState().data[REPO]!.graph!.nodes.get(PATH)!.words).toBeGreaterThan(0)
    const after = await s.getState().history(REPO, PATH)
    expect(after.versions.map((v) => v.message)).toEqual([
      'Update Notes',
      'Update Notes',
      'Add Notes',
    ])
    expect(after.versions[0]!.blob).toBe(first!.blob)
  })

  it('keeps a restore on the device while offline, and merges it with a commit made elsewhere', async () => {
    const s = await opened()
    const [, first] = (await s.getState().history(REPO, PATH)).versions
    await s.getState().versionText(REPO, first!.blob!)
    fake.faults.offline = true
    await s.getState().restore(REPO, PATH, first!.blob!)
    expect(s.getState().sync[REPO]).toMatchObject({ status: 'offline', files: 1 })
    expect(await s.getState().textOf(REPO, PATH)).toBe('# Notes\n\nv1\n')

    fake.faults.offline = false
    fake.faults.pushBeforeNextCommit = {
      message: 'Elsewhere',
      additions: [{ path: 'other.md', contents: '# Other\n' }],
    }
    await s.getState().flush(REPO)
    expect(fake.repo(REPO).read(PATH)).toBe('# Notes\n\nv1\n')
    expect(fake.repo(REPO).read('other.md')).toBe('# Other\n')
  })
})

describe('renaming a Tree', () => {
  const NOTES = '{\n  "name": "Notes",\n  "color": "amber"\n}\n'

  async function openNotes(autosaveDelay = 50) {
    await fake.addRepo('you/notes', { '.yeraz.json': NOTES, 'a.md': '# A\n' })
    const s = createSession({ store: memoryStore(), autosaveDelay })
    await s.getState().signIn('good')
    await s.getState().open('you/notes')
    return s
  }
  const titleOf = (s: Awaited<ReturnType<typeof openNotes>>) =>
    s.getState().trees.find((t) => t.repo === 'you/notes')!.title
  const rootTitle = (s: Awaited<ReturnType<typeof openNotes>>) =>
    s.getState().data['you/notes']!.graph!.nodes.get('')!.title

  it('shows the new name at once and commits it to .yeraz.json, keeping the other fields', async () => {
    const s = await openNotes()
    await s.getState().renameTree('you/notes', '  Field   notes ')
    expect(titleOf(s)).toBe('Field notes')
    expect(rootTitle(s)).toBe('Field notes')
    expect(s.getState().sync['you/notes']).toMatchObject({ status: 'pending', files: 1 })
    await vi.waitFor(() =>
      expect(fake.repo('you/notes').read('.yeraz.json')).toBe(
        '{\n  "name": "Field notes",\n  "color": "amber"\n}\n',
      ),
    )
    await vi.waitFor(() => expect(s.getState().sync['you/notes']).toEqual({ status: 'synced' }))
    expect(titleOf(s)).toBe('Field notes')
    expect(rootTitle(s)).toBe('Field notes')
  })

  it('keeps a one-line .yeraz.json on one line, and adds a name when it has none', async () => {
    await fake.addRepo('you/bare', { '.yeraz.json': '{"color":"blue"}\n', 'a.md': '# A\n' })
    const s = createSession({ store: memoryStore() })
    await s.getState().signIn('good')
    await s.getState().open('you/bare')
    await s.getState().renameTree('you/bare', 'Bare')
    await s.getState().flush('you/bare')
    expect(fake.repo('you/bare').read('.yeraz.json')).toBe('{"color":"blue","name":"Bare"}\n')
  })

  it('keeps the new name when discovery answers before the commit', async () => {
    const s = await openNotes(60_000)
    await s.getState().renameTree('you/notes', 'Field notes')
    await s.getState().discover()
    expect(titleOf(s)).toBe('Field notes')
    await s.getState().open('you/notes')
    expect(rootTitle(s)).toBe('Field notes')
  })

  it('renames twice before a commit in one commit', async () => {
    const s = await openNotes(60_000)
    await s.getState().renameTree('you/notes', 'First')
    await s.getState().renameTree('you/notes', 'Second')
    fake.resetLog()
    await s.getState().flush('you/notes')
    expect(fake.log.filter((e) => e.operation === 'mutation')).toHaveLength(1)
    expect(JSON.parse(fake.repo('you/notes').read('.yeraz.json')!)).toEqual({
      name: 'Second',
      color: 'amber',
    })
  })

  it('refuses an empty name, and a .yeraz.json that is not JSON', async () => {
    const s = await openNotes()
    await expect(s.getState().renameTree('you/notes', '   ')).rejects.toThrow('needs a name')
    await fake.addRepo('you/broken', { '.yeraz.json': 'not json', 'b.md': '# B\n' })
    await s.getState().open('you/broken')
    await expect(s.getState().renameTree('you/broken', 'Fixed')).rejects.toThrow("isn't valid JSON")
    expect(titleOf(s)).toBe('Notes')
  })
})

describe('Family and Tree colours', () => {
  it('colours the Family and a Tree in .yeraz.json, shown at once and kept after the commit', async () => {
    await fake.addRepo('you/notes', {
      '.yeraz.json': '{\n  "name": "Notes"\n}\n',
      'Identity/a.md': '# A\n',
    })
    const s = createSession({ store: memoryStore(), autosaveDelay: 60_000 })
    await s.getState().signIn('good')
    await s.getState().open('you/notes')
    const ref = () => s.getState().trees.find((t) => t.repo === 'you/notes')!
    await s.getState().setColor('you/notes', 'amber')
    await s.getState().setColor('you/notes', 'violet', 'Identity')
    expect(ref()).toMatchObject({ color: 'amber', trees: { Identity: 'violet' } })
    // Discovery answering before the commit doesn't undo them.
    await s.getState().discover()
    expect(ref()).toMatchObject({ color: 'amber', trees: { Identity: 'violet' } })
    fake.resetLog()
    await s.getState().flush('you/notes')
    expect(fake.log.filter((e) => e.operation === 'mutation')).toHaveLength(1)
    expect(fake.repo('you/notes').read('.yeraz.json')).toBe(
      '{\n  "name": "Notes",\n  "color": "amber",\n  "trees": {\n    "Identity": "violet"\n  }\n}\n',
    )
    // Back to the defaults: the keys go.
    await s.getState().setColor('you/notes', null, 'Identity')
    await s.getState().setColor('you/notes', null)
    await s.getState().flush('you/notes')
    expect(fake.repo('you/notes').read('.yeraz.json')).toBe('{\n  "name": "Notes"\n}\n')
    expect(ref()).toMatchObject({ color: null, trees: {} })
  })
})

describe('hiding a leaf or a branch', () => {
  it('writes line 2 of the leaf, or of the branch’s README.md, and the graph leaves it out', async () => {
    await fake.addRepo('you/notes', {
      '.yeraz.json': '{"name":"Notes"}\n',
      'Identity/keycloak.md':
        '# 🔐 Keycloak\n<!-- yeraz {"color":{"heading":"amber"}} -->\n\nText.\n',
      'Identity/oauth.md': '# OAuth\n\nSee [Keycloak](/Identity/keycloak.md).\n',
      'Old/2019.md': '# 2019\n',
    })
    const s = createSession({ store: memoryStore(), autosaveDelay: 60_000 })
    await s.getState().signIn('good')
    await s.getState().open('you/notes')
    const graph = () => s.getState().data['you/notes']!.graph!
    await s.getState().setHidden('you/notes', 'Identity/keycloak.md', true)
    await s.getState().setHidden('you/notes', 'Old', true)
    expect([...graph().nodes.keys()].sort()).toEqual(['', 'Identity', 'Identity/oauth.md'])
    expect(graph().hidden.map((h) => h.id)).toEqual(['Identity/keycloak.md', 'Old'])
    expect(graph().threads).toEqual([])
    await s.getState().flush('you/notes')
    expect(fake.repo('you/notes').read('Identity/keycloak.md')).toBe(
      '# 🔐 Keycloak\n<!-- yeraz {"color":{"heading":"amber"},"hidden":true} -->\n\nText.\n',
    )
    expect(fake.repo('you/notes').read('Old/README.md')).toBe(
      '# Old\n<!-- yeraz {"hidden":true} -->\n\n',
    )
    // Shown again: the key goes, and line 2 with it when nothing else is in it.
    await s.getState().setHidden('you/notes', 'Identity/keycloak.md', false)
    await s.getState().setHidden('you/notes', 'Old', false)
    expect(graph().hidden).toEqual([])
    expect(graph().nodes.has('Old/2019.md')).toBe(true)
    await s.getState().flush('you/notes')
    expect(fake.repo('you/notes').read('Identity/keycloak.md')).toBe(
      '# 🔐 Keycloak\n<!-- yeraz {"color":{"heading":"amber"}} -->\n\nText.\n',
    )
    expect(fake.repo('you/notes').read('Old/README.md')).toBe('# Old\n\n')
  })
})

describe('planted dates', () => {
  it('dates each leaf by blame once, then from the device; a new leaf is planted now', async () => {
    const repo = await fake.addRepo('you/notes', {
      '.yeraz.json': '{"name":"Notes"}',
      'a.md': '# A\n',
    })
    await repo.commit({
      message: 'B',
      date: new Date('2026-03-01T00:00:00Z'),
      additions: [{ path: 'b.md', contents: '# B\n' }],
    })
    const store = memoryStore()
    const s = createSession({ store, autosaveDelay: 60_000 })
    await s.getState().signIn('good')
    await s.getState().open('you/notes')
    fake.resetLog()
    const first = await s.getState().planted('you/notes')
    expect(first.get('b.md')).toBe('2026-03-01T00:00:00.000Z')
    expect(fake.log.filter((e) => e.kind === 'graphql')).toHaveLength(1)
    await s.getState().apply('you/notes', [{ path: 'c.md', text: '# C\n' }])
    fake.resetLog()
    const again = await s.getState().planted('you/notes')
    expect(fake.log).toHaveLength(0)
    expect(Date.now() - Date.parse(again.get('c.md')!)).toBeLessThan(60_000)
  })
})

describe('renaming the repository on GitHub', () => {
  it('commits what is pending, renames, and knows the Family by its new name from then on', async () => {
    await fake.addRepo('you/notes', { '.yeraz.json': '{"name":"Notes"}\n', 'a.md': '# A\n' })
    const store = memoryStore()
    const s = createSession({ store, autosaveDelay: 60_000 })
    await s.getState().signIn('good')
    await s.getState().connect('you/notes')
    await s.getState().open('you/notes')
    await s.getState().apply('you/notes', [{ path: 'a.md', text: '# A\n\nMore.\n' }])
    const next = await s.getState().renameRepository('you/notes', 'journal')
    expect(next).toMatchObject({ repo: 'you/journal', name: 'journal', title: 'Notes' })
    expect(s.getState().trees.map((t) => t.repo)).toContain('you/journal')
    expect(s.getState().trees.map((t) => t.repo)).not.toContain('you/notes')
    expect(fake.repo('you/journal').read('a.md')).toBe('# A\n\nMore.\n')
    expect(s.getState().sync['you/notes']).toBeUndefined()
    // It opens under its new name without downloading again, and edits commit there.
    fake.resetLog()
    await s.getState().open('you/journal')
    expect(fake.log.filter((e) => e.kind === 'blob' || e.blobs > 0)).toHaveLength(0)
    expect(s.getState().data['you/journal']?.status).toBe('ready')
    await s.getState().apply('you/journal', [{ path: 'b.md', text: '# B\n' }])
    await s.getState().flush('you/journal')
    expect(fake.repo('you/journal').read('b.md')).toBe('# B\n')
    // Discovery agrees, and the rename survives a restart.
    await s.getState().discover()
    expect(s.getState().trees.map((t) => t.repo)).toContain('you/journal')
    const again = createSession({ store })
    await again.getState().start()
    expect(again.getState().trees.map((t) => t.repo)).toContain('you/journal')
    expect(again.getState().trees.map((t) => t.repo)).not.toContain('you/notes')
  })

  it('refuses a folder Family, a bad name, and says what a refusal needs', async () => {
    const s = createSession({ store: memoryStore() })
    await s.getState().signIn('good')
    await expect(s.getState().renameRepository('you/engineering', 'a b/c')).rejects.toThrow(
      'letters, numbers',
    )
    await fake.addRepo('you/taken')
    await s.getState().open('you/engineering')
    await expect(s.getState().renameRepository('you/engineering', 'taken')).rejects.toThrow(
      'name already exists on this account',
    )
  })
})

describe('pushing a folder Family to GitHub', () => {
  it('creates a private repository with every file, and shows it in the folder’s place', async () => {
    const notes = memoryFolder({
      '.yeraz.json': '{"name":"Notes","color":"amber"}\n',
      'Ideas/first.md': '# First\n\nSee [Second](/Ideas/second.md).\n',
      'Ideas/second.md': '# Second\n',
      'assets/pic.png': 'PNG',
      '.obsidian/app.json': '{}',
    })
    const folders = memoryFolders({ Notes: notes })
    const s = createSession({ store: memoryStore(), folders, autosaveDelay: 60_000 })
    await s.getState().start()
    folders.choose('Notes')
    const folder = (await s.getState().addFolder())!
    await s.getState().open(folder.repo)
    await s.getState().apply(folder.repo, [{ path: 'Ideas/second.md', text: '# Second\n\nTwo.\n' }])
    await expect(s.getState().publishFolder(folder.repo, 'notes')).rejects.toThrow(
      'Connect GitHub first',
    )
    await s.getState().signIn('good')
    const next = await s.getState().publishFolder(folder.repo, 'notes')
    expect(next).toMatchObject({
      repo: 'you/notes',
      title: 'Notes',
      color: 'amber',
      isPrivate: true,
    })
    const repo = fake.repo('you/notes')
    expect(repo.read('Ideas/second.md')).toBe('# Second\n\nTwo.\n')
    expect(repo.read('.yeraz.json')).toBe('{"name":"Notes","color":"amber"}\n')
    expect(repo.read('assets/pic.png')).toBe('PNG')
    expect(repo.read('.obsidian/app.json')).toBeUndefined()
    expect(repo.read('README.md')).toBeUndefined()
    expect(repo.head?.message).toContain('Pushed from a folder by Yeraz.')
    // The folder stays as it was; the Family on this device is the repository now.
    expect(notes.text('Ideas/first.md')).toBe('# First\n\nSee [Second](/Ideas/second.md).\n')
    expect(s.getState().trees.map((t) => t.repo)).toContain('you/notes')
    expect(s.getState().trees.map((t) => t.repo)).not.toContain(folder.repo)
    await s.getState().open('you/notes')
    expect(s.getState().data['you/notes']?.graph?.stats.leaves).toBe(2)
  })
})

describe('removing a repository', () => {
  it('stops showing it, keeps it off until connected again, and leaves GitHub as it was', async () => {
    const store = memoryStore()
    const s = createSession({ store })
    await s.getState().signIn('good')
    await s.getState().discover()
    const before = s.getState().trees.map((t) => t.repo)
    expect(before).toContain('you/engineering')

    await s.getState().removeTree('you/engineering')
    expect(s.getState().trees.map((t) => t.repo)).not.toContain('you/engineering')
    await s.getState().discover()
    expect(s.getState().trees.map((t) => t.repo)).not.toContain('you/engineering')
    expect(fake.repo('you/engineering')).toBeTruthy()

    await s.getState().connect('you/engineering')
    expect(s.getState().trees.map((t) => t.repo)).toContain('you/engineering')
    await s.getState().discover()
    expect(s.getState().trees.map((t) => t.repo)).toContain('you/engineering')
  })
})
