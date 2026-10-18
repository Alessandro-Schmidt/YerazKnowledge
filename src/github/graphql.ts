// The GraphQL operations Yeraz uses: blobs by SHA, finding Trees (every repository with
// a `.yeraz.json` at the root, ARCHITECTURE.md §5.3), a file's history (§5.4), and
// createCommitOnBranch (§5.2).
// Creating a repository is the one REST write.

import { GitHubError, type GitHubClient } from './client'

export interface TreeRef {
  owner: string
  name: string
  /** `owner/name` */
  repo: string
  branch: string
  isPrivate: boolean
  /** From `.yeraz.json`, or the repository name. */
  title: string
  /** A named colour from `.yeraz.json`, or null for the theme accent. */
  color: string | null
}

const SHA = /^[0-9a-f]{40}$/

/** Blob texts by SHA, in one request. Binary or missing blobs come back as null. */
export async function fetchBlobs(
  client: GitHubClient,
  repo: string,
  shas: readonly string[],
): Promise<Map<string, string | null>> {
  const [owner, name] = repo.split('/')
  const fields = shas.map((sha, i) => {
    if (!SHA.test(sha)) throw new Error(`Not a blob SHA: ${sha}`)
    return `b${i}: object(oid: "${sha}") { ... on Blob { text } }`
  })
  const { data } = await client.graphql<{
    repository: Record<string, { text: string | null } | null> | null
  }>(
    `query Blobs($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields.join(' ')} } }`,
    { owner, name },
  )
  if (!data.repository) throw new GitHubError('not-found', `Repository ${repo} not found`)
  return new Map(shas.map((sha, i) => [sha, data.repository![`b${i}`]?.text ?? null]))
}

/** A past version of a file: the commit that wrote it. */
export interface Version {
  commit: string
  /** ISO date. */
  date: string
  message: string
  author: string
  /** Its blob SHA; null in the commit that deleted the file. */
  blob: string | null
}

export const HISTORY_PAGE = 30

/**
 * The commits that changed `path`, newest first, from commit `rev` (a SHA, so the answer
 * never changes and can be kept). One request per page. Like `git log` without
 * `--follow`, it stops where the file got this path.
 */
export async function fetchHistory(
  client: GitHubClient,
  repo: string,
  rev: string,
  path: string,
  after: string | null = null,
): Promise<{ versions: Version[]; next: string | null }> {
  const [owner, name] = repo.split('/')
  const { data } = await client.graphql<{
    repository: {
      object: {
        history: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null }
          nodes: {
            oid: string
            committedDate: string
            messageHeadline: string
            author: { name: string | null; user: { login: string } | null } | null
            file: { oid: string } | null
          }[]
        }
      } | null
    } | null
  }>(
    `query History($owner: String!, $name: String!, $rev: String!, $path: String!, $after: String) {
      repository(owner: $owner, name: $name) { object(expression: $rev) { ... on Commit {
        history(path: $path, first: ${HISTORY_PAGE}, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { oid committedDate messageHeadline author { name user { login } } file(path: $path) { oid } } } } } } }`,
    { owner, name, rev, path, after },
  )
  const history = data.repository?.object?.history
  if (!history) throw new GitHubError('not-found', `No history for ${path}`)
  return {
    versions: history.nodes.map((n) => ({
      commit: n.oid,
      date: n.committedDate,
      message: n.messageHeadline,
      author: n.author?.user?.login ?? n.author?.name ?? 'Unknown',
      blob: n.file?.oid ?? null,
    })),
    next: history.pageInfo.hasNextPage ? history.pageInfo.endCursor : null,
  }
}

const TREE_FIELDS = `
  owner { login } name isPrivate
  defaultBranchRef { name }
  marker: object(expression: "HEAD:.yeraz.json") { ... on Blob { text } }`

interface RepoNode {
  owner: { login: string }
  name: string
  isPrivate: boolean
  defaultBranchRef: { name: string } | null
  marker: { text: string | null } | null
}

function toTreeRef(node: RepoNode): TreeRef | null {
  if (!node.marker || !node.defaultBranchRef) return null
  let marker: { name?: unknown; color?: unknown } = {}
  try {
    const parsed: unknown = JSON.parse(node.marker.text ?? '')
    if (parsed && typeof parsed === 'object') marker = parsed
  } catch {
    // A malformed marker still marks a Tree; it just has no name or colour.
  }
  return {
    owner: node.owner.login,
    name: node.name,
    repo: `${node.owner.login}/${node.name}`,
    branch: node.defaultBranchRef.name,
    isPrivate: node.isPrivate,
    title: typeof marker.name === 'string' && marker.name.trim() ? marker.name.trim() : node.name,
    color: typeof marker.color === 'string' ? marker.color : null,
  }
}

interface DiscoverData {
  viewer: {
    repositories: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
      nodes: RepoNode[]
    }
  }
}

