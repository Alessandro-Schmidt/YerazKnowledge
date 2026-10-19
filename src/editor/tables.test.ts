import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { shownSource, showSource, typingLine } from './elements'
import { cellHtml, tableBlocks } from './tables'

const doc = [
  '# T',
  '',
  '| Name | Port |',
  '| --- | --: |',
  '| Realm | 8080 |',
  '',
  'Text',
  '',
  '> | a |',
  '> | - |',
].join('\n')
const table = doc.slice(doc.indexOf('| Name'), doc.indexOf('8080 |') + 6)

/** The ranges drawn as grids, after `spec` from a state with the cursor at 0. */
function drawn(spec: TransactionSpec = {}) {
  let state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(0),
    extensions: [markdown({ base: markdownLanguage }), shownSource, typingLine],
  })
  state = state.update(spec).state
  ensureSyntaxTree(state, state.doc.length)
  const ranges: string[] = []
  tableBlocks(state).between(0, state.doc.length, (from, to) => {
    ranges.push(state.sliceDoc(from, to))
  })
  return ranges
}

describe('tableBlocks: tables drawn as grids', () => {
  it('draws a top-level table over its whole lines, not one in a quote', () => {
    expect(drawn()).toEqual([table])
  })

  it('stays text while it is typed, or with the cursor inside its text', () => {
    const end = doc.indexOf('8080 |') + 6
    expect(drawn({ selection: { anchor: end }, userEvent: 'input.type' })).toEqual([])
    expect(drawn({ selection: { anchor: doc.indexOf('Realm') } })).toEqual([])
    // The cursor beside it (where a click below it lands) leaves it drawn.
    expect(drawn({ selection: { anchor: end } })).toEqual([table])
  })

  it('shows its Markdown when asked, until the cursor leaves it', () => {
    const from = doc.indexOf('| Name')
    const asked = { from, to: from + table.length }
    expect(drawn({ effects: showSource.of(asked), selection: { anchor: from } })).toEqual([])
  })
})

describe('cellHtml: a cell’s inline Markdown, drawn', () => {
  it('draws bold, italic, strikethrough, code and a link’s text', () => {
    expect(cellHtml('**Realm** _main_ *x* ~~old~~ `a|b` [docs](https://x.org)')).toBe(
      '<strong>Realm</strong> <em>main</em> <em>x</em> <s>old</s> <code>a|b</code> <span class="cm-link">docs</span>',
    )
  })

  it('escapes HTML, so a cell never runs any', () => {
    expect(cellHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('leaves snake_case words alone', () => {
    expect(cellHtml('client_id and realm_name')).toBe('client_id and realm_name')
  })
})
