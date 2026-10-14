// Playwright adapter for end-to-end tests. It answers from Node with page.route, so
// no service worker is involved (the app's own PWA worker comes in M4).

import type { BrowserContext, Page } from '@playwright/test'
import { NetworkError, type FakeGitHub } from './fakeGitHub'

export async function routeFakeGitHub(
  target: Page | BrowserContext,
  fake: FakeGitHub,
): Promise<void> {
  await target.route('https://api.github.com/**', async (route) => {
    const req = route.request()
    try {
      const res = await fake.handle({
        method: req.method(),
        url: req.url(),
        headers: await req.allHeaders(),
        body: req.postData(),
      })
      await route.fulfill({ status: res.status, headers: res.headers, body: res.body ?? '' })
    } catch (e) {
      if (e instanceof NetworkError) return route.abort('internetdisconnected')
      throw e
    }
  })
}
