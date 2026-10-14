import { afterAll, beforeAll, expect, it } from 'vitest'
import { createFakeGitHub } from './fakeGitHub'
import { startFakeServer, type FakeServer } from './server'

let server: FakeServer
let api: string
const fake = createFakeGitHub()
const headers = { Authorization: 'Bearer t' }

beforeAll(async () => {
  server = await startFakeServer()
  await fake.addRepo('you/engineering', { '.yeraz.json': '{}', 'a.md': '# A\n' })
  api = server.register(fake)
})
afterAll(() => server.close())

it('serves the fake over HTTP, with real ETags and 304s', async () => {
  const url = `${api}/repos/you/engineering/git/trees/main?recursive=1`
  const first = await fetch(url, { headers })
  expect(first.status).toBe(200)
  expect(((await first.json()) as { tree: unknown[] }).tree).toHaveLength(2)
  const second = await fetch(url, {
    headers: { ...headers, 'If-None-Match': first.headers.get('etag')! },
  })
  expect(second.status).toBe(304)
})

it('passes POST bodies through to GraphQL', async () => {
  const res = await fetch(`${api}/graphql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: '{ viewer { login } }' }),
  })
  expect(await res.json()).toEqual({ data: { viewer: { login: 'you' } } })
})

it('answers CORS pre-flights', async () => {
  const res = await fetch(`${api}/graphql`, { method: 'OPTIONS' })
  expect(res.status).toBe(204)
  expect(res.headers.get('access-control-allow-headers')).toContain('Authorization')
})

it('drops the connection when the fake is offline', async () => {
  fake.faults.offline = true
  await expect(fetch(`${api}/graphql`, { method: 'POST', headers, body: '{}' })).rejects.toThrow(
    TypeError,
  )
  fake.faults.offline = false
})

it('keeps fakes apart and forgets unregistered ones', async () => {
  const other = createFakeGitHub({ login: 'someone' })
  const otherApi = server.register(other)
  expect(otherApi).not.toBe(api)
  server.unregister(otherApi)
  expect((await fetch(`${otherApi}/graphql`, { method: 'POST', headers, body: '{}' })).status).toBe(
    404,
  )
})
