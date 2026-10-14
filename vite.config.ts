/// <reference types="vitest/config" />
import { createReadStream } from 'node:fs'
import { createRequire } from 'node:module'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Serves MSW's worker script in `--mode fake` only, so it never ships in dist/.
function mockServiceWorker(): Plugin {
  const file = createRequire(import.meta.url).resolve('msw/mockServiceWorker.js')
  return {
    name: 'yeraz:mock-service-worker',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/mockServiceWorker.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript')
        createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  // Relative asset paths: the same dist/ works on GitHub Pages (under /<repo>/) and in Tauri.
  base: './',
  plugins: [react(), mode === 'fake' && mockServiceWorker()],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
  },
}))
