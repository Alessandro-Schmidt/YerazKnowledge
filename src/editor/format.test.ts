import { EditorState, type TransactionSpec } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { indentList, link, toggleWrap } from './format'

/** `doc` with `[` `]` marking the selection, after the change; the new selection marked too. */
function apply(doc: string, change: (state: EditorState) => TransactionSpec) {
  const anchor = doc.indexOf('[')
  const head = doc.indexOf(']') - 1
  const state = EditorState.create({
    doc: doc.replace('[', '').replace(']', ''),
    selection: { anchor, head },
  })
  const next = state.update(change(state)).state
  const { from, to } = next.selection.main
  const text = next.doc.toString()
  return `${text.slice(0, from)}[${text.slice(from, to)}]${text.slice(to)}`
}

describe('toggleWrap', () => {
  it('wraps the selection, and takes the marks off a wrapped one', () => {
    expect(apply('a [word] here', (s) => toggleWrap(s, '**'))).toBe('a **[word]** here')
    expect(apply('a **[word]** here', (s) => toggleWrap(s, '**'))).toBe('a [word] here')
    expect(apply('a [**word**] here', (s) => toggleWrap(s, '**'))).toBe('a [word] here')
  })

  it('opens a pair to type into when nothing is selected', () => {
    expect(apply('a [] here', (s) => toggleWrap(s, '*'))).toBe('a *[]* here')
    expect(apply('a *[]* here', (s) => toggleWrap(s, '*'))).toBe('a [] here')
  })

  it('wraps in different opening and closing marks', () => {
    expect(apply('see [this]', (s) => toggleWrap(s, '(', ')'))).toBe('see ([this])')
  })
})

describe('link', () => {
  it('makes the selection a link and puts the cursor where the address goes', () => {
    expect(apply('see [this] now', link)).toBe('see [this]([]) now')
    expect(apply('see [] now', link)).toBe('see [[]]() now')
  })
})

describe('indentList', () => {
  const at = (doc: string) => {
    const head = doc.indexOf('|')
    return EditorState.create({ doc: doc.replace('|', ''), selection: { anchor: head } })
  }
  const after = (doc: string, dir: 1 | -1) => {
    const state = at(doc)
    const spec = indentList(state, dir)
    return spec && state.update(spec).state.doc.toString()
  }

  it('nests a bullet under the item above, as wide as its marker', () => {
    expect(after('- a\n- b|', 1)).toBe('- a\n  - b')
    expect(after('1. a\n2. b|', 1)).toBe('1. a\n   2. b')
    expect(after('- a\n  - b\n  - c|', 1)).toBe('- a\n  - b\n    - c')
  })

  it('brings an item back out to the item above it, then to the margin', () => {
    expect(after('- a\n  - b|', -1)).toBe('- a\n- b')
    expect(after('1. a\n   - b\n     - c|', -1)).toBe('1. a\n   - b\n   - c')
    expect(after('- a|', -1)).toBeNull()
  })

  it('leaves lines that are not list items to the editor', () => {
    expect(after('plain|', 1)).toBeNull()
    expect(after('# Title|\n- a', 1)).toBeNull()
  })
})
