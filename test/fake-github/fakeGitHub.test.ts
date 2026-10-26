import { beforeEach, describe, expect, it } from 'vitest'
import { gitBlobSha } from '../../src/model/sha'
import {
  createFakeGitHub,
  NetworkError,
  type FakeGitHub,
  type FakeRequest,
  type FakeResponse,
} from './fakeGitHub'

const API = 'https://api.github.com'
const TOKEN = 'test-token'

function request(
  fake: FakeGitHub,
  method: string,
  path: string,
  init: { body?: unknown; headers?: Record<string, string>; token?: string | null } = {},
) {
  const token = init.token === undefined ? TOKEN : init.token
  // Bodies are text, except a raw blob's bytes (cast where a test reads those).
  return (fake.handle as (r: FakeRequest) => Promise<FakeResponse & { body: string | null }>)({
    method,
    url: `${API}${path}`,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    body: init.body === undefined ? null : JSON.stringify(init.body),
  })
}

async function gql(fake: FakeGitHub, query: string, variables?: Record<string, unknown>) {
  const res = await request(fake, 'POST', '/graphql', { body: { query, variables } })
  expect(res.status).toBe(200)
  return JSON.parse(res.body!) as {
    data?: any
    errors?: { message: string; type?: string; path?: unknown[] }[]
  }
}

const b64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)))

let fake: FakeGitHub

beforeEach(async () => {
  fake = createFakeGitHub({ login: 'you', tokens: [TOKEN] })
  await fake.addRepo('you/engineering', {
    '.yeraz.json': '{"name":"Engineering","color":"green"}\n',
    'identity.md': '# 🔐 Identity\n\nSee [Keycloak](/identity/keycloak.md).\n',
    'identity/keycloak.md': '# Keycloak\n\nRealms and clients.\n',
    'identity/keycloak/realms.md': '# Realms\n',
    'cloud/aws.md': '# AWS\r\n\r\nCRLF body\r\n',
    'a-b.md': '# Sorting\n',
  })
})

describe('GET git/trees', () => {
  it('lists every entry recursively, in git order, with real blob SHAs', async () => {
    const res = await request(fake, 'GET', '/repos/you/engineering/git/trees/main?recursive=1')
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body!)
    expect(body.truncated).toBe(false)
    // Git order: a directory sorts as if named "identity/", so "identity.md" comes first;
    // a directory's contents follow its own entry.
    expect(body.tree.map((e: { path: string }) => e.path)).toEqual([
      '.yeraz.json',
      'a-b.md',
      'cloud',
      'cloud/aws.md',
      'identity.md',
      'identity',
      'identity/keycloak.md',
      'identity/keycloak',
      'identity/keycloak/realms.md',
    ])
    const aws = body.tree.find((e: { path: string }) => e.path === 'cloud/aws.md')
    expect(aws).toMatchObject({ type: 'blob', mode: '100644', size: 20 })
    expect(aws.sha).toBe(await gitBlobSha('# AWS\r\n\r\nCRLF body\r\n'))
    expect(body.tree.find((e: { path: string }) => e.path === 'cloud')).toMatchObject({
      type: 'tree',
      mode: '040000',
    })
  })

  it('answers 304 to a matching If-None-Match, and 200 again after a commit', async () => {
    const path = '/repos/you/engineering/git/trees/main?recursive=1'
    const first = await request(fake, 'GET', path)
    const etag = first.headers['etag']!
    expect(etag).toMatch(/^W\/".+"$/)
    expect(first.headers['access-control-expose-headers']).toContain('ETag')

    const second = await request(fake, 'GET', path, { headers: { 'If-None-Match': etag } })
    expect(second.status).toBe(304)
    expect(second.body).toBeNull()

    await fake
      .repo('you/engineering')
      .commit({ message: 'edit', additions: [{ path: 'a-b.md', contents: '# Sorting!\n' }] })
    const third = await request(fake, 'GET', path, { headers: { 'If-None-Match': etag } })
    expect(third.status).toBe(200)
    expect(third.headers['etag']).not.toBe(etag)
  })

  it('lists a subtree by its SHA, non-recursively, with paths relative to it', async () => {
    const root = JSON.parse(
      (await request(fake, 'GET', '/repos/you/engineering/git/trees/main')).body!,
    )
    expect(root.tree.map((e: { path: string }) => e.path)).toEqual([
      '.yeraz.json',
      'a-b.md',
      'cloud',
      'identity.md',
      'identity',
    ])
    const identity = root.tree.find((e: { path: string }) => e.path === 'identity')
    const sub = JSON.parse(
      (await request(fake, 'GET', `/repos/you/engineering/git/trees/${identity.sha}`)).body!,
    )
    expect(sub.sha).toBe(identity.sha)
    expect(sub.tree.map((e: { path: string }) => e.path)).toEqual(['keycloak.md', 'keycloak'])
  })

  it('returns a truncated listing when the fault is on, and subtrees still list in full', async () => {
    fake.faults.truncateTrees = true
    const body = JSON.parse(
      (await request(fake, 'GET', '/repos/you/engineering/git/trees/main?recursive=1')).body!,
    )
    expect(body.truncated).toBe(true)
    expect(body.tree.every((e: { path: string }) => !e.path.includes('/'))).toBe(true)
    const identity = body.tree.find((e: { path: string }) => e.path === 'identity')
    const sub = JSON.parse(
      (await request(fake, 'GET', `/repos/you/engineering/git/trees/${identity.sha}?recursive=1`))
        .body!,
    )
    expect(sub.truncated).toBe(false)
    expect(sub.tree).toHaveLength(3)
  })

  it('answers 404 for unknown repositories and refs, and hides private ones without a token', async () => {
    expect((await request(fake, 'GET', '/repos/you/nope/git/trees/main')).status).toBe(404)
    expect((await request(fake, 'GET', '/repos/you/engineering/git/trees/nope')).status).toBe(404)
    expect(
      (await request(fake, 'GET', '/repos/you/engineering/git/trees/main', { token: null })).status,
    ).toBe(404)
    await fake.addRepo('you/public', { 'a.md': '# A\n' }, { private: false })
    expect(
      (await request(fake, 'GET', '/repos/you/public/git/trees/main', { token: null })).status,
    ).toBe(200)
  })

  it('answers 409 for an empty repository and 401 for a bad token', async () => {
    await fake.addRepo('you/empty')
    const empty = await request(fake, 'GET', '/repos/you/empty/git/trees/main')
    expect(empty.status).toBe(409)
    expect(JSON.parse(empty.body!).message).toBe('Git Repository is empty.')
    const bad = await request(fake, 'GET', '/repos/you/engineering/git/trees/main', {
      token: 'wrong',
    })
    expect(bad.status).toBe(401)
    expect(JSON.parse(bad.body!).message).toBe('Bad credentials')
  })
})

