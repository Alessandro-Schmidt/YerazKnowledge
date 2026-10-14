// The MSW adapter with real fetch: what the app's github/ client will see in Vitest.

import { setupServer } from 'msw/node'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createFakeGitHub } from './fakeGitHub'
import { makeFixture } from './fixture'
import { fakeGitHubHandlers } from './msw'

const fake = createFakeGitHub()
const server = setupServer(...fakeGitHubHandlers(fake))
const headers = { Authorization: 'Bearer t' }

beforeAll(async () => {
  await fake.addRepo('you/engineering', makeFixture({ leaves: 300, threads: 450, seed: 7 }).files)
  server.listen({ onUnhandledRequest: 'error' })
})
afterAll(() => server.close())

it('serves a 300-leaf fixture, then a free 304 on reopen', async () => {
  const url = 'https://api.github.com/repos/you/engineering/git/trees/main?recursive=1'
  const first = await fetch(url, { headers, cache: 'no-store' })
  expect(first.status).toBe(200)
  const body = (await first.json()) as { tree: { path: string }[] }
  expect(body.tree.filter((e) => e.path.endsWith('.md'))).toHaveLength(300)

  fake.resetLog()
  const etag = first.headers.get('etag')!
  const second = await fetch(url, {
    headers: { ...headers, 'If-None-Match': etag },
    cache: 'no-store',
  })
  expect(second.status).toBe(304)
  expect(fake.log).toHaveLength(1)
  expect(fake.log[0]).toMatchObject({ status: 304, blobs: 0 })
})

it('turns the offline fault into a failed fetch', async () => {
  fake.faults.offline = true
  await expect(
    fetch('https://api.github.com/graphql', { method: 'POST', headers, body: '{}' }),
  ).rejects.toThrow(TypeError)
  fake.faults.offline = false
})
