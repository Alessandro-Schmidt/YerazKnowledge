import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { embedOf } from '../model/embeds'
import { bookmarkChange, canOffer, pastedUrl } from './pasteLink'

describe('pastedUrl: only a single web address offers a bookmark', () => {
  it('takes one http(s) URL, trimmed', () => {
    expect(pastedUrl(' https://example.com/a?b=1 \n')).toBe('https://example.com/a?b=1')
    expect(pastedUrl('http://example.com')).toBe('http://example.com')
  })

  it('ignores text, several URLs and other schemes', () => {
    expect(pastedUrl('see https://example.com')).toBeNull()
    expect(pastedUrl('https://a.com\nhttps://b.com')).toBeNull()
    expect(pastedUrl('ftp://example.com/file')).toBeNull()
    expect(pastedUrl('mailto:me@example.com')).toBeNull()
    expect(pastedUrl('https://')).toBeNull()
  })
})

describe('canOffer: where a pasted URL may become a bookmark', () => {
  const at = (doc: string, marker = '|') => {
    const pos = doc.indexOf(marker)
    const state = EditorState.create({
      doc: doc.replace(marker, ''),
      extensions: markdown({ base: markdownLanguage }),
    })
    ensureSyntaxTree(state, state.doc.length)
    return canOffer(state, pos)
  }

  it('in the body, alone or inside a sentence', () => {
    expect(at('# T\n\n|')).toBe(true)
    expect(at('# T\n\nRead | first')).toBe(true)
    expect(at('# Links\n\nReading list:\n|')).toBe(true)
  })

  it('not in the title, code, lists, quotes, the metadata line or a link', () => {
    expect(at('# T|')).toBe(false)
    expect(at('# T\n\n```\n|\n```')).toBe(false)
    expect(at('# T\n\nSome `co|de`')).toBe(false)
    expect(at('# T\n\n- |')).toBe(false)
    expect(at('# T\n\n> |')).toBe(false)
    expect(at('# T\n<!-- yeraz {"cover":"|"} -->\n')).toBe(false)
    expect(at('# T\n\n[Docs](|')).toBe(false)
    expect(at('# T\n\n<|')).toBe(false)
  })
})

describe('bookmarkChange: the pasted URL becomes a paragraph of one titled link', () => {
  const LINK = 'https://en.wikipedia.org/wiki/Baroque'
  const apply = (doc: string) => {
    const from = doc.indexOf(LINK)
    const state = EditorState.create({ doc })
    const next = state.update(bookmarkChange(state, from, from + LINK.length)).state
    return { text: next.doc.toString(), cursor: next.selection.main.head }
  }
  const BOOKMARK = `[Baroque](${LINK})`

  it('a URL alone on the last line', () => {
    expect(apply(`# T\n\n${LINK}`)).toEqual({
      text: `# T\n\n${BOOKMARK}\n`,
      cursor: `# T\n\n${BOOKMARK}\n`.length,
    })
  })

  it('a URL inside a sentence splits it into paragraphs', () => {
    const { text, cursor } = apply(`# T\n\nRead ${LINK} first.`)
    expect(text).toBe(`# T\n\nRead\n\n${BOOKMARK}\n\nfirst.`)
    expect(cursor).toBe(`# T\n\nRead\n\n${BOOKMARK}\n`.length)
  })

  it('blank lines are added only where missing', () => {
    expect(apply(`# T\n${LINK}\nNext`).text).toBe(`# T\n\n${BOOKMARK}\n\nNext`)
    expect(apply(`# T\n\n${LINK}\n\nNext`).text).toBe(`# T\n\n${BOOKMARK}\n\nNext`)
  })

  it('is read back as a bookmark, whatever the URL holds', () => {
    for (const url of [LINK, 'https://example.com/a(b', 'https://example.com/x]y']) {
      const state = EditorState.create({ doc: url })
      const line = state.update(bookmarkChange(state, 0, url.length)).state.doc.line(1).text
      expect(embedOf(line)).toMatchObject({ kind: 'bookmark', url })
    }
  })
})