describe('GET commits/{ref}', () => {
  it('answers the head SHA alone with the sha media type, with an ETag and 304s', async () => {
    const repo = fake.repo('you/engineering')
    const path = '/repos/you/engineering/commits/main'
    const first = await request(fake, 'GET', path, {
      headers: { Accept: 'application/vnd.github.sha' },
    })
    expect(first.status).toBe(200)
    expect(first.body).toBe(repo.head!.oid)
    const etag = first.headers['etag']!
    const again = await request(fake, 'GET', path, {
      headers: { Accept: 'application/vnd.github.sha', 'If-None-Match': etag },
    })
    expect(again.status).toBe(304)
    await repo.commit({ message: 'x', additions: [{ path: 'new.md', contents: '# New\n' }] })
    const changed = await request(fake, 'GET', path, {
      headers: { Accept: 'application/vnd.github.sha', 'If-None-Match': etag },
    })
    expect(changed.status).toBe(200)
    expect(changed.body).toBe(repo.head!.oid)
    expect(fake.log.map((e) => e.kind)).toEqual(['head', 'head', 'head'])
  })

  it('answers JSON with the tree SHA otherwise, and lists that commit by SHA', async () => {
    const repo = fake.repo('you/engineering')
    const res = JSON.parse(
      (await request(fake, 'GET', '/repos/you/engineering/commits/main')).body!,
    )
    expect(res).toMatchObject({
      sha: repo.head!.oid,
      commit: { tree: { sha: repo.head!.root.sha } },
    })
    const tree = await request(
      fake,
      'GET',
      `/repos/you/engineering/git/trees/${repo.head!.oid}?recursive=1`,
    )
    expect(JSON.parse(tree.body!).sha).toBe(repo.head!.root.sha)
  })

  it('answers 409 for an empty repository and 422 for an unknown SHA', async () => {
    await fake.addRepo('you/empty')
    expect((await request(fake, 'GET', '/repos/you/empty/commits/main')).status).toBe(409)
    expect(
      (await request(fake, 'GET', `/repos/you/engineering/commits/${'0'.repeat(40)}`)).status,
    ).toBe(422)
  })
})

