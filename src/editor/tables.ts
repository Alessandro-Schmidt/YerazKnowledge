// GitHub tables in the live preview (issue #82): drawn as a grid whose cells are written in
// place, never as Markdown unless the person asks. Each keystroke in a cell rewrites the
// table's text (model/table.ts), keeping the rows that didn't change as they were. Tab and
// Enter move between cells (past the last one, a new row); Escape or an arrow past the edge
// goes back to the text. The ⋯ menu adds and deletes rows and columns, shows the Markdown
// or deletes the table.

import { syntaxTree } from '@codemirror/language'
import { Prec, StateField, type EditorState, type Range } from '@codemirror/state'
import { Decoration, EditorView, keymap, WidgetType, type DecorationSet } from '@codemirror/view'
import { META } from '../model/parse'
import {
  addColumn,
  addRow,
  deleteColumn,
  deleteRow,
  NEW_TABLE,
  parseTable,
  tableText,
  type Table,
} from '../model/table'
import {
  beingTyped,
  deletion,
  moreButton,
  openElementMenu,
  revealSource,
  shownSource,
  sourceShown,
} from './elements'

const escape = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** A cell's inline Markdown, drawn: code, bold, italic, strikethrough and links' text. */
export function cellHtml(text: string): string {
  // Code spans first: nothing in them is Markdown.
  return text
    .split(/(`[^`]+`)/)
    .map((part, i) =>
      i % 2
        ? `<code>${escape(part.slice(1, -1))}</code>`
        : escape(part)
            .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '<span class="cm-link">$1</span>')
            .replace(
              /\*\*(?=\S)(.+?)\*\*|__(?=\S)(.+?)__/g,
              (_, a, b) => `<strong>${a ?? b}</strong>`,
            )
            .replace(/\*(?=\S)(.+?)\*|(^|\W)_(?=\S)(.+?)_(?!\w)/g, (_, a, pre, b) =>
              a === undefined ? `${pre}<em>${b}</em>` : `<em>${a}</em>`,
            )
            .replace(/~~(.+?)~~/g, '<s>$1</s>'),
    )
    .join('')
}

/** Cells take plain text only, where the browser can: no pasted formatting. */
const EDITABLE = (() => {
  if (typeof document === 'undefined') return 'true'
  const probe = document.createElement('span')
  try {
    probe.contentEditable = 'plaintext-only'
  } catch {
    return 'true'
  }
  return probe.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true'
})()

/** A cell: row -1 is the header. */
interface Place {
  row: number
  col: number
}

type TableAction =
  | 'row-above'
  | 'row-below'
  | 'col-left'
  | 'col-right'
  | 'delete-row'
  | 'delete-col'
  | 'markdown'
  | 'delete'

const grids = new WeakMap<HTMLElement, Grid>()

/** One table on screen: its cells, and the Markdown they were last written as. */
class Grid {
  readonly dom: HTMLElement
  private readonly scroll: HTMLElement
  /** The last cell written in, for the ⋯ menu's rows and columns. */
  private at: Place = { row: -1, col: 0 }

  constructor(
    private readonly view: EditorView,
    public text: string,
    private table: Table,
  ) {
    this.dom = document.createElement('div')
    this.dom.className = 'cm-table'
    this.scroll = document.createElement('div')
    this.scroll.className = 'cm-table-scroll'
    this.dom.append(
      this.scroll,
      moreButton('Table', (button) => this.menu(button)),
    )
    this.render()
    grids.set(this.dom, this)
  }

  private raw({ row, col }: Place) {
    return (row < 0 ? this.table.header[col] : this.table.rows[row]?.[col]) ?? ''
  }

  private render() {
    const table = document.createElement('table')
    const head = table.createTHead().insertRow()
    this.table.header.forEach((_, col) => head.append(this.cell('th', { row: -1, col })))
    const body = table.createTBody()
    this.table.rows.forEach((cells, row) => {
      const tr = body.insertRow()
      cells.forEach((_, col) => tr.append(this.cell('td', { row, col })))
    })
    this.scroll.replaceChildren(table)
  }

  private cell(tag: 'th' | 'td', place: Place) {
    const el = document.createElement(tag)
    el.contentEditable = EDITABLE
    el.innerHTML = cellHtml(this.raw(place))
    el.setAttribute(
      'aria-label',
      place.row < 0
        ? `Column ${place.col + 1} heading`
        : `Row ${place.row + 1}, column ${place.col + 1}`,
    )
    const align = this.table.align[place.col]
    if (align) el.style.textAlign = align
    // While written in, a cell shows its own text; drawn again when left.
    el.addEventListener('focus', () => {
      this.at = place
      const raw = this.raw(place)
      if (el.textContent !== raw) {
        el.textContent = raw
        caret(el, false)
      }
    })
    el.addEventListener('blur', () => (el.innerHTML = cellHtml(this.raw(place))))
    el.addEventListener('input', () => {
      const text = (el.textContent ?? '').replace(/\r\n|\r|\n/g, ' ')
      if (place.row < 0) this.table.header[place.col] = text
      else this.table.rows[place.row]![place.col] = text
      this.write()
    })
    el.addEventListener('paste', (e) => {
      if (EDITABLE === 'plaintext-only') return
      e.preventDefault()
      document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? '')
    })
    el.addEventListener('keydown', (e) => this.key(e, place))
    return el
  }

  /** Writes the table's Markdown in place of what it was. */
  private write() {
    const from = this.view.posAtDOM(this.dom)
    const to = from + this.text.length
    if (this.view.state.sliceDoc(from, to) !== this.text) return
    const text = tableText(this.table, this.text)
    if (text === this.text) return
    // Set first: the widget for the new text keeps this element (TableWidget.updateDOM).
    this.text = text
    this.view.dispatch({ changes: { from, to, insert: text } })
  }

  /** Puts the caret in a cell, at its end or with its text selected. */
  focus(place: Place, select = false) {
    const el = this.scroll.querySelector<HTMLElement>(
      place.row < 0
        ? `thead th:nth-child(${place.col + 1})`
        : `tbody tr:nth-child(${place.row + 1}) td:nth-child(${place.col + 1})`,
    )
    if (!el) return
    el.focus()
    caret(el, select)
  }

  /** Back to the text, before or after the table, on a line of its own. */
  private leave(after: boolean) {
    const from = this.view.posAtDOM(this.dom)
    const to = from + this.text.length
    if (after && to >= this.view.state.doc.length)
      this.view.dispatch({ changes: { from: to, insert: '\n' }, selection: { anchor: to + 1 } })
    else this.view.dispatch({ selection: { anchor: after ? to + 1 : Math.max(0, from - 1) } })
    this.view.focus()
  }

  private key(e: KeyboardEvent, { row, col }: Place) {
    const last = this.table.rows.length - 1
    const width = this.table.header.length
    const below = () => {
      if (row === last) this.change(addRow(this.table, last + 1))
      this.focus({ row: row + 1, col })
    }
    if (e.key === 'Tab') {
      const next = row * width + col + (e.shiftKey ? -1 : 1)
      if (next < -width) this.leave(false)
      else if (next > last * width + width - 1) {
        this.change(addRow(this.table, last + 1))
        this.focus({ row: last + 1, col: 0 })
      } else this.focus({ row: Math.floor(next / width), col: ((next % width) + width) % width })
    } else if (e.key === 'Enter') below()
    else if (e.key === 'Escape') this.leave(true)
    else if (e.key === 'ArrowUp') {
      if (row < 0) this.leave(false)
      else this.focus({ row: row - 1, col })
    } else if (e.key === 'ArrowDown') {
      if (row === last) this.leave(true)
      else this.focus({ row: row + 1, col })
    } else return
    e.preventDefault()
  }

  /** A change of rows or columns: drawn again, then written. */
  private change(next: Table) {
    this.table = next
    this.render()
    this.write()
  }

  private menu(button: HTMLElement) {
    const { row } = this.at
    const items: { kind: TableAction; label: string }[] = [
      ...(row >= 0 ? [{ kind: 'row-above' as const, label: 'Add row above' }] : []),
      { kind: 'row-below', label: 'Add row below' },
      { kind: 'col-left', label: 'Add column left' },
      { kind: 'col-right', label: 'Add column right' },
      ...(row >= 0 ? [{ kind: 'delete-row' as const, label: 'Delete row' }] : []),
      ...(this.table.header.length > 1
        ? [{ kind: 'delete-col' as const, label: 'Delete column' }]
        : []),
      { kind: 'markdown', label: 'Show Markdown' },
      { kind: 'delete', label: 'Delete table' },
    ]
    const from = this.view.posAtDOM(this.dom)
    openElementMenu(this.view, from, 'Table', items, (kind) => this.act(kind), button)
  }

  private act(kind: TableAction) {
    const { row, col } = this.at
    const from = this.view.posAtDOM(this.dom)
    const to = from + this.text.length
    if (kind === 'markdown') return revealSource(this.view, from, to, to)
    if (kind === 'delete') {
      this.view.dispatch({ changes: deletion(this.view.state, from, to) })
      return this.view.focus()
    }
    if (kind === 'row-above' || kind === 'row-below') {
      const at = kind === 'row-above' ? row : row + 1
      this.change(addRow(this.table, at))
      this.focus({ row: at, col })
    } else if (kind === 'col-left' || kind === 'col-right') {
      const at = kind === 'col-left' ? col : col + 1
      this.change(addColumn(this.table, at))
      this.focus({ row, col: at }, true)
    } else if (kind === 'delete-row') {
      this.change(deleteRow(this.table, row))
      this.focus({ row: Math.min(row, this.table.rows.length - 1), col })
    } else {
      const next = deleteColumn(this.table, col)
      if (!next) return
      this.change(next)
      this.focus({ row, col: Math.min(col, next.header.length - 1) })
    }
  }
}

/** Moves the caret to the end of `el`, or selects all of it. */
function caret(el: HTMLElement, select: boolean) {
  const selection = el.ownerDocument.getSelection()
  if (!selection) return
  const range = el.ownerDocument.createRange()
  range.selectNodeContents(el)
  if (!select) range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

class TableWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly table: Table,
  ) {
    super()
  }
  eq(other: TableWidget) {
    return other.text === this.text
  }
  toDOM(view: EditorView) {
    return new Grid(view, this.text, structuredClone(this.table)).dom
  }
  /** The grid's own edits keep it, with the caret where it is; anything else redraws it. */
  updateDOM(dom: HTMLElement) {
    return grids.get(dom)?.text === this.text
  }
  ignoreEvent() {
    return true
  }
}

/** Where the selection has an end strictly inside `from`…`to`. */
const inside = (state: EditorState, from: number, to: number) =>
  state.selection.ranges.some((r) => (r.from > from && r.from < to) || (r.to > from && r.to < to))

/**
 * Tables at the top level, as grids: each spans whole lines. A table being typed by hand
 * (on the line being typed, or with the cursor inside its text) or shown as Markdown on
 * request stays text.
 */
export function tableBlocks(state: EditorState): DecorationSet {
  const out: Range<Decoration>[] = []
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === 'Document') return true
      if (node.name !== 'Table') return false
      const from = state.doc.lineAt(node.from).from
      const to = state.doc.lineAt(node.to).to
      const text = state.sliceDoc(from, to)
      const table = parseTable(text)
      if (
        table &&
        !inside(state, from, to) &&
        !beingTyped(state, from, to) &&
        !sourceShown(state, from, to)
      )
        out.push(
          Decoration.replace({ widget: new TableWidget(text, table), block: true }).range(from, to),
        )
      return false
    },
  })
  return Decoration.set(out)
}

const tables = StateField.define<DecorationSet>({
  create: tableBlocks,
  update: (blocks, tr) =>
    tr.docChanged ||
    tr.selection ||
    syntaxTree(tr.startState) !== syntaxTree(tr.state) ||
    tr.startState.field(shownSource, false) !== tr.state.field(shownSource, false)
      ? tableBlocks(tr.state)
      : blocks,
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
})

/** The drawn table that starts or ends at `pos`. */
function tableAt(state: EditorState, pos: number) {
  let found: { from: number; to: number } | null = null
  state.field(tables, false)?.between(pos, pos, (from, to) => {
    if (from === pos || to === pos) found = { from, to }
  })
  return found as { from: number; to: number } | null
}

/** Typing right before or after a drawn table goes on a line of its own, not into its rows. */
const typeBeside = EditorView.inputHandler.of((view, from, to, text) => {
  const table = from === to ? tableAt(view.state, from) : null
  if (!table) return false
  const after = table.to === from
  view.dispatch({
    changes: { from, insert: after ? `\n${text}` : `${text}\n` },
    selection: { anchor: from + text.length + (after ? 1 : 0) },
  })
  return true
})

/**
 * Backspace or Delete against a drawn table never takes it, or joins a line to its rows: an
 * empty line beside it goes, anything else stays. (Its ⋯ menu deletes it.)
 */
function keepTable(view: EditorView, forward: boolean): boolean {
  const { state } = view
  const { main } = state.selection
  if (!main.empty) return false
  const pos = main.head
  if (tableAt(state, pos)) return true
  const line = state.doc.lineAt(pos)
  if (pos !== (forward ? line.to : line.from)) return false
  const beside = forward ? line.to + 1 : line.from - 1
  if (beside < 0 || beside > state.doc.length || !tableAt(state, beside)) return false
  if (!line.text.trim())
    view.dispatch({
      changes: forward
        ? { from: line.from, to: line.to + 1 }
        : { from: line.from - 1, to: line.to },
    })
  return true
}

/** Inserts a new table at the cursor, on lines of its own, and puts the caret in its first cell. */
export function insertTable(view: EditorView) {
  const { state } = view
  let line = state.doc.lineAt(state.selection.main.head)
  // Not in the title or the metadata line below it.
  if (line.number === 1 && state.doc.lines > 1 && META.test(state.doc.line(2).text))
    line = state.doc.line(2)
  // On an empty line, the table takes it; otherwise it goes below, after a blank line.
  const below = !!line.text.trim() || line.number <= 2
  const at = below ? line.to : line.from
  const previous = line.number > 1 ? state.doc.line(line.number - 1).text : ''
  const before = below ? '\n\n' : previous.trim() ? '\n' : ''
  const next = line.number < state.doc.lines ? state.doc.line(line.number + 1).text : ''
  // A line right below a table would be one of its rows: a blank line keeps them apart.
  const after = below && next.trim() ? '\n' : ''
  const insert = `${before}${NEW_TABLE}\n${after}`
  const from = at + before.length
  view.dispatch({
    changes: { from: at, insert },
    selection: { anchor: from + NEW_TABLE.length + 1 },
    scrollIntoView: true,
  })
  requestAnimationFrame(() => {
    for (const el of view.contentDOM.querySelectorAll<HTMLElement>('.cm-table'))
      if (view.posAtDOM(el) === from) grids.get(el)?.focus({ row: -1, col: 0 }, true)
  })
}

export const tableEditing = [
  tables,
  typeBeside,
  Prec.high(
    keymap.of([
      { key: 'Backspace', run: (v) => keepTable(v, false) },
      { key: 'Delete', run: (v) => keepTable(v, true) },
    ]),
  ),
]
