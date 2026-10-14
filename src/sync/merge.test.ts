import { describe, expect, it } from 'vitest'
import { conflictPath, mergeText, reconcile } from './merge'

const base = '# Keycloak\n\nOne.\n\nTwo.\n\nThree.\n'

describe('mergeText', () => {
  it('merges edits to different lines', () => {
    const ours = base.replace('One.', 'One, edited here.')
    const theirs = base.replace('Three.', 'Three, edited on the phone.')
    expect(mergeText(base, ours, theirs)).toBe(
      '# Keycloak\n\nOne, edited here.\n\nTwo.\n\nThree, edited on the phone.\n',
    )
  })

  it('reports a conflict when both edit the same line', () => {
    expect(
      mergeText(base, base.replace('Two.', 'Two A.'), base.replace('Two.', 'Two B.')),
    ).toBeNull()
  })

  it('treats the same edit on both sides as no conflict', () => {
    const both = base.replace('Two.', 'Two, same.')
    expect(mergeText(base, both, both)).toBe(both)
  })

  it('keeps CRLF line endings byte for byte', () => {
    const crlf = base.replace(/\n/g, '\r\n')
    const ours = crlf.replace('One.', 'One!')
    const theirs = crlf.replace('Three.', 'Three!')
    expect(mergeText(crlf, ours, theirs)).toBe(
      crlf.replace('One.', 'One!').replace('Three.', 'Three!'),
    )
  })

  it('merges from an empty base', () => {
    expect(mergeText('', 'a\n', 'a\n')).toBe('a\n')
    expect(mergeText('', 'a\n', 'b\n')).toBeNull()
  })
})

describe('reconcile', () => {
  const date = new Date('2026-10-15T10:00:00Z')
  const none = () => false

  it('keeps our change when GitHub still has the base', () => {
    expect(
      reconcile([{ path: 'a.md', ours: 'new', base: 'old', theirs: 'old' }], date, none).changes,
    ).toEqual([{ path: 'a.md', text: 'new' }])
    expect(
      reconcile([{ path: 'a.md', ours: null, base: 'old', theirs: 'old' }], date, none).changes,
    ).toEqual([{ path: 'a.md', text: null }])
  })

  it('commits a clean merge, and nothing when the merge equals what GitHub has', () => {
    const ours = base.replace('One.', 'One!')
    const theirs = base.replace('Three.', 'Three!')
    const r = reconcile([{ path: 'k.md', ours, base, theirs }], date, none)
    expect(r.changes).toEqual([
      { path: 'k.md', text: base.replace('One.', 'One!').replace('Three.', 'Three!') },
    ])
    expect(r.conflicts).toEqual([])
    expect(reconcile([{ path: 'k.md', ours: theirs, base, theirs }], date, none).changes).toEqual(
      [],
    )
  })

  it('saves ours beside theirs on a real conflict', () => {
    const r = reconcile(
      [
        {
          path: 'identity/k.md',
          ours: base.replace('Two.', 'A'),
          base,
          theirs: base.replace('Two.', 'B'),
        },
      ],
      date,
      (p) => p === 'identity/k.conflict-2026-10-15.md',
    )
    expect(r.conflicts).toEqual(['identity/k.conflict-2026-10-15-2.md'])
    expect(r.changes).toEqual([
      { path: 'identity/k.conflict-2026-10-15-2.md', text: base.replace('Two.', 'A') },
    ])
  })

  it('keeps their edits over our deletion, and our edits over their deletion', () => {
    expect(
      reconcile([{ path: 'a.md', ours: null, base: 'old', theirs: 'changed' }], date, none).changes,
    ).toEqual([])
    expect(
      reconcile([{ path: 'a.md', ours: 'mine', base: 'old', theirs: null }], date, none).changes,
    ).toEqual([{ path: 'a.md', text: 'mine' }])
  })

  it('treats two new files at the same path like a merge from empty', () => {
    const r = reconcile(
      [{ path: 'n.md', ours: '# Mine\n', base: null, theirs: '# Theirs\n' }],
      date,
      none,
    )
    expect(r.conflicts).toEqual(['n.conflict-2026-10-15.md'])
  })
})

describe('conflictPath', () => {
  it('names the copy after the file and the day', () => {
    expect(
      conflictPath('AI Agents/prompting.md', new Date('2026-01-02T23:00:00Z'), () => false),
    ).toBe('AI Agents/prompting.conflict-2026-01-02.md')
  })
})