describe('GraphQL: blobs and refs', () => {
  it('returns many blobs by OID in one aliased query, and counts them in the log', async () => {
    const shaA = await gitBlobSha('# Realms\n')
    const shaB = await gitBlobSha('# AWS\r\n\r\nCRLF body\r\n')
    fake.resetLog()
    const res = await gql(
      fake,
      `query { repository(owner: "you", name: "engineering") {
        b0: object(oid: "${shaA}") { ... on Blob { text } }
        b1: object(oid: "${shaB}") { ... on Blob { text byteSize } }
        missing: object(oid: "${'0'.repeat(40)}") { ... on Blob { text } }
      } }`,
    )
    expect(res.errors).toBeUndefined()
    expect(res.data.repository).toEqual({
      b0: { text: '# Realms\n' },
      b1: { text: '# AWS\r\n\r\nCRLF body\r\n', byteSize: 20 },
      missing: null,
    })
    expect(fake.log).toEqual([
      {
        method: 'POST',
        path: '/graphql',
        status: 200,
        kind: 'graphql',
        operation: 'query',
        blobs: 2,
      },
    ])
  })

  it('reads the head commit, its tree, and a file by expression, with variables', async () => {
    const res = await gql(
      fake,
      `query Head($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          defaultBranchRef { name target { oid ... on Commit { tree { oid } } } }
          marker: object(expression: "HEAD:.yeraz.json") { __typename ... on Blob { text } }
          dir: object(expression: "HEAD:identity") { __typename }
        }
      }`,
      { owner: 'you', name: 'engineering' },
    )
    const repo = fake.repo('you/engineering')
    expect(res.data.repository).toEqual({
      defaultBranchRef: {
        name: 'main',
        target: { oid: repo.head!.oid, tree: { oid: repo.head!.root.sha } },
      },
      marker: { __typename: 'Blob', text: '{"name":"Engineering","color":"green"}\n' },
      dir: { __typename: 'Tree' },
    })
  })

  it('reports unknown fields and repositories the way GitHub does', async () => {
    const typo = await gql(fake, '{ repository(owner: "you", name: "engineering") { nam } }')
    expect(typo.errors![0]!.message).toBe("Field 'nam' doesn't exist on type 'Repository'")
    const missing = await gql(fake, '{ repository(owner: "you", name: "nope") { name } }')
    expect(missing.data.repository).toBeNull()
    expect(missing.errors![0]).toMatchObject({ type: 'NOT_FOUND', path: ['repository'] })
  })

  it('requires a token', async () => {
    const res = await request(fake, 'POST', '/graphql', {
      body: { query: '{ viewer { login } }' },
      token: null,
    })
    expect(res.status).toBe(401)
  })
})

describe('GraphQL: discovery', () => {
  const discover = `query($cursor: String) { viewer { login repositories(first: 2, after: $cursor, ownerAffiliations: [OWNER, COLLABORATOR], orderBy: { field: UPDATED_AT, direction: DESC }) {
    pageInfo { hasNextPage endCursor }
    nodes { nameWithOwner isPrivate marker: object(expression: "HEAD:.yeraz.json") { ... on Blob { text } } }
  } } }`

  it('pages through repositories, newest first, with the marker file', async () => {
    await fake.addRepo('you/dotfiles', { 'README.md': '# dotfiles\n' })
    await fake.addRepo('you/art', { '.yeraz.json': '{"name":"Art"}\n' })
    const page1 = (await gql(fake, discover)).data.viewer.repositories
    expect(page1.nodes.map((n: { nameWithOwner: string }) => n.nameWithOwner)).toEqual([
      'you/art',
      'you/dotfiles',
    ])
    expect(page1.nodes[0].marker).toEqual({ text: '{"name":"Art"}\n' })
    expect(page1.nodes[1].marker).toBeNull()
    expect(page1.pageInfo.hasNextPage).toBe(true)
    const page2 = (await gql(fake, discover, { cursor: page1.pageInfo.endCursor })).data.viewer
      .repositories
    expect(page2.nodes.map((n: { nameWithOwner: string }) => n.nameWithOwner)).toEqual([
      'you/engineering',
    ])
    expect(page2.pageInfo.hasNextPage).toBe(false)
  })

  it('rejects more than 100 records per page', async () => {
    const res = await gql(fake, '{ viewer { repositories(first: 101) { nodes { name } } } }')
    expect(res.errors![0]!.message).toContain('exceeds the `first` limit of 100 records')
  })
})

