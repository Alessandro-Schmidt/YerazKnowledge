import { describe, expect, it } from 'vitest'
import { memoryFolder } from '../../test/memoryFolder'
import type { TreeRef } from '../github/graphql'
import { gitBlobSha } from '../model/sha'
import { memoryStore } from '../store/db'
import { pullFolder, pushFolder } from './folder'

const ref: TreeRef = {
  owner: '~',
  name: 'notes',
  repo: '~/notes',
  branch: '',
  isPrivate: true,
  title: 'Notes',
  color: null,
  folder: 'Notes',
}

const KEYCLOAK = '# Keycloak\n\nOne.\n\nTwo.\n\nThree.\n'
const files = () =>
  memoryFolder({
    '.yeraz.json': '{"name":"Notes"}\n',
    'identity/keycloak.md': KEYCLOAK,
    'welcome.md': '# Welcome\n',
    'assets/realm.png': 'png bytes',
    '.obsidian/app.json': '{}',
    'identity/.DS_Store': 'x',
  })

describe('pullFolder', () => {
  it('lists the folder as GitHub would, with git blob SHAs, and parses every leaf', async () => {
    const fs = files()
    const pulled = await pullFolder(ref, { fs, store: memoryStore() })
    expect(pulled.model.leaves.sort()).toEqual(['identity/keycloak.md', 'welcome.md'])
    expect(pulled.leaves.get('identity/keycloak.md')!.title).toBe('Keycloak')
    expect(pulled.entries.find((e) => e.path === 'identity/keycloak.md')!.sha).toBe(
      await gitBlobSha(KEYCLOAK),
    )
    // Hidden entries are never listed; images aren't read until shown.
    expect(pulled.entries.map((e) => e.path).sort()).toEqual([
      '.yeraz.json',
      'assets/realm.png',
      'identity/keycloak.md',
      'welcome.md',
    ])
    expect(fs.reads.sort()).toEqual(['.yeraz.json', 'identity/keycloak.md', 'welcome.md'])
  })

  it('reopening reads only the files changed since', async () => {
    const fs = files()
    const store = memoryStore()
    await pullFolder(ref, { fs, store })
    fs.reads.length = 0
    fs.put('welcome.md', '# Welcome back\n')
    const pulled = await pullFolder(ref, { fs, store })
    expect(fs.reads).toEqual(['welcome.md'])
    expect(pulled.leaves.get('welcome.md')!.title).toBe('Welcome back')
    expect(pulled.leaves.get('identity/keycloak.md')!.title).toBe('Keycloak')
  })
})

describe('pushFolder', () => {
  it('writes and deletes the changed files', async () => {
    const fs = files()
    const store = memoryStore()
    await pullFolder(ref, { fs, store })
    const base = await gitBlobSha(KEYCLOAK)
    const text = KEYCLOAK.replace('One.', 'One, edited.')
    const image = new Uint8Array([1, 2, 3])
    const pushed = await pushFolder(
      ref,
      {
        'identity/keycloak.md': { text, base },
        'welcome.md': { text: null, base: await gitBlobSha('# Welcome\n') },
        'assets/new.png': { text: image, base: null },
        'gone.md': { text: null, base: null },
      },
      { fs, store },
    )
    expect(pushed.conflicts).toEqual([])
    expect(pushed.committed.sort()).toEqual([
      'assets/new.png',
      'identity/keycloak.md',
      'welcome.md',
    ])
    expect(fs.text('identity/keycloak.md')).toBe(text)
    expect(fs.files.has('welcome.md')).toBe(false)
    expect(fs.files.get('assets/new.png')!.bytes).toEqual(image)

    // The listing left behind is the folder as it is now: the next open shows the edit.
    const pulled = await pullFolder(ref, { fs, store })
    expect(pulled.model.leaves).toEqual(['identity/keycloak.md'])
  })

  it('reads a written file again, though the disk keeps its time too coarsely to tell', async () => {
    const fs = files()
    const store = memoryStore()
    await pullFolder(ref, { fs, store })
    const before = fs.files.get('identity/keycloak.md')!.modified
    const text = KEYCLOAK.replace('One.', 'Won.')
    await pushFolder(
      ref,
      { 'identity/keycloak.md': { text, base: await gitBlobSha(KEYCLOAK) } },
      { fs, store },
    )
    // Same length, and the same modification time (FAT keeps it to 2 s).
    fs.files.get('identity/keycloak.md')!.modified = before
    const pulled = await pullFolder(ref, { fs, store })
    expect(pulled.entries.find((e) => e.path === 'identity/keycloak.md')!.sha).toBe(
      await gitBlobSha(text),
    )
  })

  it('merges a leaf another device changed through the synced folder', async () => {
    const fs = files()
    const store = memoryStore()
    await pullFolder(ref, { fs, store })
    fs.put('identity/keycloak.md', KEYCLOAK.replace('Three.', 'Three, theirs.'))
    await pushFolder(
      ref,
      {
        'identity/keycloak.md': {
          text: KEYCLOAK.replace('One.', 'One, ours.'),
          base: await gitBlobSha(KEYCLOAK),
        },
      },
      { fs, store },
    )
    expect(fs.text('identity/keycloak.md')).toBe(
      '# Keycloak\n\nOne, ours.\n\nTwo.\n\nThree, theirs.\n',
    )
  })

  it('keeps both versions when both changed the same lines', async () => {
    const fs = files()
    const store = memoryStore()
    await pullFolder(ref, { fs, store })
    fs.put('identity/keycloak.md', KEYCLOAK.replace('Two.', 'Two, theirs.'))
    const pushed = await pushFolder(
      ref,
      {
        'identity/keycloak.md': {
          text: KEYCLOAK.replace('Two.', 'Two, ours.'),
          base: await gitBlobSha(KEYCLOAK),
        },
      },
      { fs, store, now: () => new Date('2026-10-19T10:00:00Z') },
    )
    expect(pushed.conflicts).toEqual(['identity/keycloak.conflict-2026-10-19.md'])
    expect(fs.text('identity/keycloak.md')).toContain('Two, theirs.')
    expect(fs.text('identity/keycloak.conflict-2026-10-19.md')).toContain('Two, ours.')
  })
})

describe('templates in a folder', () => {
  it('lists and reads .yeraz/templates/*.md, while other hidden entries stay out', async () => {
    const fs = files()
    fs.put('.yeraz/templates/meeting.md', '# 📝 Meeting\n\n{{date}}\n')
    fs.put('.git/HEAD', 'ref: refs/heads/main')
    const pulled = await pullFolder(ref, { fs, store: memoryStore() })
    expect(pulled.model.templates.map((t) => t.path)).toEqual(['.yeraz/templates/meeting.md'])
    expect(pulled.leaves.get('.yeraz/templates/meeting.md')!.title).toBe('Meeting')
    expect(pulled.entries.some((e) => e.path.startsWith('.git/'))).toBe(false)
  })
})
