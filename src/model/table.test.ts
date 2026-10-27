import { describe, expect, it } from 'vitest'
import {
  addColumn,
  addRow,
  deleteColumn,
  deleteRow,
  NEW_TABLE,
  parseTable,
  splitRow,
  tableText,
} from './table'

describe('parseTable: GitHub’s table syntax', () => {
  it('reads the header, each column’s alignment and the rows', () => {
    expect(parseTable('| Name | Port | Up |\n| :-- | --: | :-: |\n| Realm | 8080 | yes |')).toEqual(
      {
        header: ['Name', 'Port', 'Up'],
        align: ['left', 'right', 'center'],
        rows: [['Realm', '8080', 'yes']],
      },
    )
  })

  it('needs no outer pipes, and reads `\\|` as a pipe in the cell', () => {
    expect(parseTable('a | b\n--- | ---\n1 | 2 \\| 3')).toEqual({
      header: ['a', 'b'],
      align: [null, null],
      rows: [['1', '2 | 3']],
    })
  })

  it('fits every row to the header: extra cells go, missing ones are empty', () => {
    expect(parseTable('| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |')!.rows).toEqual([
      ['1', ''],
      ['1', '2'],
    ])
  })

  it('is no table without a delimiter row of the header’s width', () => {
    expect(parseTable('| a | b |\n| 1 | 2 |')).toBeNull()
    expect(parseTable('| a | b |\n| --- |')).toBeNull()
    expect(parseTable('| a |')).toBeNull()
  })

  it('splits an empty cell', () => {
    expect(splitRow('|  | x |')).toEqual(['', 'x'])
  })
})

describe('tableText: the table as Markdown', () => {
  const before = '|  Name  | Port |\n|:-------|-----:|\n|  Realm | 8080 |\n|  Admin | 9000 |'

  it('keeps unchanged rows exactly as written, rewriting only the edited one', () => {
    const table = parseTable(before)!
    table.rows[1]![1] = '9001'
    expect(tableText(table, before)).toBe(
      '|  Name  | Port |\n|:-------|-----:|\n|  Realm | 8080 |\n| Admin | 9001 |',
    )
  })

  it('escapes pipes and turns line breaks into spaces', () => {
    expect(tableText({ header: ['a'], align: [null], rows: [['x | y\nz']] })).toBe(
      '| a |\n| --- |\n| x \\| y z |',
    )
  })

  it('reads back what it writes', () => {
    const table = { header: ['a', 'b'], align: ['center', 'right'] as const, rows: [['1 | 2', '']] }
    expect(parseTable(tableText({ ...table, align: [...table.align] }))).toEqual({
      ...table,
      align: ['center', 'right'],
    })
  })

  it('starts a new table with a header and an empty row', () => {
    expect(NEW_TABLE).toBe('| Column 1 | Column 2 |\n| --- | --- |\n|  |  |')
  })
})

describe('rows and columns', () => {
  const table = parseTable('| a | b |\n|---|---|\n| 1 | 2 |')!

  it('adds and deletes rows', () => {
    expect(addRow(table, 0).rows).toEqual([
      ['', ''],
      ['1', '2'],
    ])
    expect(addRow(table, 1).rows).toEqual([
      ['1', '2'],
      ['', ''],
    ])
    expect(deleteRow(table, 0).rows).toEqual([])
  })

  it('adds a column with a name, deletes one, but never the last', () => {
    const wider = addColumn(table, 1)
    expect(wider.header).toEqual(['a', 'Column 3', 'b'])
    expect(wider.rows).toEqual([['1', '', '2']])
    expect(deleteColumn(wider, 1)).toEqual(table)
    expect(deleteColumn(parseTable('| a |\n|---|')!, 0)).toBeNull()
  })
})
