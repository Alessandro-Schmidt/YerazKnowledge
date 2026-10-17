import { history, undo } from '@codemirror/commands'
import { EditorState, type TransactionSpec } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { metaLine } from './metaLine'

const META = '<!-- yeraz {"color":{"heading":"amber"}} -->'
const LEAF = `# 🇦🇲 Armenia\n${META}\n\nYerevan.`
const TITLE_END = '# 🇦🇲 Armenia'.length
const META_END = TITLE_END + 1 + META.length

const start = (doc = LEAF) => EditorState.create({ doc, extensions: [metaLine, history()] })
const typed = (state: EditorState, spec: TransactionSpec) =>
  state.update({ userEvent: 'input.type', ...spec }).state

describe('metaLine: line 2 stays whole while the text around it is edited', () => {
  it('Enter at the end of the title opens a line below the metadata, not above it', () => {
    const state = typed(start(), {
      changes: { from: TITLE_END, insert: '\n' },
      selection: { anchor: TITLE_END + 1 },
    })
    expect(state.doc.toString()).toBe(`# 🇦🇲 Armenia\n${META}\n\n\nYerevan.`)
    expect(state.selection.main.head).toBe(META_END + 1)
  })

  it('a pasted line break at the end of the title splits around the metadata', () => {
    const state = typed(start(), {
      changes: { from: TITLE_END, insert: ' (Hayastan)\nCapital: Yerevan' },
      selection: { anchor: TITLE_END + 27 },
    })
    expect(state.doc.toString()).toBe(
      `# 🇦🇲 Armenia (Hayastan)\n${META}\nCapital: Yerevan\n\nYerevan.`,
    )
    expect(state.doc.lineAt(state.selection.main.head).text).toBe('Capital: Yerevan')
  })

  it('typing at the end of the title still changes the title', () => {
    const state = typed(start(), {
      changes: { from: TITLE_END, insert: 's' },
      selection: { anchor: TITLE_END + 1 },
    })
    expect(state.doc.toString()).toBe(`# 🇦🇲 Armenias\n${META}\n\nYerevan.`)
  })

  it('with nothing below the metadata, typing after it goes to the title, Enter below it', () => {
    const doc = `# T\n${META}`
    expect(typed(start(doc), { changes: { from: doc.length, insert: 'x' } }).doc.toString()).toBe(
      `# Tx\n${META}`,
    )
    expect(typed(start(doc), { changes: { from: doc.length, insert: '\n' } }).doc.toString()).toBe(
      `# T\n${META}\n`,
    )
  })

  it('the metadata line and the line breaks around it are not edited as text', () => {
    // Typing inside it, Backspace at the start of line 3, Delete at the end of the title.
    for (const changes of [
      { from: TITLE_END + 5, insert: 'x' },
      { from: META_END, to: META_END + 1 },
      { from: TITLE_END, to: TITLE_END + 1 },
    ])
      expect(typed(start(), { changes }).doc.toString()).toBe(LEAF)
  })

  it('a selection across the header deletes the text around the metadata', () => {
    const state = start().update({
      changes: { from: 2, to: META_END + 3 },
      userEvent: 'delete.selection',
    }).state
    expect(state.doc.toString()).toBe(`# \n${META}\nerevan.`)
  })

  it('header controls rewrite it, and Undo takes that back', () => {
    let state = start()
    const cover = '<!-- yeraz {"cover":"/a.png"} -->'
    state = state.update({
      changes: { from: TITLE_END + 1, to: META_END, insert: cover },
      filter: false,
    }).state
    expect(state.doc.line(2).text).toBe(cover)
    undo({ state, dispatch: (tr) => (state = tr.state) })
    expect(state.doc.toString()).toBe(LEAF)
  })

  it('does nothing to a text without metadata on line 2', () => {
    const doc = '# T\n\nBody'
    expect(typed(start(doc), { changes: { from: 3, insert: '\n' } }).doc.toString()).toBe(
      '# T\n\n\nBody',
    )
  })
})
