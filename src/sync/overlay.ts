// Uncommitted edits shown as if committed: the map, Explorer and Peek reflect them at
// once. Pure; the session applies it to the last pulled listing.

import type { TreeEntry } from '../github/client'
import { parseLeaf, type ParsedLeaf } from '../model/parse'
import type { Dirty } from './push'

const encoder = new TextEncoder()

/** The SHA a pending file carries until it is committed. */
export const localSha = (path: string) => `local:${path}`
export const isLocal = (sha: string) => sha.startsWith('local:')

export function overlay(
  entries: readonly TreeEntry[],
  leaves: ReadonlyMap<string, ParsedLeaf>,
  dirty: Dirty,
): { entries: TreeEntry[]; leaves: Map<string, ParsedLeaf> } {
  const byPath = new Map(entries.map((e) => [e.path, e]))
  const parsed = new Map(leaves)
  for (const [path, { text }] of Object.entries(dirty)) {
    if (text === null) {
      byPath.delete(path)
      parsed.delete(path)
    } else {
      byPath.set(path, {
        path,
        type: 'blob',
        sha: localSha(path),
        size: encoder.encode(text).byteLength,
      })
      parsed.set(path, parseLeaf(text))
    }
  }
  return { entries: [...byPath.values()], leaves: parsed }
}
