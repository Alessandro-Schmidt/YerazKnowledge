// The read and write paths of a Family kept in a folder (issue #64), shaped like GitHub's
// (pull.ts, push.ts) so the session, the overlay and the merge stay the same.
// A scan lists every file. Leaves are known by their git blob SHA, cached like GitHub's
// blobs; a leaf read once is known by its size and modification time, so reopening reads
// only what changed. Other files (images, PDFs) are never read to be listed: their id is
// their size and time, and they are read when shown.
// Saving writes the changed files. Edits from another device arrive through whatever syncs
// the folder (iCloud Drive, Dropbox, a shared drive): a leaf changed there since our edit
// started is merged three ways, as after a refused commit (§5.2). Text is never lost.
// ponytail: another device's edits show when the Family is opened again; watch the folder
// (FileSystemObserver, a desktop file watcher) if people miss them while it is open.

import type { TreeRef } from '../github/graphql'
import { MARKER, type FolderFs } from '../local/folder'
import { parseLeaf } from '../model/parse'
import { gitBlobSha } from '../model/sha'
import type { KeyValueStore } from '../store/db'
import { reconcile, type Pending } from './merge'
import { fillContent, inParallel, type CachedListing, type PulledTree, type PullDeps } from './pull'
import { remember, type Dirty, type Pushed } from './push'

/** A folder has no commits: its listing's head is this. */
export const FOLDER_HEAD = 'folder'

interface Stat {
  size: number
  modified: number
  sha: string
}

const READS = 8
const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Files whose text is kept and merged: leaves, branch texts and the marker. */
const isText = (path: string) => path.endsWith('.md') || path === MARKER

/** Every file in the folder, as a listing; new or changed texts are read and cached. */
export async function scanFolder(
  fs: FolderFs,
  store: KeyValueStore,
  repo: string,
): Promise<CachedListing> {
  const files = await fs.list()
  const known = (await store.get<Record<string, Stat>>(`stat:${repo}`)) ?? {}
  const stats: Record<string, Stat> = {}
  const writes: [string, unknown][] = []
  await inParallel(files, READS, async ({ path, size, modified }) => {
    const was = known[path]
    if (was && was.size === size && was.modified === modified) {
      stats[path] = was
    } else if (!isText(path)) {
      stats[path] = { size, modified, sha: `file:${size}:${modified}` }
    } else {
      const bytes = await fs.read(path)
      const sha = await gitBlobSha(bytes)
      const text = decoder.decode(bytes)
      stats[path] = { size: bytes.byteLength, modified, sha }
      writes.push([`blob:${sha}`, text], [`leaf:${sha}`, parseLeaf(text)])
    }
  })
  const listing: CachedListing = {
    head: FOLDER_HEAD,
    etag: null,
    sha: '',
    entries: files.map(({ path }) => ({
      path,
      type: 'blob',
      sha: stats[path]!.sha,
      size: stats[path]!.size,
    })),
  }
  writes.push([`tree:${repo}`, listing], [`stat:${repo}`, stats])
  await store.setMany(writes)
  return listing
}

export async function pullFolder(
  ref: TreeRef,
  { fs, store, onProgress }: { fs: FolderFs } & Omit<PullDeps, 'client'>,
): Promise<PulledTree> {
  const listing = await scanFolder(fs, store, ref.repo)
  const { model, leaves } = await fillContent(listing, {
    client: null,
    store,
    repo: ref.repo,
    ...(onProgress ? { onProgress } : {}),
  })
  return { ref, model, leaves, offline: false, head: listing.head, entries: listing.entries }
}

export async function pushFolder(
  ref: TreeRef,
  dirty: Dirty,
  deps: { fs: FolderFs; store: KeyValueStore; now?: () => Date },
): Promise<Pushed> {
  const { fs, store } = deps
  const listing = await scanFolder(fs, store, ref.repo)
  const onDisk = new Map(listing.entries.map((e) => [e.path, e.sha]))

  const binary = Object.entries(dirty).filter(([, f]) => f.text instanceof Uint8Array)
  const text = Object.entries(dirty).filter(([, f]) => !(f.text instanceof Uint8Array))
  const shas = text.flatMap(([path, f]) =>
    [f.base, onDisk.get(path)].filter((s): s is string => !!s),
  )
  const cached = await store.getMany<string>(shas.map((sha) => `blob:${sha}`))
  const texts = new Map(shas.map((sha, i) => [sha, cached[i] ?? null]))
  const pending: Pending[] = text.map(([path, f]) => ({
    path,
    ours: f.text as string | null,
    base: f.base ? (texts.get(f.base) ?? null) : null,
    theirs: texts.get(onDisk.get(path) ?? '') ?? null,
  }))
  const { changes, conflicts } = reconcile(pending, (deps.now ?? (() => new Date()))(), (p) =>
    onDisk.has(p),
  )
  const writes = [...changes, ...binary.map(([path, f]) => ({ path, text: f.text }))].filter(
    (c) => c.text !== null || onDisk.has(c.path),
  )
  for (const { path, text } of writes) {
    if (text === null) await fs.remove(path)
    else await fs.write(path, typeof text === 'string' ? encoder.encode(text) : text)
  }
  await remember(store, ref, listing, FOLDER_HEAD, writes)
  return { head: FOLDER_HEAD, committed: writes.map((c) => c.path), conflicts }
}
