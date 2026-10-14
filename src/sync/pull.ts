// The read path (ARCHITECTURE.md §5.1): one conditional tree request, then only the
// blobs whose SHA we have never seen, many per GraphQL request, three requests at a time.
// Structure is reported first, so the map can draw from paths and sizes before content arrives.

import { GitHubError, type GitHubClient, type TreeEntry } from '../github/client'
import { fetchBlobs, type TreeRef } from '../github/graphql'
import { parseLeaf, type ParsedLeaf } from '../model/parse'
import { buildTree, type LeafNode, type TreeModel } from '../model/tree'
import type { KeyValueStore } from '../store/db'

export interface CachedListing {
  sha: string
  etag: string | null
  entries: TreeEntry[]
}

export type PullProgress =
  | { stage: 'structure'; model: TreeModel; missing: number }
  | { stage: 'content'; fetched: number; total: number }

export interface PulledTree {
  ref: TreeRef
  model: TreeModel
  /** Parsed leaves by leaf path; a leaf whose content isn't here yet is absent. */
  leaves: Map<string, ParsedLeaf>
  /** True when GitHub couldn't be reached and the cached copy was used. */
  offline: boolean
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

async function inParallel<T>(items: readonly T[], limit: number, run: (item: T) => Promise<void>) {
  let next = 0
  const worker = async () => {
    while (next < items.length) await run(items[next++]!)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

/** The full listing; when GitHub truncates it, lists subtrees one at a time. */
async function listTree(
  client: GitHubClient,
  ref: TreeRef,
  etag: string | null,
): Promise<CachedListing | 'not-modified'> {
  const listing = await client.getTree(ref.repo, ref.branch, { etag })
  if (listing === 'not-modified' || !listing.truncated) return listing

  const entries: TreeEntry[] = []
  const walk = async (sha: string, prefix: string): Promise<void> => {
    const sub = await client.getTree(ref.repo, sha, { recursive: true })
    if (sub === 'not-modified') return
    if (!sub.truncated) {
      entries.push(...sub.entries.map((e) => ({ ...e, path: prefix + e.path })))
      return
    }
    const flat = await client.getTree(ref.repo, sha, { recursive: false })
    if (flat === 'not-modified') return
    for (const e of flat.entries) {
      entries.push({ ...e, path: prefix + e.path })
      if (e.type === 'tree') await walk(e.sha, `${prefix}${e.path}/`)
    }
  }
  const root = await client.getTree(ref.repo, ref.branch, { recursive: false })
  if (root === 'not-modified') return root
  for (const e of root.entries) {
    entries.push(e)
    if (e.type === 'tree') await walk(e.sha, `${e.path}/`)
  }
  return { sha: listing.sha, etag: listing.etag, entries }
}

export async function pullTree(
  ref: TreeRef,
  { client, store, onProgress }: PullDeps,
): Promise<PulledTree> {
  const treeKey = `tree:${ref.repo}`
  const cached = await store.get<CachedListing>(treeKey)

  let listing: CachedListing
  let offline = false
  try {
    const fresh = await listTree(client, ref, cached?.etag ?? null)
    if (fresh === 'not-modified') {
      listing = cached!
    } else {
      listing = fresh
      await store.set(treeKey, fresh)
    }
  } catch (e) {
    if (!(e instanceof GitHubError) || e.kind !== 'network' || !cached) throw e
    listing = cached
    offline = true
  }

  const model = buildTree(listing.entries)
  const leafNodes = model.leaves.map((id) => model.nodes.get(id) as LeafNode)
  const known = await store.getMany<ParsedLeaf>(leafNodes.map((leaf) => `leaf:${leaf.sha}`))
  const bySha = new Map<string, ParsedLeaf>()
  leafNodes.forEach((leaf, i) => known[i] && bySha.set(leaf.sha, known[i]))

  // Unknown SHAs, once each: two paths can hold the same content.
  const missing = [
    ...new Map(leafNodes.filter((l) => !bySha.has(l.sha)).map((l) => [l.sha, l])).values(),
  ]
  onProgress?.({ stage: 'structure', model, missing: offline ? 0 : missing.length })

  if (!offline && missing.length) {
    let fetched = 0
    await inParallel(planBatches(missing), PARALLEL, async (batch) => {
      const texts = await fetchBlobs(
        client,
        ref.repo,
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
  for (const leaf of leafNodes) {
    const parsed = bySha.get(leaf.sha)
    if (parsed) leaves.set(leaf.id, parsed)
  }
  return { ref, model, leaves, offline }
}
