// The write path (ARCHITECTURE.md §5.2): every changed file in one createCommitOnBranch,
// on top of the commit the edits were made on. If another device committed first, GitHub
// refuses; we pull, three-way merge, and commit again. After a commit each file's blob
// SHA is computed locally, so the next open downloads nothing.

import { GitHubError, type GitHubClient, type TreeEntry } from '../github/client'
import { createCommit, type TreeRef } from '../github/graphql'
import { parseLeaf } from '../model/parse'
import { gitBlobSha } from '../model/sha'
import type { KeyValueStore } from '../store/db'
import { reconcile, type Pending } from './merge'
import { blobTexts, freshListing, type CachedListing } from './pull'
import type { Content, FileChange } from './structure'

/** A file changed on this device and not committed yet. */
export interface DirtyFile {
  /** The new text, or bytes for an image; null when the file was deleted. */
  text: Content | null
  /** Blob SHA of the version the edit started from; null for a new file. */
  base: string | null
}

export type Dirty = Record<string, DirtyFile>

export interface Pushed {
  head: string
  /** Paths written or deleted in the commit. */
  committed: string[]
  /** Copies saved beside files that both devices changed (`name.conflict-YYYY-MM-DD.md`). */
  conflicts: string[]
}

const ATTEMPTS = 3
const encoder = new TextEncoder()

export const byteLength = (content: Content) =>
  typeof content === 'string' ? encoder.encode(content).byteLength : content.byteLength

export async function pushTree(
  ref: TreeRef,
  dirty: Dirty,
  deps: { client: GitHubClient; store: KeyValueStore; now?: () => Date },
): Promise<Pushed> {
  const { client, store } = deps
  const now = deps.now ?? (() => new Date())
  let listing =
    (await store.get<CachedListing>(`tree:${ref.repo}`)) ??
    (await freshListing(client, store, ref)).listing
  let changes: FileChange[] = Object.entries(dirty).map(([path, f]) => ({ path, text: f.text }))
  let conflicts: string[] = []

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const exists = new Set(listing.entries.filter((e) => e.type === 'blob').map((e) => e.path))
    // A file made and deleted on this device never reached GitHub: nothing to delete.
    changes = changes.filter((c) => c.text !== null || exists.has(c.path))
    if (changes.length === 0) return { head: listing.head, committed: [], conflicts }
    try {
      const head = await createCommit(client, ref, listing.head, changes, describe(changes, exists))
      await remember(store, ref, listing, head, changes)
      return { head, committed: changes.map((c) => c.path), conflicts }
    } catch (e) {
      if (!(e instanceof GitHubError) || e.kind !== 'stale') throw e
      listing = (await freshListing(client, store, ref)).listing
      ;({ changes, conflicts } = await merge(client, store, ref, dirty, listing, now()))
    }
  }
  throw new GitHubError(
    'stale',
    'GitHub kept changing while saving. Your edits are kept on this device.',
  )
}

/** Our changes reconciled with what is on GitHub now, always from the original edits. */
async function merge(
  client: GitHubClient,
  store: KeyValueStore,
  ref: TreeRef,
  dirty: Dirty,
  listing: CachedListing,
  date: Date,
) {
  const remote = new Map(
    listing.entries.filter((e) => e.type === 'blob').map((e) => [e.path, e.sha]),
  )
  // Images aren't merged: their names are unique (a date and a slug), so they go in as they are.
  const binary = Object.entries(dirty).filter(([, f]) => f.text instanceof Uint8Array)
  const text = Object.entries(dirty).filter(([, f]) => !(f.text instanceof Uint8Array))
  const shas = text.flatMap(([path, f]) =>
    [f.base, remote.get(path)].filter((s): s is string => !!s),
  )
  const texts = await blobTexts(client, store, ref.repo, shas)
  const pending: Pending[] = text.map(([path, f]) => {
    const theirs = remote.get(path)
    return {
      path,
      ours: f.text as string | null,
      base: f.base ? (texts.get(f.base) ?? null) : null,
      theirs: theirs ? (texts.get(theirs) ?? null) : null,
    }
  })
  const reconciled = reconcile(pending, date, (p) => remote.has(p))
  return {
    ...reconciled,
    changes: [...reconciled.changes, ...binary.map(([path, f]) => ({ path, text: f.text }))],
  }
}

/** Caches what was committed: blobs by SHA, and the listing at the new head. */
export async function remember(
  store: KeyValueStore,
  ref: TreeRef,
  listing: CachedListing,
  head: string,
  changes: FileChange[],
) {
  const entries = new Map(listing.entries.map((e) => [e.path, e]))
  const writes: [string, unknown][] = []
  for (const { path, text } of changes) {
    if (text === null) {
      entries.delete(path)
      continue
    }
    const sha = await gitBlobSha(text)
    entries.set(path, { path, type: 'blob', sha, size: byteLength(text) } satisfies TreeEntry)
    if (typeof text === 'string')
      writes.push([`blob:${sha}`, text], [`leaf:${sha}`, parseLeaf(text)])
    else writes.push([`asset:${sha}`, text])
  }
  const next: CachedListing = { ...listing, head, etag: null, entries: [...entries.values()] }
  writes.push([`tree:${ref.repo}`, next])
  await store.setMany(writes)
}

/** The commit message: what a person would write. */
export function describe(
  changes: readonly FileChange[],
  existing: ReadonlySet<string>,
): { headline: string; body?: string } {
  const title = (c: FileChange) =>
    (typeof c.text === 'string' && parseLeaf(c.text).title) ||
    c.path.replace(/^.*\//, '').replace(/\.md$/, '')
  const added = changes.filter((c) => c.text !== null && !existing.has(c.path))
  const deleted = changes.filter((c) => c.text === null)
  const updated = changes.filter((c) => c.text !== null && existing.has(c.path))
  if (changes.length === 1) {
    const [c] = changes as [FileChange]
    return {
      headline: `${c.text === null ? 'Delete' : existing.has(c.path) ? 'Update' : 'Add'} ${title(c)}`,
    }
  }
  const lines = [
    ...added.map((c) => `Add ${c.path}`),
    ...updated.map((c) => `Update ${c.path}`),
    ...deleted.map((c) => `Delete ${c.path}`),
  ]
  return { headline: `Update ${changes.length} files`, body: lines.join('\n') }
}