describe('GraphQL: blame', () => {
  const blame = `query($rev: String!) { repository(owner: "you", name: "engineering") {
    object(expression: $rev) { ... on Commit {
      a: blame(path: "identity/vault.md") { ranges { startingLine endingLine commit { oid committedDate } } }
      b: blame(path: "nowhere.md") { ranges { startingLine } }
    } } } }`

  it('gives each line the commit that wrote it, in ranges, and an error for a missing file', async () => {
    const repo = fake.repo('you/engineering')
    const planted = await repo.commit({
      message: 'Plant',
      date: new Date('2026-01-15T10:00:00Z'),
      additions: [{ path: 'identity/vault.md', contents: '# Vault\n\nRealms.\n' }],
    })
    const edited = await repo.commit({
      message: 'Edit',
      date: new Date('2026-03-02T10:00:00Z'),
      additions: [{ path: 'identity/vault.md', contents: '# Vault\n\nRealms.\nClients.\n' }],
    })
    const res = await gql(fake, blame, { rev: edited.oid })
    expect(res.data.repository.object.a.ranges).toEqual([
      {
        startingLine: 1,
        endingLine: 3,
        commit: { oid: planted.oid, committedDate: '2026-01-15T10:00:00.000Z' },
      },
      {
        startingLine: 4,
        endingLine: 4,
        commit: { oid: edited.oid, committedDate: '2026-03-02T10:00:00.000Z' },
      },
    ])
    expect(res.data.repository.object.b).toBeNull()
    expect(res.errors![0]!.message).toContain('nowhere.md')
  })
})

describe('GraphQL: a file history', () => {
  const history = `query($rev: String!, $path: String!, $after: String) { repository(owner: "you", name: "engineering") {
    object(expression: $rev) { ... on Commit { history(path: $path, first: 2, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { oid committedDate messageHeadline author { name user { login } } file(path: $path) { oid } }
    } } } } }`

  it('lists the commits that changed a path, newest first, paged, with its blob in each', async () => {
    const repo = fake.repo('you/engineering')
    const first = repo.head!
    await repo.commit({ message: 'Other', additions: [{ path: 'a-b.md', contents: '# B\n' }] })
    const second = await repo.commit({
      message: 'Update Keycloak\n\nbody',
      additions: [{ path: 'identity/keycloak.md', contents: '# Keycloak\n\nv2\n' }],
    })
    const third = await repo.commit({
      message: 'Again',
      additions: [{ path: 'identity/keycloak.md', contents: '# Keycloak\n\nv3\n' }],
    })
    const path = 'identity/keycloak.md'
    const page1 = (await gql(fake, history, { rev: third.oid, path })).data.repository.object
      .history
    expect(page1.nodes.map((n: { oid: string }) => n.oid)).toEqual([third.oid, second.oid])
    expect(page1.nodes[1]).toEqual({
      oid: second.oid,
      committedDate: second.date.toISOString(),
      messageHeadline: 'Update Keycloak',
      author: { name: 'you', user: { login: 'you' } },
      file: { oid: second.files.get(path) },
    })
    expect(page1.pageInfo.hasNextPage).toBe(true)
    const page2 = (
      await gql(fake, history, { rev: third.oid, path, after: page1.pageInfo.endCursor })
    ).data.repository.object.history
    expect(page2.nodes.map((n: { oid: string }) => n.oid)).toEqual([first.oid])
    expect(page2.pageInfo).toEqual({ hasNextPage: false, endCursor: expect.any(String) })
    // From an older commit, later ones are not part of the history.
    const old = (await gql(fake, history, { rev: second.oid, path })).data.repository.object
    expect(old.history.nodes.map((n: { oid: string }) => n.oid)).toEqual([second.oid, first.oid])
  })

  it('does not follow a file across a move', async () => {
    const repo = fake.repo('you/engineering')
    const moved = await repo.commit({
      message: 'Move',
      additions: [{ path: 'keycloak.md', contents: '# Keycloak\n\nRealms and clients.\n' }],
      deletions: ['identity/keycloak.md'],
    })
    const res = (await gql(fake, history, { rev: moved.oid, path: 'keycloak.md' })).data.repository
      .object.history
    expect(res.nodes.map((n: { oid: string }) => n.oid)).toEqual([moved.oid])
  })
})

