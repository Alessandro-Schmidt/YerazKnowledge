# Yeraz

Notes as Markdown in the user's own GitHub repositories; the main screen is a map of them.
Read `ideas.txt` (why), `ARCHITECTURE.md` (how), `development-plan.md` (what, in what order).
**Current milestone: M3** (threads and rich content) built; waiting on the owner's review. Next: M4.

## Commands

- `npm run dev` — the app; `npm run dev:fake` — the app against the in-memory fake GitHub (no token)
- `npm test` — Vitest (unit + integration); `npm run e2e` — Playwright on the production build
- `npm run typecheck` · `npm run lint` · `npm run format` · `npm run build` · `npm run size`
- `npm run fixture -- --leaves 1000 --threads 1500 --seed 7` — write a fixture Tree to `fixtures-out/`
- `npm run perf` — budget tests on the 1,000-leaf fixture, laptop and 4× throttled phone (§7.4)
- `npm run visual` — the app in the states of `design/screens/01–07`, with the design's Trees, into `visual-review/`
- `npm run tauri dev` / `npm run tauri build` — the desktop app (needs Rust); a `v*` tag builds installers in CI (`release.yml`)

## Where things live (ARCHITECTURE.md §12)

- `src/model/` pure logic, no DOM/network: `parse.ts`, `tree.ts`, `graph.ts` (titles, totals, threads), `sha.ts`
- `src/github/` `client.ts` (fetch, ETag, errors) · `graphql.ts` (blobs, discover, lookup)
- `src/store/db.ts` key/value (IndexedDB or memory) · `session.ts` the Zustand store, pending edits, autosave
- `src/sync/` `pull.ts` read · `push.ts` commit · `merge.ts` three-way · `autosave.ts` · `structure.ts` (new/move/delete plans) · `overlay.ts` · `assets.ts` (images: fetch by SHA, name)
- `src/editor/` CodeMirror 6 (lazy chunk): `Editor.tsx`, `livePreview.ts`, `EditorPage.tsx` (`#/edit/...`), `mentions.ts`, `insertMenu.ts`, `images.ts`
- `src/map/` `layout.ts` (pure, d3) · `TreeMap.tsx` · `HomeMap.tsx` · `Home.tsx` · `useZoom.ts`
- `src/read/` `render.ts` (markdown-it, lazy) · `Peek.tsx` · `src/ui/` App, TreeView, Explorer, TokenScreen,
  theme (saved per device in `localStorage`, applied before paint by `index.html`), Appearance (`#/settings/appearance`)
- Map rule: React draws geometry once per layout; selection, zoom level and layers are data
  attributes or the selection layer, never a React render of the map
- `test/fake-github/` the fake: `fakeGitHub.ts` (handler), `graphql.ts`, `repo.ts`, `fixture.ts`,
  adapters `msw.ts` (Vitest, dev:fake), `server.ts` (e2e, real HTTP), `browser.ts` (dev:fake)
- `e2e/` Playwright specs; `e2e/fixtures.ts` gives each test its own `fake` and `api` URL.
  The app must reach GitHub through `githubApi()` (`src/github/endpoint.ts`), never a literal URL.
- `design/` is the visual source of truth; `design/themes/themes.json` holds every colour

## Rules

- **Tests first, against the fake.** Never call real GitHub from unit, integration or e2e tests.
- **No colours outside `themes.json`.** Use `var(--token)`. `src/ui/theme.test.ts` fails on any hex or
  colour function in `src/` (test files exempt).
- Least code wins; a new dependency needs a one-line reason in the commit message. Pin exact versions.
- Don't build ahead of the current milestone. When plan and reality disagree, stop and ask.
- Scripted find-and-replace edits must assert that they matched: Prettier reflows code, and a silent
  no-op has shipped bugs here before.
- The fake implements only what the app uses. If the app needs a new endpoint or field, add it to
  the fake with a test first.

## Repository format (the contract, ARCHITECTURE.md §4)

- [ ] A leaf is a `.md` file; line 1 is the title (`# 🔐 Keycloak`, leading emoji = icon)
- [ ] Optional line 2: `<!-- yeraz {...} -->` metadata; colours are names (`"amber"`), not hex
- [ ] Sub-leaves live in a sibling folder with the same name (`keycloak.md` + `keycloak/`)
- [ ] A branch is a folder without a same-named `.md`; its name is the folder name, as typed
- [ ] Threads are root-relative Markdown links (`[Keycloak](/identity/keycloak.md)`)
- [ ] Images in `/assets/`; `.yeraz.json` marks the root; filenames never change on retitle
- [ ] Embeds: a paragraph of one link to YouTube or `/assets/*.pdf|mp4|webm` (subtitles `name.<lang>.vtt`); math `$…$`, `$$…$$`

## Budgets (ARCHITECTURE.md §11)

Reopen cached 1k-leaf Tree < 800 ms laptop / 1.5 s phone · first open structure < 1 s, content < 5 s ·
pan/zoom 60 fps at 2k nodes · select < 50 ms · keystroke < 16 ms · 1 request per commit ·
first-load JS < 200 KB gzip (`npm run size`) · theme switch < 50 ms, no React render.
