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

// The browser's chrome in the app's colour from the first paint; ui/theme.ts then keeps this
// tag on the saved theme. The value is the theme's, so no colour is written in the source.
function themeColor(): Plugin {
  return {
    name: 'yeraz:theme-color',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { name: 'theme-color', content: themes.bases.vanta.tokens.top },
        injectTo: 'head',
      },
    ],
  }
}

/** The app icons' version, in their addresses: the leaf (PR #78) replaced the Y. */
const ICONS = 'leaf'

// Files only Mermaid loads (its diagram types and layout engines, ~5 MB): the chunks the app
// reaches only through read/mermaid.ts. They aren't precached, so installing the app doesn't
// download them; they are cached the first time a leaf has a diagram.
const mermaidOnly = new Set<string>()
function mermaidChunks(): Plugin {
  return {
    name: 'yeraz:mermaid-chunks',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = new Map(
        Object.values(bundle).flatMap((c) => (c.type === 'chunk' ? [[c.fileName, c]] : [])),
      )
      const reached = new Set<string>()
      const visit = (file: string) => {
        const chunk = chunks.get(file)
        if (!chunk || reached.has(file) || chunk.facadeModuleId?.endsWith('/src/read/mermaid.ts'))
          return
        reached.add(file)
        for (const next of [...chunk.imports, ...chunk.dynamicImports]) visit(next)
      }
      for (const chunk of chunks.values()) if (chunk.isEntry) visit(chunk.fileName)
      for (const file of chunks.keys()) if (!reached.has(file)) mermaidOnly.add(file)
    },
  }
}

export default defineConfig(({ mode }) => ({
  // Relative asset paths: the same dist/ works on GitHub Pages (under /<repo>/) and in Tauri.
  base: './',
  plugins: [
    react(),
    themeColor(),
    mode === 'fake' && mockServiceWorker(),
    mermaidChunks(),
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
          // `?v=` changes with the artwork (ICONS in index.html too): an installed app keeps
          // the icons it was installed with until their addresses change.
          icons: [
            {
              src: `icons/pwa-192.png?v=${ICONS}`,
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `icons/pwa-512.png?v=${ICONS}`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `icons/pwa-maskable-192.png?v=${ICONS}`,
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: `icons/pwa-maskable-512.png?v=${ICONS}`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2}'],
          // The icons' `?v=` (ICONS) still finds them in the offline cache.
          ignoreURLParametersMatching: [/^v$/],
          // The flags font (ui/flags.ts) is only for systems without flags: not every install.
          globIgnores: ['**/noto-flags.woff2'],
          manifestTransforms: [
            (entries) => ({
              manifest: entries.filter((e) => !mermaidOnly.has(e.url)),
              warnings: [],
            }),
          ],
          runtimeCaching: [
            {
              // The app's own scripts not precached: Mermaid's, named by their content.
              urlPattern: ({ sameOrigin, url }) => sameOrigin && url.pathname.endsWith('.js'),
              handler: 'CacheFirst',
              options: { cacheName: 'diagrams', expiration: { maxEntries: 300 } },
            },
          ],
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