describe('GET git/blobs (images and other binary files)', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 255, 128])

  beforeEach(async () => {
    await fake.repo('you/engineering').commit({
      message: 'image',
      additions: [{ path: 'assets/dot.png', contents: png }],
    })
  })

  it('returns the raw bytes with the raw media type', async () => {
    const sha = await gitBlobSha(png)
    const res = await request(fake, 'GET', `/repos/you/engineering/git/blobs/${sha}`, {
      headers: { Accept: 'application/vnd.github.raw+json' },
    })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('application/octet-stream')
    expect(res.body).toEqual(png)
    expect(fake.log.at(-1)).toMatchObject({ kind: 'blob', status: 200 })
  })

  it('returns base64 JSON by default, as GitHub does', async () => {
    const sha = await gitBlobSha(png)
    const res = await request(fake, 'GET', `/repos/you/engineering/git/blobs/${sha}`)
    const body = JSON.parse(res.body!)
    expect(body).toMatchObject({ sha, size: png.byteLength, encoding: 'base64' })
    expect(Uint8Array.from(atob(body.content.replace(/\n/g, '')), (c) => c.charCodeAt(0))).toEqual(
      png,
    )
  })

  it('answers 404 for an unknown SHA, or a repository the token cannot see', async () => {
    const sha = await gitBlobSha(png)
    expect(
      (await request(fake, 'GET', `/repos/you/engineering/git/blobs/${'0'.repeat(40)}`)).status,
    ).toBe(404)
    expect(
      (await request(fake, 'GET', `/repos/you/engineering/git/blobs/${sha}`, { token: null }))
        .status,
    ).toBe(404)
  })
})

describe('GraphQL: createCommitOnBranch', () => {
  const mutation = `mutation($input: CreateCommitOnBranchInput!) {
    createCommitOnBranch(input: $input) { commit { oid } }
  }`
  const input = (expectedHeadOid: string, extra: object = {}) => ({
    input: {
      branch: { repositoryNameWithOwner: 'you/engineering', branchName: 'main' },
      expectedHeadOid,
      message: { headline: 'Edit from Yeraz' },
      fileChanges: {
        additions: [
          { path: 'identity/keycloak.md', contents: b64('# Keycloak (IdP)\n\nÉdité.\n') },
        ],
        deletions: [{ path: 'a-b.md' }],
      },
      ...extra,
    },
  })

  it('applies additions and deletions in one commit and moves the head', async () => {
    const repo = fake.repo('you/engineering')
    const before = repo.head!.oid
    const res = await gql(fake, mutation, input(before))
    expect(res.errors).toBeUndefined()
    expect(res.data.createCommitOnBranch.commit.oid).toBe(repo.head!.oid)
    expect(repo.head!.parent).toBe(before)
    expect(repo.read('identity/keycloak.md')).toBe('# Keycloak (IdP)\n\nÉdité.\n')
    expect(repo.read('a-b.md')).toBeUndefined()
    // The SHA the app computes locally after a commit is the one the next listing reports.
    const tree = JSON.parse(
      (await request(fake, 'GET', '/repos/you/engineering/git/trees/main?recursive=1')).body!,
    )
    const entry = tree.tree.find((e: { path: string }) => e.path === 'identity/keycloak.md')
    expect(entry.sha).toBe(await gitBlobSha('# Keycloak (IdP)\n\nÉdité.\n'))
  })

  it('refuses a stale expectedHeadOid instead of overwriting', async () => {
    const repo = fake.repo('you/engineering')
    const stale = repo.head!.oid
    await repo.commit({
      message: 'other device',
      additions: [{ path: 'cloud/gcp.md', contents: '# GCP\n' }],
    })
    const res = await gql(fake, mutation, input(stale))
    expect(res.data.createCommitOnBranch).toBeNull()
    expect(res.errors![0]).toMatchObject({
      type: 'STALE_DATA',
      message: `Expected branch to point to "${stale}" but it did not. Pull and try again.`,
    })
    expect(repo.read('a-b.md')).toBe('# Sorting\n')
  })

  it('simulates another device pushing first with the pushBeforeNextCommit fault', async () => {
    const repo = fake.repo('you/engineering')
    fake.faults.pushBeforeNextCommit = {
      message: 'phone',
      additions: [{ path: 'identity/keycloak.md', contents: '# Keycloak\n\nFrom the phone.\n' }],
    }
    const res = await gql(fake, mutation, input(repo.head!.oid))
    expect(res.errors![0]!.type).toBe('STALE_DATA')
    expect(repo.read('identity/keycloak.md')).toBe('# Keycloak\n\nFrom the phone.\n')
    expect(fake.faults.pushBeforeNextCommit).toBeNull()
  })

  it('rejects deleting a missing file, and committing to an empty repository', async () => {
    const repo = fake.repo('you/engineering')
    const res = await gql(
      fake,
      mutation,
      input(repo.head!.oid, { fileChanges: { deletions: [{ path: 'nope.md' }] } }),
    )
    expect(res.errors![0]!.message).toContain('does not exist')
    await fake.addRepo('you/empty')
    const empty = await gql(fake, mutation, {
      input: {
        ...input('x').input,
        branch: { repositoryNameWithOwner: 'you/empty', branchName: 'main' },
      },
    })
    expect(empty.errors![0]!.type).toBe('NOT_FOUND')
  })
})

