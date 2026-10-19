import { describe, expect, it } from 'vitest'
import {
  clampWidth,
  PANELS,
  saveWidth,
  savedWidths,
  widthStore,
  widthVars,
  WIDTHS_KEY,
} from './panels'

const memory = () => {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  } as Storage
}

describe('panel widths (issue #80)', () => {
  it('starts from each panel’s initial width', () => {
    expect(savedWidths(memory())).toEqual({ explorer: 272, peek: 420, dock: 640 })
  })

  it('keeps a width between the panel’s least and most', () => {
    expect(clampWidth('explorer', 20)).toBe(PANELS.explorer.min)
    expect(clampWidth('peek', 5000)).toBe(PANELS.peek.max)
    expect(clampWidth('peek', 500.6)).toBe(501)
  })

  it('saves a width for this device, and reads back only sound ones', () => {
    const store = memory()
    saveWidth('peek', 600, store)
    expect(savedWidths(store).peek).toBe(600)
    expect(widthStore.get().peek).toBe(600)
    saveWidth('peek', null, store)
    expect(savedWidths(store).peek).toBe(420)
    store.setItem(WIDTHS_KEY, '{"explorer":"wide","dock":99999}')
    expect(savedWidths(store)).toEqual({ explorer: 272, peek: 420, dock: PANELS.dock.max })
    store.setItem(WIDTHS_KEY, 'not json')
    expect(savedWidths(store).explorer).toBe(272)
  })

  it('gives the page one CSS variable per panel', () => {
    expect(widthVars({ explorer: 300, peek: 400, dock: 700 })).toEqual({
      '--explorer-w': '300px',
      '--peek-w': '400px',
      '--dock-w': '700px',
    })
  })
})
