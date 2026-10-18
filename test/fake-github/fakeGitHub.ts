// The fake GitHub: (request) → response over in-memory repositories.
// It implements exactly what Yeraz uses (development-plan.md §5.1):
//   GET  /repos/{o}/{r}/commits/{ref}                    head SHA (vnd.github.sha), ETags and 304s
//   GET  /repos/{o}/{r}/git/trees/{ref}[?recursive=1]   ETags and 304s
//   GET  /repos/{o}/{r}/git/blobs/{sha}                  images: raw bytes (vnd.github.raw+json)
//   POST /graphql   object(oid:) / object(expression:), defaultBranchRef, Commit.history(path:),
//                   viewer.repositories (discovery), createCommitOnBranch
//   POST /user/repos
// plus a request log and fault switches. Error messages copy GitHub's where known;
// the nightly contract test against real GitHub keeps them honest.

import { sha1Hex } from '../../src/model/sha'
import { execute, GraphQLError, parse, type GqlObject } from './graphql'
import { FakeRepo, RepoError, type Commit, type FileChanges } from './repo'

export interface FakeRequest {
  method: string
  url: string
  headers: Record<string, string>
  body?: string | null
}

export interface FakeResponse {
  status: number
  headers: Record<string, string>
  body: string | Uint8Array | null
}

export interface LogEntry {
  method: string
  path: string
  status: number
  kind: 'head' | 'tree' | 'blob' | 'graphql' | 'create-repo' | 'unknown'
  /** GraphQL only. */
  operation?: 'query' | 'mutation'
  /** Number of blob texts returned. */
  blobs: number
  failed?: 'offline'
}

export interface Faults {
  /** Every request fails as a network error. */
  offline: boolean
  /** Every request answers 500. */
  serverError: boolean
  /** Delay before answering, in milliseconds. */
  latencyMs: number
  /** Recursive listings of a root tree come back truncated (root entries only). */
  truncateTrees: boolean
  /** Committed just before the next createCommitOnBranch, as if another device pushed first. */
  pushBeforeNextCommit: (FileChanges & { repo?: string }) | null
}

/** Thrown by `handle` when the fake is offline. Adapters turn it into a failed fetch. */
export class NetworkError extends Error {
  override name = 'NetworkError'
}

const API = 'https://api.github.com'
const DOCS = 'https://docs.github.com/rest'

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers':
    'ETag, Link, Location, Retry-After, X-GitHub-OTP, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Used, X-RateLimit-Resource, X-RateLimit-Reset, X-OAuth-Scopes, X-Accepted-OAuth-Scopes, X-Poll-Interval, X-GitHub-Media-Type, X-GitHub-SSO, X-GitHub-Request-Id, Deprecation, Sunset',
}

const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): FakeResponse => ({
  status,
  headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', ...headers },
  body: JSON.stringify(body),
})

const restError = (status: number, message: string, extra: object = {}) =>
  json(status, { message, documentation_url: DOCS, status: String(status), ...extra })

const decoder = new TextDecoder('utf-8', { fatal: true })

function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null
  try {
    return decoder.decode(bytes)
  } catch {
    return null
  }
}

function base64ToBytes(b64: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length % 4 !== 0) {
    throw new GraphQLError('Invalid base64 in fileChanges.additions contents')
  }
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

export type FakeGitHub = ReturnType<typeof createFakeGitHub>

