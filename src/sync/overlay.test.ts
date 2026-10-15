import { expect, it } from 'vitest'
import { parseLeaf } from '../model/parse'
import { isLocal, localSha, overlay } from './overlay'

it('adds, replaces and removes files, and parses the new text', () => {
  const entries = [
    { path: 'a.md', type: 'blob' as const, sha: 'sha-a', size: 5 },
    { path: 'b.md', type: 'blob' as const, sha: 'sha-b', size: 5 },
  ]
  const leaves = new Map([
    ['a.md', parseLeaf('# A\n')],
    ['b.md', parseLeaf('# B\n')],
  ])
  const out = overlay(entries, leaves, {
    'a.md': { text: '# A, edited\n', base: 'sha-a' },
    'b.md': { text: null, base: 'sha-b' },
    'c.md': { text: '# Ç\n', base: null },
  })
  expect(out.entries.map((e) => [e.path, e.sha, e.size])).toEqual([
    ['a.md', 'local:a.md', 12],
    ['c.md', 'local:c.md', 5],
  ])
  expect(out.leaves.get('a.md')!.title).toBe('A, edited')
  expect(out.leaves.has('b.md')).toBe(false)
  expect(isLocal(localSha('x.md'))).toBe(true)
  // The inputs are untouched.
  expect(entries).toHaveLength(2)
  expect(leaves.get('a.md')!.title).toBe('A')
})
