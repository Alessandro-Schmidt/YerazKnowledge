// Formatting while writing (owner's request): Ctrl/⌘+B, I, E (code), Shift+X (strike) and K
// (a link) wrap the selection in its Markdown, or take it off again; with nothing selected
// they open a pair to type into. On any keyboard, a mark typed over a selection (`*`, `_`,
// `` ` ``, `~`, `[`, `(`, `"`) wraps it instead of replacing it: the way to format on a phone.

import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'

/** Each selection wrapped in `open`…`close`, or unwrapped where it already is. */
export function toggleWrap(state: EditorState, open: string, close = open): TransactionSpec {
  return state.changeByRange((range) => {
    const { from, to } = range
    const inside = state.sliceDoc(from, to)
    const around =
      state.sliceDoc(from - open.length, from) === open &&
      state.sliceDoc(to, to + close.length) === close
    if (around)
      return {
        changes: [
          { from: from - open.length, to: from },
          { from: to, to: to + close.length },
        ],
        range: EditorSelection.range(from - open.length, to - open.length),
      }
    if (
      inside.startsWith(open) &&
      inside.endsWith(close) &&
      inside.length >= open.length + close.length
    )
      return {
        changes: { from, to, insert: inside.slice(open.length, inside.length - close.length) },
        range: EditorSelection.range(from, to - open.length - close.length),
      }
    return {
      changes: [
        { from, insert: open },
        { from: to, insert: close },
      ],
      range: EditorSelection.range(from + open.length, to + open.length),
    }
  })
}

/** A link: the selection as its text, the cursor where its address goes. */
export function link(state: EditorState): TransactionSpec {
  return state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to)
    const insert = `[${text}]()`
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(range.from + (text ? insert.length - 1 : 1)),
    }
  })
}

const run =
  (open: string, close = open) =>
  (view: EditorView) => {
    view.dispatch(toggleWrap(view.state, open, close))
    return true
  }

export const formatKeymap = keymap.of([
  { key: 'Mod-b', run: run('**') },
  { key: 'Mod-i', run: run('*') },
  { key: 'Mod-e', run: run('`') },
  { key: 'Mod-Shift-x', run: run('~~') },
  {
    key: 'Mod-k',
    run: (view) => {
      view.dispatch(link(view.state))
      return true
    },
  },
])

/** What a typed character wraps a selection in. */
const PAIRS: Record<string, string> = {
  '*': '*',
  _: '_',
  '`': '`',
  '~': '~',
  '[': ']',
  '(': ')',
  '"': '"',
}

/** A mark typed over a selection wraps it. */
export const wrapTyped = EditorView.inputHandler.of((view, from, to, text) => {
  const close = PAIRS[text]
  if (!close || from === to) return false
  const { main } = view.state.selection
  if (main.from !== from || main.to !== to) return false
  view.dispatch(toggleWrap(view.state, text, close))
  return true
})

export const formatting = [formatKeymap, wrapTyped]