/** Every Tree the token can see, most recently updated first. */
export async function discoverTrees(client: GitHubClient): Promise<TreeRef[]> {
  const trees: TreeRef[] = []
  let after: string | null = null
  do {
    const result: { data: DiscoverData } = await client.graphql<DiscoverData>(
      `query Discover($after: String) { viewer { repositories(first: 100, after: $after,
        ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], orderBy: { field: UPDATED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor } nodes { ${TREE_FIELDS} } } } }`,
      { after },
    )
    const page = result.data.viewer.repositories
    for (const node of page.nodes) {
      const tree = toTreeRef(node)
      if (tree) trees.push(tree)
    }
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
  } while (after)
  return trees
}

/** One repository by `owner/name`: its Tree, or null when it has no `.yeraz.json`. */
export async function lookupTree(client: GitHubClient, repo: string): Promise<TreeRef | null> {
  const [owner, name] = repo.split('/')
  const { data } = await client.graphql<{ repository: RepoNode | null }>(
    `query Lookup($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${TREE_FIELDS} } }`,
    { owner, name },
  )
  if (!data.repository) throw new GitHubError('not-found', `Repository ${repo} not found`)
  return toTreeRef(data.repository)
}

export interface FileWrite {
  path: string
  /** UTF-8 text, or bytes (images); null deletes the file. */
  text: string | Uint8Array | null
}

const encoder = new TextEncoder()

/** Text (as UTF-8) or bytes as base64, in chunks so big files don't overflow the call stack. */
export function toBase64(content: string | Uint8Array): string {
  const bytes = typeof content === 'string' ? encoder.encode(content) : content
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/**
 * One commit with every change (ARCHITECTURE.md §5.2). `expectedHead` is the commit the
 * changes were made on; if the branch has moved, GitHub refuses with STALE_DATA and this
 * throws a GitHubError of kind 'stale' instead of overwriting the other commit.
 */
export async function createCommit(
  client: GitHubClient,
  tree: TreeRef,
  expectedHead: string,
  changes: readonly FileWrite[],
  message: { headline: string; body?: string },
): Promise<string> {
  const additions = changes
    .filter((c) => c.text !== null)
    .map((c) => ({ path: c.path, contents: toBase64(c.text!) }))
  const deletions = changes.filter((c) => c.text === null).map((c) => ({ path: c.path }))
  const { data, errors } = await client.graphql<{
    createCommitOnBranch: { commit: { oid: string } } | null
  }>(
    `mutation Commit($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }`,
    {
      input: {
        branch: { repositoryNameWithOwner: tree.repo, branchName: tree.branch },
        expectedHeadOid: expectedHead,
        message,
        fileChanges: { additions, deletions },
      },
    },
  )
  const oid = data.createCommitOnBranch?.commit.oid
  if (oid) return oid
  const stale = errors.find((e) => e.type === 'STALE_DATA')
  throw new GitHubError(
    stale ? 'stale' : 'graphql',
    (stale ?? errors[0])?.message ?? 'The commit was refused',
  )
}

/**
 * A new private Tree (development-plan.md M2 step 5). GitHub needs a first commit before
 * createCommitOnBranch can write, so the repository starts with GitHub's README, which
 * the first commit replaces with `.yeraz.json` and a welcome leaf.
 */
export async function createTreeRepository(
  client: GitHubClient,
  owner: string,
  input: { name: string; title: string },
): Promise<TreeRef> {
  const repo = await client.post<{
    name: string
    full_name: string
    private: boolean
    default_branch: string
    owner: { login: string }
  }>('/user/repos', {
    name: input.name,
    private: true,
    auto_init: true,
    description: 'A Yeraz knowledge family',
  })
  const ref: TreeRef = {
    owner: repo.owner.login ?? owner,
    name: repo.name,
    repo: repo.full_name,
    branch: repo.default_branch,
    isPrivate: repo.private,
    title: input.title.trim() || repo.name,
    color: null,
  }
  const head = await client.getHead(ref.repo, ref.branch)
  if (head === 'not-modified')
    throw new GitHubError('graphql', 'Unexpected 304 for a new repository')
  await createCommit(
    client,
    ref,
    head.sha,
    [
      { path: '.yeraz.json', text: `${JSON.stringify({ name: ref.title })}\n` },
      { path: 'welcome.md', text: WELCOME },
      { path: 'README.md', text: null },
    ],
    { headline: `Start ${ref.title}`, body: 'Created by Yeraz.' },
  )
  return ref
}

const WELCOME = `# 🌱 Welcome

This is the first leaf of your Family. Every leaf is a Markdown file in this repository: line 1 is its title, and everything below is yours.

- Every folder or leaf at the top of the repository is a Tree of its own; this leaf is one.
- Add Trees, branches and leaves from the Explorer.
- Mention another leaf with a link, and the map draws a thread between them.
- Edits are saved on this device as you type, and committed to GitHub two minutes after you stop.
`
