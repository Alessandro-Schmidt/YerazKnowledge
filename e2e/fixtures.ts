// Every end-to-end test gets its own fake GitHub, wired in through page.route.

import { test as base } from '@playwright/test'
import { createFakeGitHub, type FakeGitHub } from '../test/fake-github/fakeGitHub'
import { makeFixture } from '../test/fake-github/fixture'
import { routeFakeGitHub } from '../test/fake-github/playwright'

export const test = base.extend<{ fake: FakeGitHub }>({
  fake: async ({ context }, use) => {
    const fake = createFakeGitHub({ login: 'you' })
    await fake.addRepo(
      'you/engineering',
      makeFixture({ name: 'Engineering', leaves: 300, threads: 450, seed: 7 }).files,
    )
    await routeFakeGitHub(context, fake)
    await use(fake)
  },
})

export { expect } from '@playwright/test'
