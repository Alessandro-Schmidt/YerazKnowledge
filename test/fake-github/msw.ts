// MSW adapter: used by Vitest (msw/node) and by `npm run dev:fake` (msw/browser).

import { http, HttpResponse } from 'msw'
import { NetworkError, type FakeGitHub } from './fakeGitHub'

export function fakeGitHubHandlers(fake: FakeGitHub) {
  return [
    http.all('https://api.github.com/*', async ({ request }) => {
      try {
        const res = await fake.handle({
          method: request.method,
          url: request.url,
          headers: Object.fromEntries(request.headers),
          body: request.method === 'GET' || request.method === 'HEAD' ? null : await request.text(),
        })
        return new HttpResponse(res.body, { status: res.status, headers: res.headers })
      } catch (e) {
        if (e instanceof NetworkError) return HttpResponse.error()
        throw e
      }
    }),
  ]
}