export function createFakeGitHub(options: { login?: string; tokens?: string[] } = {}) {
  const login = options.login ?? 'you'
  const repos = new Map<string, FakeRepo>()
  const log: LogEntry[] = []
  const faults: Faults = {
    offline: false,
    serverError: false,
    latencyMs: 0,
    truncateTrees: false,
    pushBeforeNextCommit: null,
  }

  const key = (owner: string, name: string) => `${owner}/${name}`.toLowerCase()

  /** `null` when no token was sent; `false` when the token is not accepted. */
  const authenticate = (headers: Record<string, string>): boolean | null => {
    const auth = headers['authorization']
    if (!auth) return null
    const token = auth.replace(/^(bearer|token)\s+/i, '')
    return token.length > 0 && (!options.tokens || options.tokens.includes(token))
  }

  const visibleRepo = (owner: string, name: string, authed: boolean) => {
    const repo = repos.get(key(owner, name))
    return repo && (authed || !repo.isPrivate) ? repo : undefined
  }

  async function addRepo(
    nameWithOwner: string,
    files: Record<string, string | Uint8Array> | null = null,
    opts: { private?: boolean; description?: string } = {},
  ): Promise<FakeRepo> {
    const [owner, name] = nameWithOwner.split('/') as [string, string]
    const repo = new FakeRepo(owner, name, opts.private ?? true, opts.description ?? null)
    repos.set(key(owner, name), repo)
    if (files && Object.keys(files).length > 0) {
      await repo.commit({
        message: 'Initial commit',
        additions: Object.entries(files).map(([path, contents]) => ({ path, contents })),
      })
    }
    return repo
  }

  function repo(nameWithOwner: string): FakeRepo {
    const found = repos.get(nameWithOwner.toLowerCase())
    if (!found) throw new Error(`The fake has no repository ${nameWithOwner}`)
    return found
  }

  // ---------- REST: git trees ----------

  async function getTree(
    owner: string,
    name: string,
    ref: string,
    recursive: boolean,
    req: FakeRequest,
    authed: boolean,
  ): Promise<FakeResponse> {
    const repo = visibleRepo(owner, name, authed)
    if (!repo) return restError(404, 'Not Found')
    if (!repo.head) return restError(409, 'Git Repository is empty.')

    let commit: Commit | undefined
    let dir = ''
    if (ref === repo.defaultBranch || ref === 'HEAD') commit = repo.head
    else commit = repo.commits.find((c) => c.oid === ref)
    if (!commit) {
      commit = [...repo.commits].reverse().find((c) => c.dirsBySha.has(ref))
      dir = commit?.dirsBySha.get(ref) ?? ''
    }
    if (!commit) return restError(404, 'Not Found')

    const treeSha = [...commit.dirsBySha].find(([, path]) => path === dir)![0]
    const truncated = faults.truncateTrees && recursive && dir === ''
    let entries = repo.list(commit, dir, recursive)
    if (truncated) entries = entries.filter((e) => !e.path.includes('/'))

    const etag = `W/"${await sha1Hex(`${treeSha}:${recursive}:${truncated}`)}"`
    const cache = {
      etag,
      'cache-control': 'private, max-age=60, s-maxage=60',
      vary: 'Accept, Authorization',
    }
    const sent = req.headers['if-none-match']
    if (sent && (sent === etag || sent === etag.slice(2))) {
      return { status: 304, headers: { ...CORS, ...cache }, body: null }
    }
    const base = `${API}/repos/${repo.nameWithOwner}/git`
    return json(
      200,
      {
        sha: treeSha,
        url: `${base}/trees/${treeSha}`,
        tree: entries.map((e) => ({ ...e, url: `${base}/${e.type}s/${e.sha}` })),
        truncated,
      },
      cache,
    )
  }

  // ---------- REST: git blobs (images; leaf texts come through GraphQL) ----------

  function getBlob(
    owner: string,
    name: string,
    sha: string,
    req: FakeRequest,
    authed: boolean,
  ): FakeResponse {
    const repo = visibleRepo(owner, name, authed)
    const bytes = repo?.blobs.get(sha)
    if (!repo || !bytes) return restError(404, 'Not Found')
    const cache = { etag: `"${sha}"`, 'cache-control': 'private, max-age=60, s-maxage=60' }
    if ((req.headers['accept'] ?? '').includes('application/vnd.github.raw')) {
      return {
        status: 200,
        headers: { ...CORS, ...cache, 'content-type': 'application/octet-stream' },
        body: bytes,
      }
    }
    const content = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
    return json(
      200,
      {
        sha,
        size: bytes.byteLength,
        url: `${API}/repos/${repo.nameWithOwner}/git/blobs/${sha}`,
        content: content.replace(/.{60}/g, '$&\n'),
        encoding: 'base64',
      },
      cache,
    )
  }

  // ---------- REST: the head commit ----------

  async function getHead(
    owner: string,
    name: string,
    ref: string,
    req: FakeRequest,
    authed: boolean,
  ): Promise<FakeResponse> {
    const repo = visibleRepo(owner, name, authed)
    if (!repo) return restError(404, 'Not Found')
    if (!repo.head) return restError(409, 'Git Repository is empty.')
    const commit =
      ref === repo.defaultBranch || ref === 'HEAD'
        ? repo.head
        : repo.commits.find((c) => c.oid === ref)
    if (!commit) return restError(422, `No commit found for SHA: ${ref}`)
    const onlySha = (req.headers['accept'] ?? '').includes('application/vnd.github.sha')
    const etag = `W/"${await sha1Hex(`${commit.oid}:${onlySha}`)}"`
    const cache = {
      etag,
      'cache-control': 'private, max-age=60, s-maxage=60',
      vary: 'Accept, Authorization',
    }
    const sent = req.headers['if-none-match']
    if (sent && (sent === etag || sent === etag.slice(2)))
      return { status: 304, headers: { ...CORS, ...cache }, body: null }
    if (onlySha) {
      return {
        status: 200,
        headers: { ...CORS, ...cache, 'content-type': 'application/vnd.github.sha; charset=utf-8' },
        body: commit.oid,
      }
    }
    return json(
      200,
      {
        sha: commit.oid,
        url: `${API}/repos/${repo.nameWithOwner}/commits/${commit.oid}`,
        commit: { message: commit.message, tree: { sha: commit.root.sha } },
        parents: commit.parent ? [{ sha: commit.parent }] : [],
      },
      cache,
    )
  }

  // ---------- REST: create a repository ----------

  async function createRepo(req: FakeRequest): Promise<FakeResponse> {
    let input: { name?: string; private?: boolean; description?: string; auto_init?: boolean }
    try {
      input = JSON.parse(req.body ?? '{}')
    } catch {
      return restError(400, 'Problems parsing JSON')
    }
    if (!input.name) {
      return restError(422, 'Repository creation failed.', {
        errors: [{ resource: 'Repository', code: 'missing_field', field: 'name' }],
      })
    }
    const name = input.name.replace(/[^A-Za-z0-9._-]/g, '-')
    if (repos.has(key(login, name))) {
      return restError(422, 'Repository creation failed.', {
        errors: [
          {
            resource: 'Repository',
            code: 'custom',
            field: 'name',
            message: 'name already exists on this account',
          },
        ],
      })
    }
    // GitHub creates public repositories unless `private: true` is sent.
    const repo = await addRepo(`${login}/${name}`, null, {
      private: input.private ?? false,
      ...(input.description ? { description: input.description } : {}),
    })
    // Without auto_init the repository is empty: it has no branch to commit to yet.
    if (input.auto_init)
      await repo.commit({
        message: 'Initial commit',
        additions: [{ path: 'README.md', contents: `# ${name}\n` }],
      })
    return json(201, {
      id: repos.size,
      name,
      full_name: repo.nameWithOwner,
      owner: { login, type: 'User' },
      private: repo.isPrivate,
      description: repo.description,
      html_url: `https://github.com/${repo.nameWithOwner}`,
      url: `${API}/repos/${repo.nameWithOwner}`,
      default_branch: repo.defaultBranch,
    })
  }

  // ---------- GraphQL ----------

  async function graphql(
    req: FakeRequest,
  ): Promise<{ response: FakeResponse; blobs: number; operation?: 'query' | 'mutation' }> {
    let payload: { query?: string; variables?: Record<string, unknown> }
    try {
      payload = JSON.parse(req.body ?? '')
    } catch {
      return {
        response: json(400, { message: 'Problems parsing JSON', documentation_url: DOCS }),
        blobs: 0,
      }
    }
    let op
    try {
      op = parse(payload.query ?? '')
    } catch (e) {
      if (!(e instanceof GraphQLError)) throw e
      return { response: json(200, { errors: [{ message: e.message }] }), blobs: 0 }
    }

    let blobs = 0
    const blob = (repo: FakeRepo, sha: string): GqlObject => {
      const bytes = repo.blobs.get(sha)!
      const text = decodeText(bytes)
      return {
        __typename: 'Blob',
        oid: sha,
        byteSize: bytes.byteLength,
        isBinary: text === null,
        text: () => {
          if (text !== null) blobs++
          return text
        },
      }
    }
    const tree = (sha: string): GqlObject => ({ __typename: 'Tree', oid: sha })
    const commitObj = (repo: FakeRepo, c: Commit): GqlObject => ({
      __typename: 'Commit',
      oid: c.oid,
      message: c.message,
      messageHeadline: c.message.split('\n')[0],
      committedDate: c.date.toISOString(),
      // Every commit is the repository owner's: the fake has one person.
      author: {
        __typename: 'GitActor',
        name: repo.owner,
        date: c.date.toISOString(),
        user: { __typename: 'User', login: repo.owner },
      },
      url: `https://github.com/${repo.nameWithOwner}/commit/${c.oid}`,
      tree: tree(c.root.sha),
      file: ({ path }: { path: string }) => {
        const sha = c.files.get(path)
        return sha ? { __typename: 'TreeEntry', path, oid: sha, object: blob(repo, sha) } : null
      },
      // The commits from this one back that changed `path`, newest first. Like GitHub's,
      // it doesn't follow a file across a move.
      history: ({ path, first, after }: { path?: string; first?: number; after?: string }) => {
        if (first == null || first > 100)
          throw new GraphQLError(
            'You must provide a `first` value of at most 100 to paginate the `history` connection.',
          )
        const upTo = repo.commits.indexOf(c)
        const all = repo.commits
          .slice(0, upTo + 1)
          .filter(
            (commit, i) => !path || commit.files.get(path) !== repo.commits[i - 1]?.files.get(path),
          )
          .reverse()
        const start = after ? Number(atob(after).split(':')[1]) + 1 : 0
        const page = all.slice(start, start + first)
        const end = start + page.length - 1
        return {
          __typename: 'CommitHistoryConnection',
          totalCount: all.length,
          nodes: page.map((commit) => commitObj(repo, commit)),
          pageInfo: {
            __typename: 'PageInfo',
            hasNextPage: end < all.length - 1,
            endCursor: page.length ? btoa(`cursor:${end}`) : null,
          },
        }
      },
    })
    const resolveRev = (repo: FakeRepo, rev: string) =>
      rev === 'HEAD' || rev === repo.defaultBranch
        ? repo.head
        : repo.commits.find((c) => c.oid === rev)

    const repository = (repo: FakeRepo): GqlObject => ({
      __typename: 'Repository',
      id: btoa(`R_${repo.nameWithOwner}`),
      name: repo.name,
      nameWithOwner: repo.nameWithOwner,
      isPrivate: repo.isPrivate,
      description: repo.description,
      url: `https://github.com/${repo.nameWithOwner}`,
      updatedAt: new Date(repo.updatedAt).toISOString(),
      owner: { __typename: 'User', login: repo.owner },
      defaultBranchRef: repo.head
        ? { __typename: 'Ref', name: repo.defaultBranch, target: commitObj(repo, repo.head) }
        : null,
      object: ({ oid, expression }: { oid?: string; expression?: string }) => {
        if (oid) {
          if (repo.blobs.has(oid)) return blob(repo, oid)
          const commit = repo.commits.find((c) => c.oid === oid)
          if (commit) return commitObj(repo, commit)
          return repo.commits.some((c) => c.dirsBySha.has(oid)) ? tree(oid) : null
        }
        if (!expression) throw new GraphQLError("Must provide either 'oid' or 'expression'")
        const [rev = '', path] = expression.split(/:(.*)/s)
        const commit = resolveRev(repo, rev)
        if (!commit) return null
        if (path === undefined) return commitObj(repo, commit)
        if (path === '') return tree(commit.root.sha)
        const sha = commit.files.get(path)
        if (sha) return blob(repo, sha)
        const dirSha = [...commit.dirsBySha].find(([, p]) => p === path)?.[0]
        return dirSha ? tree(dirSha) : null
      },
    })

    const query: GqlObject = {
      __typename: 'Query',
      repository: ({ owner, name }: { owner: string; name: string }) => {
        const repo = visibleRepo(owner, name, true)
        if (!repo) {
          throw new GraphQLError(
            `Could not resolve to a Repository with the name '${owner}/${name}'.`,
            'NOT_FOUND',
          )
        }
        return repository(repo)
      },
      viewer: {
        __typename: 'User',
        login,
        repositories: ({ first, after }: { first?: number; after?: string }) => {
          if (first == null) {
            throw new GraphQLError(
              'You must provide a `first` or `last` value to properly paginate the `repositories` connection.',
            )
          }
          if (first > 100) {
            throw new GraphQLError(
              `Requesting ${first} records on the \`repositories\` connection exceeds the \`first\` limit of 100 records.`,
            )
          }
          const all = [...repos.values()].reverse().sort((a, b) => b.updatedAt - a.updatedAt)
          const start = after ? Number(atob(after).split(':')[1]) + 1 : 0
          const page = all.slice(start, start + first)
          const end = start + page.length - 1
          return {
            __typename: 'RepositoryConnection',
            totalCount: all.length,
            nodes: page.map(repository),
            pageInfo: {
              __typename: 'PageInfo',
              hasNextPage: end < all.length - 1,
              endCursor: page.length ? btoa(`cursor:${end}`) : null,
            },
          }
        },
      },
    }

    const mutation: GqlObject = {
      __typename: 'Mutation',
      createCommitOnBranch: async ({ input }: { input: CommitInput | null }) => {
        if (!input)
          throw new GraphQLError("Argument 'input' on Field 'createCommitOnBranch' is required.")
        const nwo = input.branch?.repositoryNameWithOwner ?? ''
        const [owner = '', name = ''] = nwo.split('/')
        const repo = visibleRepo(owner, name, true)
        if (!repo)
          throw new GraphQLError(
            `Could not resolve to a Repository with the name '${nwo}'.`,
            'NOT_FOUND',
          )
        const branch = input.branch?.branchName
        if (!repo.head || branch !== repo.defaultBranch) {
          throw new GraphQLError(`A ref named "refs/heads/${branch}" does not exist.`, 'NOT_FOUND')
        }
        if (!input.expectedHeadOid) {
          throw new GraphQLError(
            "Argument 'expectedHeadOid' on InputObject 'CreateCommitOnBranchInput' is required.",
          )
        }
        if (!input.message?.headline) {
          throw new GraphQLError("Argument 'headline' on InputObject 'CommitMessage' is required.")
        }
        if (
          faults.pushBeforeNextCommit &&
          (faults.pushBeforeNextCommit.repo ?? nwo).toLowerCase() === nwo.toLowerCase()
        ) {
          const other = faults.pushBeforeNextCommit
          faults.pushBeforeNextCommit = null
          await repo.commit(other)
        }
        if (input.expectedHeadOid !== repo.head.oid) {
          throw new GraphQLError(
            `Expected branch to point to "${input.expectedHeadOid}" but it did not. Pull and try again.`,
            'STALE_DATA',
          )
        }
        const { headline, body } = input.message
        try {
          const commit = await repo.commit({
            message: body ? `${headline}\n\n${body}` : headline,
            additions: (input.fileChanges?.additions ?? []).map((a) => ({
              path: a.path,
              contents: base64ToBytes(a.contents),
            })),
            deletions: (input.fileChanges?.deletions ?? []).map((d) => d.path),
          })
          return {
            __typename: 'CreateCommitOnBranchPayload',
            clientMutationId: input.clientMutationId ?? null,
            commit: commitObj(repo, commit),
            ref: { __typename: 'Ref', name: repo.defaultBranch },
          }
        } catch (e) {
          if (e instanceof RepoError) throw new GraphQLError(e.message, 'UNPROCESSABLE')
          throw e
        }
      },
    }

    const { data, errors } = await execute(
      op,
      op.type === 'query' ? query : mutation,
      payload.variables ?? {},
    )
    return {
      response: json(200, errors.length ? { data, errors } : { data }),
      blobs,
      operation: op.type,
    }
  }

  // ---------- Routing ----------

  async function handle(req: FakeRequest): Promise<FakeResponse> {
    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), v]),
    )
    const request = { ...req, headers }
    const url = new URL(req.url)
    const method = req.method.toUpperCase()

    // CORS pre-flight: browsers send it, GitHub answers it, it never counts as a request.
    if (method === 'OPTIONS') {
      return {
        status: 204,
        headers: {
          ...CORS,
          'access-control-allow-headers':
            'Authorization, Content-Type, If-Match, If-Modified-Since, If-None-Match, If-Unmodified-Since, Accept-Encoding, X-GitHub-OTP, X-Requested-With, User-Agent, GraphQL-Features',
          'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE',
          'access-control-max-age': '86400',
        },
        body: null,
      }
    }

    const tree = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/trees\/(.+)$/)
    const head = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/commits\/([^/]+)$/)
    const blob = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/blobs\/([0-9a-f]{40})$/)
    const kind: LogEntry['kind'] =
      method === 'GET' && head
        ? 'head'
        : method === 'GET' && tree
          ? 'tree'
          : method === 'GET' && blob
            ? 'blob'
            : method === 'POST' && url.pathname === '/graphql'
              ? 'graphql'
              : method === 'POST' && url.pathname === '/user/repos'
                ? 'create-repo'
                : 'unknown'
    const entry: LogEntry = { method, path: url.pathname + url.search, status: 0, kind, blobs: 0 }
    log.push(entry)

    if (faults.latencyMs > 0) await new Promise((r) => setTimeout(r, faults.latencyMs))
    if (faults.offline) {
      entry.failed = 'offline'
      throw new NetworkError('Failed to fetch')
    }

    let response: FakeResponse
    const auth = authenticate(headers)
    if (faults.serverError) {
      response = json(500, { message: 'Server Error' })
    } else if (auth === false) {
      response = restError(401, 'Bad credentials')
    } else if (kind === 'head') {
      const [, owner, name, ref] = head!
      response = await getHead(owner!, name!, decodeURIComponent(ref!), request, auth === true)
    } else if (kind === 'tree') {
      const [, owner, name, ref] = tree!
      response = await getTree(
        owner!,
        name!,
        decodeURIComponent(ref!),
        url.searchParams.has('recursive'),
        request,
        auth === true,
      )
    } else if (kind === 'blob') {
      const [, owner, name, sha] = blob!
      response = getBlob(owner!, name!, sha!, request, auth === true)
    } else if (kind === 'graphql') {
      if (!auth) {
        response = json(401, {
          message: 'This endpoint requires you to be authenticated.',
          documentation_url:
            'https://docs.github.com/graphql/guides/forming-calls-with-graphql#authenticating-with-graphql',
        })
      } else {
        const result = await graphql(request)
        response = result.response
        entry.blobs = result.blobs
        if (result.operation) entry.operation = result.operation
      }
    } else if (kind === 'create-repo') {
      response = auth ? await createRepo(request) : restError(401, 'Requires authentication')
    } else {
      response = restError(404, 'Not Found')
    }
    entry.status = response.status
    return response
  }

  return {
    login,
    repos,
    log,
    faults,
    addRepo,
    repo,
    handle,
    /** Clears the request log, keeping the same array. */
    resetLog: () => void log.splice(0),
  }
}

interface CommitInput {
  branch?: { repositoryNameWithOwner?: string; branchName?: string }
  expectedHeadOid?: string
  message?: { headline?: string; body?: string }
  fileChanges?: { additions?: { path: string; contents: string }[]; deletions?: { path: string }[] }
  clientMutationId?: string
}
