import { EditorState, Text, type TransactionSpec } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { bodyStart, hiddenTitle, hintParts, isEmpty } from './emptyText'

const doc = (text: string) => Text.of(text.split('\n'))
const META = '<!-- yeraz {"color":{"heading":"amber"}} -->'

describe('isEmpty: nothing written below the title', () => {
  it('a new leaf or branch text, a heading and a blank line, is empty', () => {
    expect(isEmpty(doc('# Cloud\n\n'))).toBe(true)
    expect(isEmpty(doc(`# Cloud\n${META}\n\n`))).toBe(true)
    expect(isEmpty(doc(''))).toBe(true)
  })

  it('any text below the title is not', () => {
    expect(isEmpty(doc('# Cloud\n\nContainers.'))).toBe(false)
    expect(isEmpty(doc('# Cloud\nContainers.'))).toBe(false)
    expect(isEmpty(doc('No heading at all.'))).toBe(false)
  })

  it('the body starts after the title, its metadata and one blank line', () => {
    expect(bodyStart(doc('# Cloud\n\nText'))).toBe(3)
    expect(bodyStart(doc(`# Cloud\n${META}\n\nText`))).toBe(4)
    expect(bodyStart(doc('# Cloud\nText'))).toBe(2)
    expect(bodyStart(doc('Text'))).toBe(1)
  })
})

describe('hintParts: the key to hold is the device’s own', () => {
  it('⌘ on a Mac, Ctrl elsewhere, and / on touch screens', () => {
    expect(hintParts(false, true).join('')).toBe('Click to write, hold ⌘ to see options')
    expect(hintParts(false, false).join('')).toBe('Click to write, hold Ctrl to see options')
    expect(hintParts(true, true).join('')).toBe('Tap to write, type / to see options')
  })
})

describe('hiddenTitle: a branch’s text without its heading', () => {
  const TEXT = '# Agents handbook\n\nWhat this branch is for.'
  const BODY = TEXT.indexOf('What')
  const start = (text = TEXT) => EditorState.create({ doc: text, extensions: hiddenTitle })
  const typed = (state: EditorState, spec: TransactionSpec) =>
    state.update({ userEvent: 'input.type', ...spec }).state

  it('the cursor never rests in the hidden heading', () => {
    expect(start().update({ selection: { anchor: 0 } }).state.selection.main.head).toBe(BODY)
    expect(start().update({ selection: { anchor: 5 } }).state.selection.main.head).toBe(BODY)
  })

  it('edits inside the heading are dropped; the body is written as usual', () => {
    expect(typed(start(), { changes: { from: 2, to: 8, insert: 'X' } }).doc.toString()).toBe(TEXT)
    const state = typed(start(), { changes: { from: BODY, insert: 'Hello. ' } })
    expect(state.doc.toString()).toBe('# Agents handbook\n\nHello. What this branch is for.')
  })

  it('a new branch text is written below its heading', () => {
    const state = typed(start('# Cloud\n\n'), { changes: { from: 9, insert: 'Containers.' } })
    expect(state.doc.toString()).toBe('# Cloud\n\nContainers.')
  })

  it('a text whose line 1 is not a heading hides nothing', () => {
    expect(start('Just text.').update({ selection: { anchor: 0 } }).state.selection.main.head).toBe(
      0,
    )
  })
})
