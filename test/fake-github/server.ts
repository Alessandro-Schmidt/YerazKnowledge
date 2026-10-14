// The fake GitHub over real HTTP, for end-to-end tests. Each Playwright worker runs one
// server; each test registers its own fake under a path prefix, so tests stay isolated.
// Real HTTP means real CORS and real 304s in every browser engine (page.route can't
// fulfil a 304 in WebKit). Node only.

import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { NetworkError, type FakeGitHub } from './fakeGitHub'

export interface FakeServer {
  /** Serves `fake` and returns its API base URL, used in place of https://api.github.com. */
  register(fake: FakeGitHub): string
  unregister(apiBase: string): void
  close(): Promise<void>
}

async function readBody(req: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return chunks.length ? Buffer.concat(chunks).toString('utf8') : null
}

export async function startFakeServer(): Promise<FakeServer> {
  const fakes = new Map<string, FakeGitHub>()
  let next = 0

  const server = createServer(async (req, res) => {
    const match = /^\/(f\d+)(\/.*)$/.exec(req.url ?? '')
    const fake = match && fakes.get(match[1]!)
    if (!fake) {
      res.writeHead(404, { 'access-control-allow-origin': '*' }).end()
      return
    }
    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : (v ?? '')]),
    )
    try {
      const response = await fake.handle({
        method: req.method ?? 'GET',
        url: `https://api.github.com${match[2]}`,
        headers,
        body: await readBody(req),
      })
      res.writeHead(response.status, response.headers).end(response.body ?? undefined)
    } catch (e) {
      // Offline: drop the connection, so the browser's fetch rejects like a real network failure.
      if (e instanceof NetworkError) req.socket.destroy()
      else res.writeHead(500, { 'content-type': 'text/plain' }).end(String(e))
    }
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  return {
    register(fake) {
      const id = `f${next++}`
      fakes.set(id, fake)
      return `${origin}/${id}`
    },
    unregister(apiBase) {
      fakes.delete(apiBase.slice(origin.length + 1))
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}
