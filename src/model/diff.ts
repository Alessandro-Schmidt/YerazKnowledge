// A line diff for reading: what changed between two versions of a leaf, with long runs of
// unchanged lines folded. The LCS comes from node-diff3, already used for merging.

import { diffComm } from 'node-diff3'

export type DiffLine =
  | { kind: 'same' | 'removed' | 'added'; text: string }
  /** `count` unchanged lines, folded. */
  | { kind: 'skip'; count: number }

type Chunk = { common: string[] } | { buffer1: string[]; buffer2: string[] }

/** `before` → `after`, line by line; unchanged runs keep `context` lines around each change. */
export function lineDiff(before: string, after: string, context = 2): DiffLine[] {
  const chunks = diffComm(before.split('\n'), after.split('\n')) as Chunk[]
  const out: DiffLine[] = []
  chunks.forEach((chunk, i) => {
    if (!('common' in chunk)) {
      for (const text of chunk.buffer1) out.push({ kind: 'removed', text })
      for (const text of chunk.buffer2) out.push({ kind: 'added', text })
      return
    }
    const lines = chunk.common
    const head = i === 0 ? 0 : context
    const tail = i === chunks.length - 1 ? 0 : context
    if (lines.length <= head + tail + 1) {
      for (const text of lines) out.push({ kind: 'same', text })
      return
    }
    for (const text of lines.slice(0, head)) out.push({ kind: 'same', text })
    out.push({ kind: 'skip', count: lines.length - head - tail })
    for (const text of lines.slice(lines.length - tail)) out.push({ kind: 'same', text })
  })
  return out
}
