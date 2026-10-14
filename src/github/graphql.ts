// The GraphQL operations Yeraz uses to read: blobs by SHA, and finding Trees
// (every repository with a `.yeraz.json` at the root, ARCHITECTURE.md §5.3).
// The third, createCommitOnBranch, arrives with saving in M2.

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
