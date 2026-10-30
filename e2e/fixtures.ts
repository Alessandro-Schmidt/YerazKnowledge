// Every end-to-end test gets its own fake GitHub, served over real HTTP by a server that
// lives as long as the Playwright worker. The app finds it through window.__YERAZ_API__,
// which only VITE_E2E=1 builds read (src/github/endpoint.ts).

import { expect, test as base, type Page } from '@playwright/test'
import { buildGraph, type Graph } from '../src/model/graph'
import { parseLeaf } from '../src/model/parse'
import { buildTree } from '../src/model/tree'
import { createFakeGitHub, type FakeGitHub } from '../test/fake-github/fakeGitHub'
import { makeFixture, type Fixture } from '../test/fake-github/fixture'
import { startFakeServer, type FakeServer } from '../test/fake-github/server'
// Brings in the window.__YERAZ_API__ declaration.
import type {} from '../src/github/endpoint'

export const TOKEN = 'fake-token'
/** A second token the fake accepts: for changing the one in use. */
export const TOKEN2 = 'fake-token-2'

interface Fixtures {
  /** Leaves in the you/engineering fixture. */
  leaves: number
  fixture: Fixture
  fake: FakeGitHub
  api: string
  /** The same graph the app builds, for checking what the screen shows. */
  graph: Graph
  /** What the build's Content-Security-Policy blocked; a test fails on any, unless it turns this off. */
  strictCsp: boolean
  cspViolations: string[]
}

export const test = base.extend<Fixtures, { fakeServer: FakeServer }>({
  leaves: [300, { option: true }],

  fakeServer: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const server = await startFakeServer()
      await use(server)
      await server.close()
    },
    { scope: 'worker' },
  ],

  fixture: async ({ leaves }, use) => {
    await use(
      makeFixture({ name: 'Engineering', leaves, threads: Math.round(leaves * 1.5), seed: 7 }),
    )
  },

  fake: async ({ fixture }, use) => {
    const fake = createFakeGitHub({ login: 'you', tokens: [TOKEN, TOKEN2] })
    await fake.addRepo('you/engineering', fixture.files)
    await use(fake)
  },

  graph: async ({ fixture }, use) => {
    const model = buildTree(
      Object.entries(fixture.files).map(([path, text]) => ({
        path,
        type: 'blob' as const,
        sha: path,
        size: text.length,
      })),
    )
    await use(
      buildGraph(
        model,
        new Map(model.leaves.map((p) => [p, parseLeaf(fixture.files[p]!)])),
        'Engineering',
      ),
    )
  },

  strictCsp: [true, { option: true }],

  // Something the app needs that the policy (vite.config.ts) leaves out would break only in
  // production, quietly: every test fails on it instead.
  cspViolations: [
    async ({ context, strictCsp }, use) => {
      const seen: string[] = []
      await context.exposeBinding('__yerazCsp', (_source, v: string) => void seen.push(v))
      await context.addInitScript(() =>
        document.addEventListener('securitypolicyviolation', (e) =>
          (window as unknown as { __yerazCsp(v: string): void }).__yerazCsp(
            `${e.effectiveDirective} ${e.blockedURI}`,
          ),
        ),
      )
      await use(seen)
      if (strictCsp) expect(seen, 'Content-Security-Policy violations').toEqual([])
    },
    { auto: true },
  ],

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

/** Signs in on the token screen and waits for the app to open on the Family. */
export async function signIn(page: Page) {
  await page.goto('./')
  await signInHere(page)
  await page.locator('[data-map]').waitFor()
}

/** Opens the Family menu in the top bar: the Families, repositories, Appearance, sign out. */
export async function familyMenu(page: Page) {
  await page.getByRole('button', { name: 'Families' }).click()
  return page.getByRole('menu', { name: 'Families' })
}

/** Signs in on whatever URL the page is at; the app then shows that route. */
export async function signInHere(page: Page) {
  await page.getByRole('button', { name: 'GitHub', exact: true }).click()
  await page.getByLabel('Personal access token').fill(TOKEN)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('heading', { name: 'Connect GitHub' }).waitFor({ state: 'detached' })
}

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) <= 640

export { expect } from '@playwright/test'
