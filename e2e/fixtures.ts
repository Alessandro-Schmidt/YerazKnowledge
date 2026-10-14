// Every end-to-end test gets its own fake GitHub, served over real HTTP by a server that
// lives as long as the Playwright worker. The app finds it through window.__YERAZ_API__,
// which only VITE_E2E=1 builds read (src/github/endpoint.ts).

import { test as base } from '@playwright/test'
import { createFakeGitHub, type FakeGitHub } from '../test/fake-github/fakeGitHub'
import { makeFixture } from '../test/fake-github/fixture'
import { startFakeServer, type FakeServer } from '../test/fake-github/server'
// Brings in the window.__YERAZ_API__ declaration.
import type {} from '../src/github/endpoint'

export const test = base.extend<{ fake: FakeGitHub; api: string }, { fakeServer: FakeServer }>({
  fakeServer: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const server = await startFakeServer()
      await use(server)
      await server.close()
    },
    { scope: 'worker' },
  ],

  // eslint-disable-next-line no-empty-pattern
  fake: async ({}, use) => {
    const fake = createFakeGitHub({ login: 'you' })
    await fake.addRepo(
      'you/engineering',
      makeFixture({ name: 'Engineering', leaves: 300, threads: 450, seed: 7 }).files,
    )
    await use(fake)
  },

  api: [
    async ({ fake, fakeServer, context }, use) => {
      const api = fakeServer.register(fake)
      await context.addInitScript((url) => {
        window.__YERAZ_API__ = url
      }, api)
      await use(api)
      fakeServer.unregister(api)
    },
    { auto: true },
  ],
})

export { expect } from '@playwright/test'
