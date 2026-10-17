// Line 2, the leaf's metadata (ARCHITECTURE.md §4), in the live preview: hidden, since the
// cover and colours above the text show it, and kept whole on line 2 while the text around
// it is edited. The header's controls rewrite it with `filter: false`; Undo may too.

import {
  EditorState,
  StateField,
  Transaction,
  type ChangeSpec,
  type TransactionSpec,
} from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import { META } from '../model/parse'

/** From the end of line 1 to the end of line 2, when line 2 is the metadata comment. */
function metaRange(state: EditorState): { from: number; to: number } | null {
  if (state.doc.lines < 2) return null
  const line = state.doc.line(2)
  return META.test(line.text) ? { from: line.from - 1, to: line.to } : null
}

/** That range and the line break after it: the cursor rests on either side, never inside. */
function guarded(state: EditorState): { from: number; to: number } | null {
  const range = metaRange(state)
  return range && { from: range.from, to: Math.min(range.to + 1, state.doc.length) }
}

const hide = Decoration.replace({})
const decorate = (range: { from: number; to: number } | null): DecorationSet =>
  range ? Decoration.set(hide.range(range.from, range.to)) : Decoration.none

// Hiding a line break changes the editor's lines, which only a state field may do.
const hidden = StateField.define<DecorationSet>({
  create: (state) => decorate(metaRange(state)),
  update: (value, tr) => (tr.docChanged ? decorate(metaRange(tr.state)) : value),
  provide: (field) => EditorView.decorations.from(field),
})

const history = (tr: Transaction) => tr.isUserEvent('undo') || tr.isUserEvent('redo')

/** Edits inside the guarded range are dropped; around it, they apply. */
const keep = EditorState.changeFilter.of((tr) => {
  const range = history(tr) ? null : guarded(tr.startState)
  return range ? [range.from, range.to] : true
})

/**
 * Text typed or pasted at the end of the title goes there up to its first line break; from
 * that break on, it goes below the metadata. So Enter after the title starts line 3.
 */
const below = EditorState.transactionFilter.of((tr): Transaction | TransactionSpec => {
  const range = tr.docChanged && !history(tr) ? metaRange(tr.startState) : null
  if (!range) return tr
  const changes: ChangeSpec[] = []
  let cursor: number | null = null
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const text = inserted.toString()
    const split = text.search(/\n/)
    if (toA === range.from && split >= 0) {
      changes.push({ from: fromA, to: toA, insert: text.slice(0, split) })
      changes.push({ from: range.to, insert: text.slice(split) })
      cursor = range.to
    } else if (fromA === range.to && split !== 0) {
      // Only at the end of the text, where the cursor may rest after the metadata.
      const head = split < 0 ? text : text.slice(0, split)
      changes.push({ from: range.from, insert: head })
      changes.push({ from: fromA, to: toA, insert: text.slice(head.length) })
      cursor = split < 0 ? range.from : range.to
    } else changes.push({ from: fromA, to: toA, insert: text })
  })
  if (cursor === null) return tr
  const set = tr.startState.changes(changes)
  return {
    changes: set,
    selection: { anchor: set.mapPos(cursor, 1) },
    userEvent: tr.annotation(Transaction.userEvent),
    scrollIntoView: tr.scrollIntoView,
  }
})

/** The cursor skips over the metadata line. */
const atomic = EditorView.atomicRanges.of((view) => decorate(guarded(view.state)))

export const metaLine = [hidden, keep, below, atomic]
