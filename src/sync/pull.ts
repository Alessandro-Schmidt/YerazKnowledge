// The read path (ARCHITECTURE.md §5.1): one conditional request for the head commit, the
// tree of a new head, then only the blobs whose SHA we have never seen, many per GraphQL
// request, three requests at a time.
// Structure is reported first, so the map can draw from paths and sizes before content arrives.

import { GitHubError, type GitHubClient, type TreeEntry } from '../github/client'
import { fetchBlobs, type TreeRef } from '../github/graphql'
import { parseLeaf, type ParsedLeaf } from '../model/parse'
import { buildTree, type BranchNode, type LeafNode, type TreeModel } from '../model/tree'
import type { KeyValueStore } from '../store/db'

export interface CachedListing {
  /** The commit this listing belongs to: what the next commit builds on (`expectedHeadOid`). */
  head: string
  /** ETag of the head-commit answer. */
  etag: string | null
  /** The root tree's SHA. */
  sha: string
  entries: TreeEntry[]
}

export type PullProgress =
  | { stage: 'structure'; model: TreeModel; missing: number }
  | { stage: 'content'; fetched: number; total: number }

export interface PulledTree {
  ref: TreeRef
  model: TreeModel
  /** Parsed leaves and branch texts by path; one whose content isn't here yet is absent. */
  leaves: Map<string, ParsedLeaf>
  /** True when GitHub couldn't be reached and the cached copy was used. */
  offline: boolean
  /** The commit this content belongs to. */
  head: string
  /** The listing the model was built from. */
  entries: TreeEntry[]
}

export interface PullDeps {
  client: GitHubClient
  store: KeyValueStore
  onProgress?: (progress: PullProgress) => void
}

const BATCH_BYTES = 1_000_000
const BATCH_COUNT = 100
const PARALLEL = 3

/** Groups blobs so each GraphQL response stays around 1 MB. A larger blob goes alone. */
export function planBatches<T extends { size: number }>(
  items: readonly T[],
  maxBytes = BATCH_BYTES,
  maxCount = BATCH_COUNT,
): T[][] {
  const batches: T[][] = []
  let current: T[] = []
  let bytes = 0
  for (const item of items) {
    if (current.length && (bytes + item.size > maxBytes || current.length >= maxCount)) {
      batches.push(current)
      current = []
      bytes = 0
    }
    current.push(item)
    bytes += item.size
  }
  if (current.length) batches.push(current)
  return batches
}

