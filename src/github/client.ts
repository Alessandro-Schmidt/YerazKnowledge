// Plain fetch to GitHub: one REST endpoint for tree listings (with ETags) and GraphQL.
// `cache: 'no-store'` because GitHub marks responses cacheable for 60 s and the browser
// cache would hide fresh changes; we keep the ETag ourselves (ARCHITECTURE.md §5.1).

export const GITHUB_API = 'https://api.github.com'

export type GitHubErrorKind =
  | 'network'
  | 'auth'
  | 'not-found'
  | 'empty'
  | 'rate-limit'
  | 'server'
  | 'graphql'
  /** A commit was refused because the branch moved: another device committed first. */
  | 'stale'

export class GitHubError extends Error {
  constructor(
    readonly kind: GitHubErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'GitHubError'
  }
}

export interface TreeEntry {
  path: string
  type: 'blob' | 'tree' | 'commit'
  sha: string
  size?: number
}

export interface TreeListing {
  sha: string
  etag: string | null
  entries: TreeEntry[]
  truncated: boolean
}

export interface GraphQLErrorInfo {
  message: string
  type?: string
  path?: (string | number)[]
}

export interface GitHubClient {
  /** POST to a REST path; answers the parsed JSON. */
  post<T>(path: string, body: unknown): Promise<T>
  /** The branch's head commit SHA; `'not-modified'` when `etag` still matches (free of rate limit). */
  getHead(
    repo: string,
    branch: string,
    etag?: string | null,
  ): Promise<{ sha: string; etag: string | null } | 'not-modified'>
  /** `'not-modified'` when `etag` still matches; that answer is free of rate limit. */
  getTree(
    repo: string,
    ref: string,
    options?: { recursive?: boolean; etag?: string | null },
  ): Promise<TreeListing | 'not-modified'>
  graphql<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<{ data: T; errors: GraphQLErrorInfo[] }>
}

export interface ClientOptions {
  token: string
  api?: string
  fetch?: typeof fetch
}

export function createGitHubClient({
  token,
  api = GITHUB_API,
  fetch: doFetch,
}: ClientOptions): GitHubClient {
  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    let res: Response
    try {
      res = await (doFetch ?? globalThis.fetch)(`${api}${path}`, {
        ...init,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          ...init.headers,
        },
      })
    } catch (e) {
      throw new GitHubError('network', e instanceof Error ? e.message : 'Network error')
    }
    if (res.ok || res.status === 304) return res

    const body = (await res.json().catch(() => ({}))) as { message?: string }
    const message = body.message ?? `GitHub answered ${res.status}`
    const limited =
      (res.status === 403 || res.status === 429) &&
      (res.headers.get('x-ratelimit-remaining') === '0' ||
        res.headers.has('retry-after') ||
        /rate limit/i.test(message))
    const kind: GitHubErrorKind = limited
      ? 'rate-limit'
      : res.status === 401
        ? 'auth'
        : res.status === 404
          ? 'not-found'
          : res.status === 409
            ? 'empty'
            : res.status >= 500
              ? 'server'
              : 'auth' // 403 without a rate limit: the token lacks access
    throw new GitHubError(kind, message, res.status)
  }

  return {
    async post<T>(path: string, body: unknown) {
      const res = await request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return (await res.json()) as T
    },

    async getHead(repo, branch, etag) {
      const res = await request(`/repos/${repo}/commits/${encodeURIComponent(branch)}`, {
        headers: {
          Accept: 'application/vnd.github.sha',
          ...(etag ? { 'If-None-Match': etag } : {}),
        },
      })
      if (res.status === 304) return 'not-modified'
      return { sha: (await res.text()).trim(), etag: res.headers.get('etag') }
    },

    async getTree(repo, ref, { recursive = true, etag } = {}) {
      const res = await request(
        `/repos/${repo}/git/trees/${encodeURIComponent(ref)}${recursive ? '?recursive=1' : ''}`,
        etag ? { headers: { 'If-None-Match': etag } } : {},
      )
      if (res.status === 304) return 'not-modified'
      const body = (await res.json()) as { sha: string; tree: TreeEntry[]; truncated: boolean }
      return {
        sha: body.sha,
        etag: res.headers.get('etag'),
        entries: body.tree.map(({ path, type, sha, size }) =>
          size === undefined ? { path, type, sha } : { path, type, sha, size },
        ),
        truncated: body.truncated,
      }
    },

    async graphql<T>(query: string, variables: Record<string, unknown> = {}) {
      const res = await request('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      })
      const body = (await res.json()) as { data?: T | null; errors?: GraphQLErrorInfo[] }
      const errors = body.errors ?? []
      if (!body.data) {
        const first = errors[0]
        throw new GitHubError(
          first?.type === 'RATE_LIMITED' ? 'rate-limit' : 'graphql',
          first?.message ?? 'Empty GraphQL response',
        )
      }
      return { data: body.data, errors }
    },
  }
}
