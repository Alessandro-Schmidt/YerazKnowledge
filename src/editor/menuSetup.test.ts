import { describe, expect, it } from 'vitest'
import {
  BUILT_IN,
  DEFAULT_SETUP,
  MENU_KEY,
  blockKey,
  entries,
  move,
  putBlock,
  removeBlock,
  savedSetup,
  setHidden,
  shown,
} from './menuSetup'

const memory = (value: string | null) =>
  ({ getItem: (k: string) => (k === MENU_KEY ? value : null) }) as unknown as Storage

describe('the insert menu, set per device', () => {
  it('is every built-in item in its default order to start with', () => {
    expect(shown(DEFAULT_SETUP).map((e) => e.key)).toEqual(BUILT_IN.map((b) => b.kind))
  })

  it('moves an item, hides one, and keeps the saved order when items are added', () => {
    let setup = move(DEFAULT_SETUP, 'code', -5)
    expect(shown(setup)[0]!.key).toBe('code')
    expect(move(setup, 'code', -1)).toBe(setup) // already first
    setup = setHidden(setup, 'table', true)
    expect(shown(setup).map((e) => e.key)).not.toContain('table')
    expect(entries(setup).find((e) => e.key === 'table')!.hidden).toBe(true)
    setup = putBlock(setup, { id: 'a', name: 'Signature', text: '— Ale' })
    const keys = shown(setup).map((e) => e.key)
    expect(keys[0]).toBe('code')
    expect(keys.at(-1)).toBe(blockKey('a'))
    expect(shown(setup).at(-1)).toMatchObject({ label: 'Signature', text: '— Ale' })
    setup = setHidden(setup, 'table', false)
    expect(shown(setup).map((e) => e.key)).toContain('table')
  })

  it('edits and deletes a block, its place and visibility with it', () => {
    let setup = putBlock(DEFAULT_SETUP, { id: 'a', name: 'One', text: 'x' })
    setup = move(setup, blockKey('a'), -100)
    setup = putBlock(setup, { id: 'a', name: 'Two', text: 'y' })
    expect(shown(setup)[0]).toMatchObject({ label: 'Two', text: 'y' })
    setup = setHidden(setup, blockKey('a'), true)
    setup = removeBlock(setup, 'a')
    expect(setup.blocks).toEqual([])
    expect(setup.order).not.toContain(blockKey('a'))
    expect(setup.hidden).toEqual([])
  })

  it('reads what was saved, and the default from nothing or anything broken', () => {
    expect(savedSetup(memory(null))).toEqual(DEFAULT_SETUP)
    expect(savedSetup(memory('{oops'))).toEqual(DEFAULT_SETUP)
    expect(
      savedSetup(
        memory(
          JSON.stringify({
            order: ['code', 3],
            hidden: 'table',
            blocks: [{ id: 'a', name: 'A', text: 'a' }, { id: 1 }],
          }),
        ),
      ),
    ).toEqual({ order: ['code'], hidden: [], blocks: [{ id: 'a', name: 'A', text: 'a' }] })
  })
})
