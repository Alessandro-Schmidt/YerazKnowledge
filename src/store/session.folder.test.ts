// Families kept in a folder (issue #64): no token, and never a request to GitHub.

import { setupServer } from 'msw/node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { memoryFolder, memoryFolders, type MemoryFolder } from '../../test/memoryFolder'
import { deviceFolders, FolderError, type FolderAccess } from '../local/folder'
import { memoryStore } from './db'
import { createSession } from './session'

// No handlers: any request at all fails the test.
const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())

describe('a Family in a folder', () => {
  it('seeds the example Family when asked, in place of the welcome leaf', async () => {
    const example = memoryFolder()
    const folders = memoryFolders({ Example: example })
    const s = createSession({ store: memoryStore(), folders })
    await s.getState().start()
    folders.choose('Example')
    const { EXAMPLE_FILES } = await import('../example/files')
    const ref = (await s.getState().addFolder(undefined, EXAMPLE_FILES))!
    expect(example.text('Welcome.md')).toMatch(/^# 🌱 Welcome/)
    expect(example.text('welcome.md')).toBeUndefined()
    await s.getState().open(ref.repo)
    const data = s.getState().data[ref.repo]
    expect(data?.status === 'ready' && data.graph.stats).toMatchObject({ leaves: 4, branches: 2 })
    // Its links reach their leaves, bar the one meant as a ghost.
    expect(data?.status === 'ready' && [...data.graph.ghosts.keys()]).toEqual(['Ideas.md'])
  })

  it('adds a folder without a token: marks it, welcomes it, and opens it', async () => {
    const store = memoryStore()
    const notes = memoryFolder()
    const folders = memoryFolders({ Notes: notes })
    const s = createSession({ store, folders })
    await s.getState().start()
    expect(s.getState()).toMatchObject({ phase: 'signed-out', folders: true })

    expect(await s.getState().addFolder()).toBeNull() // cancelled
    folders.choose('Notes')
    const ref = (await s.getState().addFolder())!
    expect(ref).toMatchObject({ repo: '~/notes', title: 'Notes', folder: 'Notes' })
    expect(s.getState().phase).toBe('signed-in')
    expect(notes.text('.yeraz.json')).toBe('{"name":"Notes"}\n')
    expect(notes.text('welcome.md')).toMatch(/^# 🌱 Welcome/)
    expect(notes.text('CLAUDE.md')).toMatch(/^# 🤖 Notes for AI agents/)

    await s.getState().open(ref.repo)
    const data = s.getState().data['~/notes']
    expect(data?.status).toBe('ready')
    expect(data?.status === 'ready' && data.graph.stats.leaves).toBe(2)

    // Reopening the app: still in, with the folder, and no GitHub.
    const again = createSession({ store, folders })
    await again.getState().start()
    expect(again.getState().phase).toBe('signed-in')
    await again.getState().discover()
    expect(again.getState().discovery).toBe('done')
    expect(again.getState().trees.map((t) => t.repo)).toEqual(['~/notes'])
  })

  it('keeps an existing folder of notes as it is, apart from the marker', async () => {
    const vault = memoryFolder({ 'Ideas/first.md': '# First\n', '.obsidian/app.json': '{}' })
    const folders = memoryFolders({ Vault: vault })
    const s = createSession({ store: memoryStore(), folders })
    folders.choose('Vault')
    const ref = (await s.getState().addFolder())!
    expect([...vault.files.keys()].sort()).toEqual([
      '.obsidian/app.json',
      '.yeraz.json',
      'Ideas/first.md',
    ])
    await s.getState().open(ref.repo)
    const data = s.getState().data[ref.repo]
    expect(data?.status === 'ready' && data.graph.nodes.get('Ideas/first.md')?.title).toBe('First')
  })

  it('creates a new project folder by name, in the place the person picks', async () => {
    const all: Record<string, MemoryFolder> = {}
    const folders = memoryFolders(all)
    const s = createSession({ store: memoryStore(), folders })
    expect(await s.getState().addFolder('Work notes')).toBeNull() // cancelled
    folders.choose('Documents')
    const ref = (await s.getState().addFolder('  Work notes '))!
    expect(ref).toMatchObject({ repo: '~/work-notes', title: 'Work notes', folder: 'Work notes' })
    expect(all['Work notes']!.text('.yeraz.json')).toBe('{"name":"Work notes"}\n')
    expect(all['Work notes']!.text('welcome.md')).toMatch(/^# 🌱 Welcome/)

    // A folder already there is never taken over.
    folders.choose('Documents')
    await expect(s.getState().addFolder('Work notes')).rejects.toThrow(
      "There's already a folder named “Work notes” there",
    )
  })

  it('refuses a project name no folder can have', async () => {
    const s = createSession({ store: memoryStore(), folders: memoryFolders({}) })
    await expect(s.getState().addFolder('  ')).rejects.toThrow('Give the project a name.')
    await expect(s.getState().addFolder('a/b')).rejects.toThrow("can't contain")
    await expect(s.getState().addFolder('.notes')).rejects.toThrow("can't start with a dot")
  })

  it('reads the name and colours of a folder that is a Family already', async () => {
    const folder = memoryFolder({ '.yeraz.json': '{"name":"Art","color":"amber"}' })
    const folders = memoryFolders({ art: folder })
    const s = createSession({ store: memoryStore(), folders })
    folders.choose('art')
    expect(await s.getState().addFolder()).toMatchObject({ title: 'Art', color: 'amber' })
    expect(folder.files.has('welcome.md')).toBe(false)
  })

  it('writes edits to the folder when the autosave fires, and shows its images', async () => {
    const notes = memoryFolder({ '.yeraz.json': '{"name":"Notes"}', 'a.md': '# A\n' })
    notes.files.set('assets/x.png', { bytes: new Uint8Array([9, 9]), modified: 1 })
    const folders = memoryFolders({ Notes: notes })
    const s = createSession({ store: memoryStore(), folders, autosaveDelay: 20 })
    folders.choose('Notes')
    const ref = (await s.getState().addFolder())!
    await s.getState().open(ref.repo)

    await s.getState().apply(ref.repo, [{ path: 'b.md', text: '# B\n' }])
    expect(s.getState().sync[ref.repo]).toMatchObject({ status: 'pending', files: 1 })
    await new Promise((r) => setTimeout(r, 60))
    expect(notes.text('b.md')).toBe('# B\n')
    expect(s.getState().sync[ref.repo]).toEqual({ status: 'synced' })

    await s.getState().renameTree(ref.repo, 'My notes')
    await s.getState().flush(ref.repo)
    expect(JSON.parse(notes.text('.yeraz.json')!)).toEqual({ name: 'My notes' })
    expect(s.getState().trees[0]!.title).toBe('My notes')

    expect(await s.getState().assetUrl(ref.repo, 'assets/x.png')).toMatch(/^blob:/)
    expect(notes.reads).toContain('assets/x.png')
  })

  it('signing out of GitHub keeps the folders', async () => {
    const store = memoryStore()
    const folders = memoryFolders({ Notes: memoryFolder() })
    const s = createSession({ store, folders })
    folders.choose('Notes')
    await s.getState().addFolder()
    await s.getState().signOut()
    expect(s.getState().phase).toBe('signed-in')
    expect(s.getState().trees.map((t) => t.repo)).toEqual(['~/notes'])
  })

  it('asks for access again when the browser forgot it, then opens', async () => {
    const notes = memoryFolder({ '.yeraz.json': '{"name":"Notes"}', 'a.md': '# A\n' })
    let granted = true
    const folders: FolderAccess = {
      pick: async () => ({ name: 'Notes', handle: 'Notes' }),
      create: async () => null,
      open: async (_, ask) => {
        if (!granted && !ask) throw new FolderError('permission', 'Allow it again.')
        granted = true
        return notes
      },
    }
    const store = memoryStore()
    await createSession({ store, folders }).getState().addFolder()

    granted = false
    const s = createSession({ store, folders })
    await s.getState().start()
    await s.getState().open('~/notes')
    expect(s.getState().data['~/notes']).toMatchObject({ status: 'error', kind: 'permission' })
    await s.getState().allowFolder('~/notes')
    expect(s.getState().data['~/notes']?.status).toBe('ready')
  })

  it("says so when the browser can't open folders", async () => {
    const s = createSession({ store: memoryStore(), folders: null })
    expect(s.getState().folders).toBe(false)
    await expect(s.getState().addFolder()).rejects.toThrow("This browser can't open folders")
  })
})

describe('a Family kept on a device without folders (phones, Safari, Firefox)', () => {
  const text = (s: string) => new TextEncoder().encode(s)

  it('starts a project by name: a marker and a welcome leaf, kept in the browser’s storage', async () => {
    const store = memoryStore()
    const s = createSession({ store, folders: deviceFolders(store, async () => null) })
    await s.getState().start()
    expect(s.getState()).toMatchObject({ folders: true, onDevice: true })
    expect(await s.getState().addFolder()).toBeNull() // the picker was cancelled
    const ref = (await s.getState().addFolder('Recipes'))!
    expect(ref).toMatchObject({ repo: '~/recipes', title: 'Recipes' })
    await s.getState().open(ref.repo)
    const data = s.getState().data['~/recipes']
    expect(data?.status === 'ready' && data.graph.nodes.get('welcome.md')?.title).toBe('Welcome')
  })

  it('copies a picked folder in, without its hidden files, and keeps edits across reopening', async () => {
    const store = memoryStore()
    const picked = [
      { path: 'Vault/Ideas/first.md', bytes: text('# First\n') },
      { path: 'Vault/.obsidian/app.json', bytes: text('{}') },
      { path: 'Vault/assets/x.png', bytes: new Uint8Array([9, 9]) },
    ]
    const folders = deviceFolders(store, async () => picked)
    const s = createSession({ store, folders, autosaveDelay: 20 })
    const ref = (await s.getState().addFolder())!
    expect(ref).toMatchObject({ repo: '~/vault', title: 'Vault' })
    const fs = await folders.open(await store.get(`folder:${ref.repo}`), false)
    expect((await fs.list()).map((f) => f.path).sort()).toEqual([
      '.yeraz.json',
      'Ideas/first.md',
      'assets/x.png',
    ])

    await s.getState().open(ref.repo)
    await s.getState().apply(ref.repo, [{ path: 'Ideas/first.md', text: '# First\n\nMore.\n' }])
    await new Promise((r) => setTimeout(r, 60))
    expect(s.getState().sync[ref.repo]).toEqual({ status: 'synced' })

    const again = createSession({ store, folders })
    await again.getState().start()
    await again.getState().open(ref.repo)
    expect(await again.getState().textOf(ref.repo, 'Ideas/first.md')).toBe('# First\n\nMore.\n')
  })
})

describe('removing a Family', () => {
  it('starts a named Family on the device, and deletes it on removal', async () => {
    const store = memoryStore()
    const folders = deviceFolders(store, async () => null)
    const s = createSession({ store, folders })
    await s.getState().start()
    const ref = (await s.getState().addFolder(' Recipes '))!
    expect(ref).toMatchObject({ repo: '~/recipes', title: 'Recipes' })
    const handle = await store.get<string>('folder:~/recipes')
    expect(await store.get(`device:${handle}`)).toBeTruthy()

    await s.getState().removeTree('~/recipes')
    expect(s.getState().trees).toEqual([])
    expect(s.getState().phase).toBe('signed-out')
    expect(await store.get('folder:~/recipes')).toBeUndefined()
    expect(await store.get(`device:${handle}`)).toBeUndefined()
    expect(await store.get(`device:${handle}:.yeraz.json`)).toBeFalsy()
  })

  it('forgets a folder on the disk without touching its files', async () => {
    const store = memoryStore()
    const notes = memoryFolder()
    const folders = memoryFolders({ Notes: notes })
    const s = createSession({ store, folders })
    await s.getState().start()
    folders.choose('Notes')
    await s.getState().addFolder()
    await s.getState().removeTree('~/notes')
    expect(s.getState().trees).toEqual([])
    expect(notes.text('.yeraz.json')).toBe('{"name":"Notes"}\n')
  })
})
