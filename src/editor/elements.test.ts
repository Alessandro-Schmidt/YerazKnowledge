import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { deletion, linkAt, linkParts, shownSource, showSource, sourceShown } from './elements'

const make = (doc: string, cursor = 0) => {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [markdown({ base: markdownLanguage }), shownSource],
  })
  ensureSyntaxTree(state, state.doc.length)
  return state
}

describe('linkAt: the plain link at a position', () => {
  const doc =
    'See [Keycloak](/identity/keycloak.md "Login") and ![x](/a.png), a note[^1], [ref][r].'

  it('finds a link from anywhere in it, with its text and address', () => {
    const state = make(doc)
    const link = linkAt(state, doc.indexOf('cloak'))!
    expect(state.sliceDoc(link.from, link.to)).toBe('[Keycloak](/identity/keycloak.md "Login")')
    expect(linkParts(state, link)).toMatchObject({
      text: 'Keycloak',
      url: '/identity/keycloak.md',
      title: '"Login"',
    })
  })

  it('is not an image, a footnote mark, or a link without an address', () => {
    const state = make(doc)
    expect(linkAt(state, doc.indexOf('x]'))).toBeNull()
    expect(linkAt(state, doc.indexOf('^1'))).toBeNull()
    expect(linkAt(state, doc.indexOf('ref'))).toBeNull()
  })
})

describe('shownSource: Markdown shown on request', () => {
  it('lasts while the cursor is in the element, and ends when it leaves', () => {
    let state = make('Some ![x](/a.png) text')
    state = state.update({
      effects: showSource.of({ from: 5, to: 17 }),
      selection: { anchor: 17 },
    }).state
    expect(sourceShown(state, 5, 17)).toBe(true)
    state = state.update({ changes: { from: 9, insert: 'yz' }, selection: { anchor: 11 } }).state
    expect(sourceShown(state, 5, 19)).toBe(true)
    state = state.update({ selection: { anchor: 0 } }).state
    expect(sourceShown(state, 5, 19)).toBe(false)
  })
})

describe('deletion: what deleting an element takes', () => {
  it('takes its lines when nothing else is on them', () => {
    const doc = 'A\n\n![x](/a.png)\n\nB'
    const from = doc.indexOf('!')
    const state = make(doc)
    const spec = deletion(state, from, from + 12)
    expect(state.update({ changes: spec }).state.doc.toString()).toBe('A\n\nB')
  })

  it('takes only itself beside other text, and the line before at the end', () => {
    const state = make('A ![x](/a.png) B\n![y](/b.png)')
    expect(state.update({ changes: deletion(state, 2, 14) }).state.doc.toString()).toBe(
      'A  B\n![y](/b.png)',
    )
    expect(state.update({ changes: deletion(state, 17, 29) }).state.doc.toString()).toBe(
      'A ![x](/a.png) B',
    )
  })
})