export async function inParallel<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>,
) {
  let next = 0
  const worker = async () => {
    while (next < items.length) await run(items[next++]!)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

/** The full listing of a commit; when GitHub truncates it, lists subtrees one at a time. */
async function listTree(
  client: GitHubClient,
  repo: string,
  commit: string,
): Promise<{ sha: string; entries: TreeEntry[] }> {
  const listing = await client.getTree(repo, commit)
  if (!listing.truncated) return listing

  const entries: TreeEntry[] = []
  const walk = async (sha: string, prefix: string): Promise<void> => {
    const sub = await client.getTree(repo, sha, { recursive: true })
    if (!sub.truncated) {
      entries.push(...sub.entries.map((e) => ({ ...e, path: prefix + e.path })))
      return
    }
    const flat = await client.getTree(repo, sha, { recursive: false })
    for (const e of flat.entries) {
      entries.push({ ...e, path: prefix + e.path })
      if (e.type === 'tree') await walk(e.sha, `${prefix}${e.path}/`)
    }
  }
  const root = await client.getTree(repo, commit, { recursive: false })
  for (const e of root.entries) {
    entries.push(e)
    if (e.type === 'tree') await walk(e.sha, `${e.path}/`)
  }
  return { sha: listing.sha, entries }
}

/** The cached listing brought up to the branch's head. */
export async function freshListing(
  client: GitHubClient,
  store: KeyValueStore,
  ref: TreeRef,
): Promise<{ listing: CachedListing; offline: boolean }> {
  const key = `tree:${ref.repo}`
  const cached = await store.get<CachedListing>(key)
  try {
    const head = await client.getHead(ref.repo, ref.branch, cached?.etag ?? null)
    if (head === 'not-modified') return { listing: cached!, offline: false }
    if (cached && head.sha === cached.head) {
      const listing = { ...cached, etag: head.etag }
      await store.set(key, listing)
      return { listing, offline: false }
    }
    const tree = await listTree(client, ref.repo, head.sha)
    const listing: CachedListing = {
      head: head.sha,
      etag: head.etag,
      sha: tree.sha,
      entries: tree.entries,
    }
    await store.set(key, listing)
    return { listing, offline: false }
  } catch (e) {
    if (!(e instanceof GitHubError) || e.kind !== 'network' || !cached) throw e
    return { listing: cached, offline: true }
  }
}

/** Text of blobs by SHA: from the cache, fetching (and caching) the rest. */
export async function blobTexts(
  client: GitHubClient,
  store: KeyValueStore,
  repo: string,
  shas: readonly string[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(shas)]
  const cached = await store.getMany<string>(wanted.map((sha) => `blob:${sha}`))
  const out = new Map<string, string>()
  const missing: string[] = []
  wanted.forEach((sha, i) =>
    cached[i] === undefined ? missing.push(sha) : out.set(sha, cached[i]!),
  )
  for (const batch of planBatches(missing.map((sha) => ({ sha, size: 0 })))) {
    const texts = await fetchBlobs(
      client,
      repo,
      batch.map((b) => b.sha),
    )
    const writes: [string, unknown][] = []
    for (const [sha, text] of texts) {
      out.set(sha, text ?? '')
      writes.push([`blob:${sha}`, text ?? ''], [`leaf:${sha}`, parseLeaf(text ?? '')])
    }
    await store.setMany(writes)
  }
  return out
}

/**
 * The model and parsed leaves of a listing. With a client, missing content is fetched;
 * without one (offline, or right after our own commit) only the cache is used.
 */
export async function fillContent(
  listing: CachedListing,
  {
    client,
    store,
    repo,
    onProgress,
  }: {
    client: GitHubClient | null
    store: KeyValueStore
    repo: string
    onProgress?: PullDeps['onProgress']
  },
): Promise<{ model: TreeModel; leaves: Map<string, ParsedLeaf> }> {
  const model = buildTree(listing.entries)
  // Leaves and branch texts (README.md): both are Markdown, parsed the same way.
  const docs = [
    ...model.leaves.map((path) => {
      const { sha, size } = model.nodes.get(path) as LeafNode
      return { path, sha, size }
    }),
    ...[...model.texts.values()].map((id) => (model.nodes.get(id) as BranchNode).text!),
  ]
  const known = await store.getMany<ParsedLeaf>(docs.map((doc) => `leaf:${doc.sha}`))
  const bySha = new Map<string, ParsedLeaf>()
  docs.forEach((doc, i) => known[i] && bySha.set(doc.sha, known[i]))

  // Unknown SHAs, once each: two paths can hold the same content.
  const missing = [
    ...new Map(docs.filter((d) => !bySha.has(d.sha)).map((d) => [d.sha, d])).values(),
  ]
  onProgress?.({ stage: 'structure', model, missing: client ? missing.length : 0 })

  if (client && missing.length) {
    let fetched = 0
    await inParallel(planBatches(missing), PARALLEL, async (batch) => {
      const texts = await fetchBlobs(
        client,
        repo,
        batch.map((leaf) => leaf.sha),
      )
      const writes: [string, unknown][] = []
      for (const [sha, text] of texts) {
        const parsed = parseLeaf(text ?? '')
        bySha.set(sha, parsed)
        writes.push([`blob:${sha}`, text ?? ''], [`leaf:${sha}`, parsed])
      }
      await store.setMany(writes)
      fetched += batch.length
      onProgress?.({ stage: 'content', fetched, total: missing.length })
    })
  }

  const leaves = new Map<string, ParsedLeaf>()
  for (const doc of docs) {
    const parsed = bySha.get(doc.sha)
    if (parsed) leaves.set(doc.path, parsed)
  }
  return { model, leaves }
}

export async function pullTree(
  ref: TreeRef,
  { client, store, onProgress }: PullDeps,
): Promise<PulledTree> {
  const { listing, offline } = await freshListing(client, store, ref)
  const { model, leaves } = await fillContent(listing, {
    client: offline ? null : client,
    store,
    repo: ref.repo,
    ...(onProgress ? { onProgress } : {}),
  })
  return { ref, model, leaves, offline, head: listing.head, entries: listing.entries }
}
