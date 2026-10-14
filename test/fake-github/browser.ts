// `npm run dev:fake`: the app talks to an in-memory GitHub in the browser, no token needed.

import { setupWorker } from 'msw/browser'
import { createFakeGitHub, type FakeGitHub } from './fakeGitHub'
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
  await fake.addRepo(
    'you/engineering',
    makeFixture({ name: 'Engineering', leaves: 300, threads: 450, seed: 7 }).files,
  )
  await fake.addRepo(
    'you/art-history',
    makeFixture({ name: 'Art History', color: 'amber', leaves: 34, threads: 40, seed: 11 }).files,
  )
  await fake.addRepo(
    'you/languages',
    makeFixture({ name: 'Languages', leaves: 22, threads: 20, seed: 13 }).files,
  )
  await fake.addRepo('you/dotfiles', { 'README.md': '# dotfiles\n' }) // not a Tree: no .yeraz.json

  await setupWorker(...fakeGitHubHandlers(fake)).start({
    onUnhandledRequest: 'bypass',
    quiet: true,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  })
  window.__yerazFake = fake
  console.info(
    '[yeraz] Fake GitHub running: you/engineering (300 leaves), you/art-history, you/languages',
  )
  return fake
}
