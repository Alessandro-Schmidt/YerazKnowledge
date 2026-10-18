import { describe, expect, it } from 'vitest'
import { lineDiff } from './diff'

const lines = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `line ${i + from}`)

describe('lineDiff', () => {
  it('is all unchanged lines, folded, for the same text', () => {
    expect(lineDiff('a\nb', 'a\nb')).toEqual([{ kind: 'skip', count: 2 }])
  })

  it('shows removed lines before added ones, with the lines around them', () => {
    expect(lineDiff('# T\n\nold\nend', '# T\n\nnew\nmore\nend')).toEqual([
      { kind: 'same', text: '# T' },
      { kind: 'same', text: '' },
      { kind: 'removed', text: 'old' },
      { kind: 'added', text: 'new' },
      { kind: 'added', text: 'more' },
      { kind: 'same', text: 'end' },
    ])
  })

  it('folds long unchanged runs, keeping two lines of context around each change', () => {
    const before = [...lines(10), 'x', ...lines(10, 11)].join('\n')
    const after = [...lines(10), 'y', ...lines(10, 11)].join('\n')
    expect(lineDiff(before, after)).toEqual([
      { kind: 'skip', count: 8 },
      { kind: 'same', text: 'line 9' },
      { kind: 'same', text: 'line 10' },
      { kind: 'removed', text: 'x' },
      { kind: 'added', text: 'y' },
      { kind: 'same', text: 'line 11' },
      { kind: 'same', text: 'line 12' },
      { kind: 'skip', count: 8 },
    ])
  })

  it('keeps a short run between two changes whole', () => {
    expect(
      lineDiff('a\n1\n2\n3\n4\nb', 'A\n1\n2\n3\n4\nB').filter((l) => l.kind === 'skip'),
    ).toEqual([])
  })

  it('handles an empty side', () => {
    expect(lineDiff('', 'a')).toEqual([
      { kind: 'removed', text: '' },
      { kind: 'added', text: 'a' },
    ])
  })
})
