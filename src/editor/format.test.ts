import { EditorState, type TransactionSpec } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { link, toggleWrap } from './format'

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
