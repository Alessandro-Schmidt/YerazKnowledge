/// <reference types="vitest/config" />
import { createReadStream } from 'node:fs'
import { createRequire } from 'node:module'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import themes from './design/themes/themes.json'

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
  plugins: [
    react(),
    mode === 'fake' && mockServiceWorker(),
    // Installable, and the app shell works offline; data is offline already in IndexedDB
    // (ARCHITECTURE.md §10). Not in dev:fake, where MSW's worker answers GitHub.
    mode !== 'fake' &&
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'favicon.ico', 'brand/*.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'Yeraz',
          short_name: 'Yeraz',
          description: 'Your notes as a map, kept in your own GitHub repositories.',
          start_url: './',
          scope: './',
          display: 'standalone',
          // The icon's tile, so the splash screen matches the icon (development-plan.md M4).
          background_color: '#000000',
          theme_color: themes.bases.vanta.tokens.top,
          icons: [
            { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: 'icons/pwa-maskable-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: 'icons/pwa-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2}'],
          navigateFallback: 'index.html',
          // KaTeX and the language parsers are lazy chunks; cache them too.
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        },
      }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
  },
}))
