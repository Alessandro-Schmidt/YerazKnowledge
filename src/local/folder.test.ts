import { describe, expect, it } from 'vitest'
import type { Invoke } from '../store/token'
import { desktopFolders, FolderError } from './folder'

/** The desktop's commands, as src-tauri/src/folder.rs answers them: picked folders only. */
function desktop(opts: { allowed: string[]; families: string[]; yes: boolean }) {
  const calls: string[] = []
  const allowed = new Set(opts.allowed)
  const invoke = (async (cmd: string, args: Record<string, unknown> = {}) => {
    calls.push(cmd)
    const root = args.root as string
    if (cmd === 'pick_parent') return '/home/me'
    if (cmd === 'new_folder') return `${args.parent as string}/${args.name as string}`
    if (cmd === 'allow_folder') {
      if (!opts.families.includes(root)) throw 'missing'
      if (opts.yes) allowed.add(root)
      return opts.yes
    }
    if (!allowed.has(root)) throw 'permission'
    if (cmd === 'list_folder') return []
    throw new Error(`unexpected ${cmd}`)
  }) as Invoke
  return { folders: desktopFolders(invoke), calls }
}

const kindOf = (e: unknown) => (e instanceof FolderError ? e.kind : String(e))

describe('desktopFolders', () => {
  it('opens a folder picked on this device', async () => {
    const { folders } = desktop({ allowed: ['/notes'], families: ['/notes'], yes: false })
    expect(await (await folders.open('/notes', false)).list()).toEqual([])
  })

  it('asks again, in the system dialog, for a folder this device doesn’t allow', async () => {
    const { folders, calls } = desktop({ allowed: [], families: ['/notes'], yes: true })
    const fs = await folders.open('/notes', false)
    expect(await fs.list().catch(kindOf)).toBe('permission')
    expect(calls).not.toContain('allow_folder')

    expect(await (await folders.open('/notes', true)).list()).toEqual([])
    expect(calls).toContain('allow_folder')
  })

  it('makes a new Family’s folder in one picked for it, not in a Family’s folder', async () => {
    const { folders, calls } = desktop({ allowed: [], families: [], yes: false })
    expect(await folders.create('Notes')).toEqual({ name: 'Notes', handle: '/home/me/Notes' })
    expect(calls).toEqual(['pick_parent', 'new_folder'])
  })

  it('stays closed when the person says no, or when the folder holds no Family', async () => {
    const no = desktop({ allowed: [], families: ['/notes'], yes: false })
    expect(await no.folders.open('/notes', true).catch(kindOf)).toBe('permission')
    const home = desktop({ allowed: [], families: ['/notes'], yes: true })
    expect(await home.folders.open('/home/me', true).catch(kindOf)).toBe('missing')
  })
})
