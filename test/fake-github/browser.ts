// `npm run dev:fake`: the app talks to an in-memory GitHub in the browser, no token needed.

import { setupWorker } from 'msw/browser'
import { createFakeGitHub, type FakeGitHub } from './fakeGitHub'
import { designTrees } from './designFixture'
import { makeFixture } from './fixture'
import { fakeGitHubHandlers } from './msw'

declare global {
  interface Window {
    /** The running fake, for poking at it from the console. */
    __yerazFake?: FakeGitHub
  }
}

export const FAKE_TOKEN = 'fake-token'

export async function startFakeGitHub(): Promise<FakeGitHub> {
  const fake = createFakeGitHub({ login: 'you' })
  // Added oldest first: Home lists the most recently updated first, as in the design.
  await fake.addRepo('you/dotfiles', { 'README.md': '# dotfiles\n' }) // not a Tree: no .yeraz.json
  await fake.addRepo(
    'you/fixture-300',
    makeFixture({ name: 'Fixture 300', leaves: 300, threads: 450, seed: 7 }).files,
  )
  for (const tree of designTrees().reverse()) await fake.addRepo(tree.repo, tree.files)

  await setupWorker(...fakeGitHubHandlers(fake)).start({
    onUnhandledRequest: 'bypass',
    quiet: true,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  })
  window.__yerazFake = fake
  console.info(
    "[yeraz] Fake GitHub running: the design's four Trees and you/fixture-300 (300 leaves)",
  )
  return fake
}
