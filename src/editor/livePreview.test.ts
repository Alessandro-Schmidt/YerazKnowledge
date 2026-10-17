import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { imageResize } from './livePreview'

/** The text after resizing the image that starts at `at` (the first `![` by default). */
function resized(doc: string, width: number | null, at = doc.indexOf('![')) {
  const state = EditorState.create({ doc, extensions: markdown({ base: markdownLanguage }) })
  ensureSyntaxTree(state, state.doc.length)
  const change = imageResize(state, at, width)
  return change === null ? null : state.update({ changes: change }).state.doc.toString()
}

describe('imageResize: an image’s new width, written in its title', () => {
  it('adds a title holding the width', () => {
    expect(resized('# T\n\n![Realm](/assets/realm.png)\n', 40)).toBe(
      '# T\n\n![Realm](/assets/realm.png "width=40%")\n',
    )
  })

  it('replaces the width already there, keeping the rest of the title', () => {
    expect(resized('![Realm](/assets/realm.png "width=40%")', 65)).toBe(
      '![Realm](/assets/realm.png "width=65%")',
    )
    expect(resized('![Realm](/assets/realm.png "The \\"realm\\" width=40%")', 65)).toBe(
      '![Realm](/assets/realm.png "The \\"realm\\" width=65%")',
    )
    expect(resized("![Realm](/assets/realm.png 'Our realm')", 50)).toBe(
      '![Realm](/assets/realm.png "Our realm width=50%")',
    )
  })

  it('at full width, drops the width, and the title with it when nothing else is in it', () => {
    expect(resized('![Realm](/assets/realm.png "width=40%")', 100)).toBe(
      '![Realm](/assets/realm.png)',
    )
    expect(resized('![Realm](/assets/realm.png "Our realm width=40%")', null)).toBe(
      '![Realm](/assets/realm.png "Our realm")',
    )
  })

  it('changes nothing when the width is the same, or no image starts there', () => {
    expect(resized('![Realm](/assets/realm.png)', 100)).toBeNull()
    expect(resized('![Realm](/assets/realm.png "width=40%")', 40)).toBeNull()
    expect(resized('Some text', 40, 0)).toBeNull()
  })

  it('resizes the image that starts there, not another one on the line', () => {
    const doc = '![A](/assets/a.png) ![B](/assets/b.png)'
    expect(resized(doc, 30, doc.indexOf('![B'))).toBe(
      '![A](/assets/a.png) ![B](/assets/b.png "width=30%")',
    )
  })
})
