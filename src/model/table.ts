// GitHub's tables (ARCHITECTURE.md §7), edited as a grid in the live preview: a header row,
// a delimiter row that sets each column's alignment (`:--`, `:-:`, `--:`), then rows.
// A cell is one line of inline Markdown; a `|` in it is written `\|`. Writing a table back
// keeps every row that didn't change exactly as it was, so a commit shows only the edit. Pure.

export type Align = 'left' | 'center' | 'right' | null

export interface Table {
  header: string[]
  align: Align[]
  rows: string[][]
}

/** A row's cells, as typed (`\|` read as `|`), without the outer pipes. */
export function splitRow(line: string): string[] {
  let text = line.trim()
  if (text.startsWith('|')) text = text.slice(1)
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1)
  const cells: string[] = []
  let cell = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '\\' && text[i + 1] === '|') {
      cell += '|'
      i++
    } else if (ch === '|') {
      cells.push(cell.trim())
      cell = ''
    } else cell += ch
  }
  cells.push(cell.trim())
  return cells
}

const DELIMITER = /^\s*:?-+:?\s*$/

function alignOf(cell: string): Align | undefined {
  if (!DELIMITER.test(cell)) return undefined
  const c = cell.trim()
  const left = c.startsWith(':')
  const right = c.endsWith(':')
  return left && right ? 'center' : right ? 'right' : left ? 'left' : null
}

/** The table a block's text holds, or null when its second line isn't a delimiter row. */
export function parseTable(text: string): Table | null {
  const lines = text.split(/\r\n|\r|\n/)
  if (lines.length < 2) return null
  const header = splitRow(lines[0]!)
  const align = splitRow(lines[1]!).map(alignOf)
  if (align.length !== header.length || align.some((a) => a === undefined)) return null
  // Rows have as many cells as the header: extra ones are dropped, missing ones empty.
  const fit = (cells: string[]) => header.map((_, i) => cells[i] ?? '')
  return {
    header,
    align: align as Align[],
    rows: lines.slice(2).map((l) => fit(splitRow(l))),
  }
}

/** One row as Markdown: `| a | b |`, with `|` escaped and line breaks made spaces. */
export const rowLine = (cells: string[]) =>
  `| ${cells.map((c) => c.replace(/\r\n|\r|\n/g, ' ').replace(/\|/g, '\\|')).join(' | ')} |`

const delimiterLine = (align: Align[]) =>
  `| ${align
    .map((a) => (a === 'center' ? ':-:' : a === 'right' ? '--:' : a === 'left' ? ':--' : '---'))
    .join(' | ')} |`

const same = (a: string[], b: string[]) => a.length === b.length && a.every((c, i) => c === b[i])

/**
 * The table as Markdown. With `before` (the text it was read from), lines whose cells are
 * unchanged stay as they were written, padding and all.
 */
export function tableText(table: Table, before?: string): string {
  const old = before?.split(/\r\n|\r|\n/) ?? []
  const was = before ? parseTable(before) : null
  const keep = (line: string | undefined, then: string[] | undefined, now: string[]) =>
    line !== undefined && then && same(then, now) ? line : rowLine(now)
  const sameAlign =
    was &&
    was.align.length === table.align.length &&
    was.align.every((a, i) => a === table.align[i])
  return [
    keep(old[0], was?.header, table.header),
    sameAlign && old[1] !== undefined ? old[1] : delimiterLine(table.align),
    ...table.rows.map((row, i) => keep(old[i + 2], was?.rows[i], row)),
  ].join('\n')
}

/** A new table to start from: two columns, a header and one empty row. */
export const NEW_TABLE = tableText({
  header: ['Column 1', 'Column 2'],
  align: [null, null],
  rows: [['', '']],
})

/** Adds an empty row at `at` (rows after the header count from 0). */
export const addRow = (t: Table, at: number): Table => ({
  ...t,
  rows: [...t.rows.slice(0, at), t.header.map(() => ''), ...t.rows.slice(at)],
})

/** Removes row `at`; a table keeps its header. */
export const deleteRow = (t: Table, at: number): Table => ({
  ...t,
  rows: t.rows.filter((_, i) => i !== at),
})

/** Adds an empty column at `at`, named after its place. */
export const addColumn = (t: Table, at: number): Table => {
  const put = <T>(list: T[], value: T) => [...list.slice(0, at), value, ...list.slice(at)]
  return {
    header: put(t.header, `Column ${t.header.length + 1}`),
    align: put(t.align, null),
    rows: t.rows.map((r) => put(r, '')),
  }
}

/** Removes column `at`; null when it is the only one, since a table needs a column. */
export const deleteColumn = (t: Table, at: number): Table | null => {
  if (t.header.length < 2) return null
  const drop = <T>(list: T[]) => list.filter((_, i) => i !== at)
  return { header: drop(t.header), align: drop(t.align), rows: t.rows.map(drop) }
}
