// Formatting while writing (owner's request): Ctrl/⌘+B, I, E (code), Shift+X (strike) and K
// (a link) wrap the selection in its Markdown, or take it off again; with nothing selected
// they open a pair to type into. On any keyboard, a mark typed over a selection (`*`, `_`,
// `` ` ``, `~`, `[`, `(`, `"`) wraps it instead of replacing it: the way to format on a phone.

import { indentLess, indentMore } from '@codemirror/commands'
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

const LIST = /^(\s*)([-*+]|\d+[.)])\s+/

/**
 * Tab on a list item nests it under the item above (its text's column), Shift-Tab brings it
 * back out; each selected line moves. Null when the cursor's line isn't a list item.
 */
export function indentList(state: EditorState, dir: 1 | -1): TransactionSpec | null {
  const { from, to } = state.selection.main
  const first = state.doc.lineAt(from)
  const last = state.doc.lineAt(to)
  if (!LIST.test(first.text)) return null
  const changes = []
  for (let n = first.number; n <= last.number; n++) {
    const line = state.doc.line(n)
    const m = LIST.exec(line.text)
    if (!m) continue
    const indent = m[1]!.length
    if (dir === 1) {
      // The item above at this depth says how wide its marker is: nest under its text.
      let width = 2
      for (let p = n - 1; p >= 1; p--) {
        const text = state.doc.line(p).text
        const above = LIST.exec(text)
        if (!above) {
          if (text.trim()) break
          continue
        }
        if (above[1]!.length <= indent) {
          width = above[0].length - above[1]!.length
          break
        }
      }
      changes.push({ from: line.from, insert: ' '.repeat(width) })
    } else if (indent) {
      // Back out to the next shallower item above, or to the margin.
      let target = 0
      for (let p = n - 1; p >= 1; p--) {
        const above = LIST.exec(state.doc.line(p).text)
        if (above && above[1]!.length < indent) {
          target = above[1]!.length
          break
        }
      }
      changes.push({ from: line.from, to: line.from + indent - target })
    }
  }
  return changes.length ? { changes } : null
}

const indentListBy =
  (dir: 1 | -1, fallback: (view: EditorView) => boolean) => (view: EditorView) => {
    const spec = indentList(view.state, dir)
    if (!spec) return fallback(view)
    view.dispatch({ ...spec, scrollIntoView: true, userEvent: 'input.indent' })
    return true
  }
/** Tab: a list item nests; elsewhere the line indents (a code block). */
export const indentCommand = indentListBy(1, indentMore)
export const outdentCommand = indentListBy(-1, indentLess)

export const formatKeymap = keymap.of([
  { key: 'Tab', run: indentCommand, shift: outdentCommand },
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
