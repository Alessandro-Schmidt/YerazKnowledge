// Pasting a web address (issue #12): the URL goes in as it is, and a small menu offers to
// keep it as a link or make it a bookmark. A bookmark is a paragraph of one titled link,
// `[Baroque](https://en.wikipedia.org/wiki/Baroque)`, which GitHub shows as a link and
// Yeraz as a card (model/embeds.ts). The title comes from the URL: pages can't be fetched
// from the browser.

import { syntaxTree } from '@codemirror/language'
import {
  Prec,
  StateEffect,
  StateField,
  type EditorState,
  type TransactionSpec,
} from '@codemirror/state'
import { EditorView, keymap, showTooltip, type Tooltip } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import { bookmarkTitle, embedOf } from '../model/embeds'
import { menu } from './insertMenu'

/** The pasted text, when it is a single http(s) URL. */
export function pastedUrl(text: string): string | null {
  const url = text.trim()
  if (!/^https?:\/\/[^\s/]\S*$/i.test(url)) return null
  try {
    new URL(url)
    return url
  } catch {
    return null
  }
}

/** Nodes in which a URL is code, part of a block, the metadata line or another link. */
const KEEP =
  /^(FencedCode|CodeBlock|InlineCode|ListItem|Blockquote|CommentBlock|HTMLBlock|Link|Image|Table)$/

/** Whether a URL pasted at `pos` may become a bookmark: in a plain paragraph of the body. */
export function canOffer(state: EditorState, pos: number): boolean {
  if (state.doc.lineAt(pos).number === 1) return false
  if (/[([<"']$/.test(state.sliceDoc(Math.max(0, pos - 1), pos))) return false
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent)
    if (KEEP.test(n.name)) return false
  return true
}

const destination = (url: string) => {
  const open = url.split('(').length - 1
  return open === url.split(')').length - 1 ? url : `<${url}>`
}

/** Replaces the URL at [from, to) with `[Title](url)` in a paragraph of its own. */
export function bookmarkChange(state: EditorState, from: number, to: number): TransactionSpec {
  const { doc } = state
  const url = doc.sliceString(from, to)
  const title = bookmarkTitle(url).replace(/[[\]\\]/g, '\\$&')
  const start = doc.lineAt(from)
  const end = doc.lineAt(to)
  while (from > start.from && /[ \t]/.test(doc.sliceString(from - 1, from))) from--
  while (to < end.to && /[ \t]/.test(doc.sliceString(to, to + 1))) to++
  const blank = (n: number) => n < 1 || n > doc.lines || !doc.line(n).text.trim()
  const before =
    from > start.from ? '\n\n' : start.number > 1 && !blank(start.number - 1) ? '\n' : ''
  const after =
    to < end.to ? '\n\n' : end.number === doc.lines || !blank(end.number + 1) ? '\n' : ''
  const link = `[${title}](${destination(url)})`
  const insert = before + link + after
  return {
    changes: { from, to, insert },
    selection: { anchor: from + before.length + link.length + 1 },
    scrollIntoView: true,
  }
}

const openMenu = StateEffect.define<{ from: number; to: number }>()
const closeMenu = StateEffect.define<null>()

const ITEMS = [
  { kind: 'link', label: 'Keep as link' },
  { kind: 'bookmark', label: 'Bookmark' },
] as const

/** The pasted URL while its menu is open; typing, or moving away, closes it. */
const pasted = StateField.define<{ from: number; to: number } | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(openMenu)) return e.value
      if (e.is(closeMenu)) return null
    }
    if (!value || tr.docChanged) return null
    return tr.selection && tr.selection.main.head !== value.to ? null : value
  },
  provide: (field) =>
    showTooltip.from(field, (open): Tooltip | null =>
      open
        ? {
            pos: open.from,
            above: false,
            create: (view) => {
              const dismiss = () => {
                if (view.state.field(pasted)) view.dispatch({ effects: closeMenu.of(null) })
              }
              const choose = (kind: (typeof ITEMS)[number]['kind']) => {
                const at = view.state.field(pasted)
                if (kind === 'bookmark' && at)
                  view.dispatch({
                    ...bookmarkChange(view.state, at.from, at.to),
                    effects: closeMenu.of(null),
                  })
                else dismiss()
                view.focus()
              }
              return menu(view, 'Paste link', ITEMS, choose, dismiss, false)
            },
          }
        : null,
    ),
})

const onPaste = EditorView.domEventHandlers({
  paste(event, view) {
    const data = event.clipboardData
    const url = pastedUrl(data?.getData('text/plain') ?? '')
    const { main } = view.state.selection
    if (!url || data?.files.length || view.state.selection.ranges.length > 1 || !main.empty)
      return false
    // Only for pages a bookmark would show; YouTube and repositories have their own cards.
    if (embedOf(`[x](${destination(url)})`)?.kind !== 'bookmark') return false
    if (!canOffer(view.state, main.from)) return false
    event.preventDefault()
    const { from } = main
    view.dispatch({
      changes: { from, insert: url },
      selection: { anchor: from + url.length },
      effects: openMenu.of({ from, to: from + url.length }),
      userEvent: 'input.paste',
      scrollIntoView: true,
    })
    return true
  },
})

/** While the menu is open, ↓ moves into it and Escape keeps the link. */
const keys = Prec.high(
  keymap.of([
    {
      key: 'ArrowDown',
      run: (view) => {
        if (!view.state.field(pasted)) return false
        view.dom.querySelector<HTMLElement>('[aria-label="Paste link"] button')?.focus()
        return true
      },
    },
    {
      key: 'Escape',
      run: (view) => {
        if (!view.state.field(pasted)) return false
        view.dispatch({ effects: closeMenu.of(null) })
        return true
      },
    },
  ]),
)

export const pasteLink = [pasted, onPaste, keys]