describe('POST /user/repos', () => {
  it('creates a public repository unless private is set, and refuses duplicates', async () => {
    const res = await request(fake, 'POST', '/user/repos', { body: { name: 'notes' } })
    expect(res.status).toBe(201)
    expect(JSON.parse(res.body!)).toMatchObject({
      full_name: 'you/notes',
      private: false,
      default_branch: 'main',
    })
    expect(fake.repo('you/notes').head).toBeNull()

    const priv = await request(fake, 'POST', '/user/repos', {
      body: { name: 'diary', private: true, auto_init: true },
    })
    expect(JSON.parse(priv.body!).private).toBe(true)
    expect(fake.repo('you/diary').read('README.md')).toBe('# diary\n')

    const dup = await request(fake, 'POST', '/user/repos', { body: { name: 'notes' } })
    expect(dup.status).toBe(422)
  })

  it('requires a token', async () => {
    expect(
      (await request(fake, 'POST', '/user/repos', { body: { name: 'x' }, token: null })).status,
    ).toBe(401)
  })
})

describe('PATCH /repos/{owner}/{name}', () => {
  it('renames a repository: known by its new name, refusing a taken one, needing a token', async () => {
    await fake.addRepo('you/notes', { 'a.md': '# A\n' })
    await fake.addRepo('you/taken')
    const res = await request(fake, 'PATCH', '/repos/you/notes', { body: { name: 'journal' } })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body!)).toMatchObject({ name: 'journal', full_name: 'you/journal' })
    expect(fake.repo('you/journal').read('a.md')).toBe('# A\n')
    expect(() => fake.repo('you/notes')).toThrow()
    expect(
      (await request(fake, 'PATCH', '/repos/you/journal', { body: { name: 'taken' } })).status,
    ).toBe(422)
    expect(
      (await request(fake, 'PATCH', '/repos/you/journal', { body: { name: 'x' }, token: null }))
        .status,
    ).toBe(401)
    expect((await request(fake, 'PATCH', '/repos/you/gone', { body: { name: 'x' } })).status).toBe(
      404,
    )
  })
})

describe('faults and protocol', () => {
  it('fails as a network error when offline, and logs the attempt', async () => {
    fake.faults.offline = true
    await expect(
      request(fake, 'GET', '/repos/you/engineering/git/trees/main'),
    ).rejects.toBeInstanceOf(NetworkError)
    expect(fake.log.at(-1)).toMatchObject({ kind: 'tree', failed: 'offline' })
  })

  it('answers 500 when the server-error fault is on', async () => {
    fake.faults.serverError = true
    expect((await request(fake, 'GET', '/repos/you/engineering/git/trees/main')).status).toBe(500)
  })

  it('waits for the configured latency', async () => {
    fake.faults.latencyMs = 30
    const start = performance.now()
    await request(fake, 'GET', '/repos/you/engineering/git/trees/main')
    expect(performance.now() - start).toBeGreaterThanOrEqual(25)
  })

  it('answers CORS pre-flights without logging them', async () => {
    const res = await request(fake, 'OPTIONS', '/graphql', { token: null })
    expect(res.status).toBe(204)
    expect(res.headers['access-control-allow-headers']).toContain('If-None-Match')
    expect(fake.log).toHaveLength(0)
  })

  it('answers 404 to endpoints the app does not use', async () => {
    expect((await request(fake, 'GET', '/repos/you/engineering/contents/a-b.md')).status).toBe(404)
    expect(fake.log.at(-1)!.kind).toBe('unknown')
  })
})
