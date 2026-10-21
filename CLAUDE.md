# Yeraz

Notes as Markdown in the user's own GitHub repositories; the main screen is a map of them.
Read `ideas.txt` (why), `ARCHITECTURE.md` (how), `development-plan.md` (what, in what order).
**Current milestone: M4** (ship) built: every milestone of the plan is done. Left for the owner: the visual review, the manual checklist (development-plan.md §7.6), the contract-test secret, and a `v*` tag for the first installers.

## Commands

- `npm run dev` — the app; `npm run dev:fake` — the app against the in-memory fake GitHub (no token)
- `npm test` — Vitest (unit + integration); `npm run e2e` — Playwright on the production build
- `npm run typecheck` · `npm run lint` · `npm run format` · `npm run build` · `npm run size`
- `npm run fixture -- --leaves 1000 --threads 1500 --seed 7` — write a fixture Tree to `fixtures-out/`
- `npm run import -- <source> <new folder> [--name …]` — notes from Obsidian, Notion or any Markdown folder as a new Family (`src/import/convert.ts`, issue #39)
- `npm run perf` — budget tests on the 1,000-leaf fixture, laptop and 4× throttled phone (§7.4)
- `npm run visual` — the app in the states of `design/screens/01–07` and every view of `design/views/`, with the design's Trees, into `visual-review/`
- Visual snapshots (`e2e/visual.spec.ts`) run on demand in Playwright's Linux image: `gh workflow run snapshots.yml`
  compares them; after a visual change, `-f update=true` re-renders them: review its artifact, commit it to `e2e/visual.spec.ts-snapshots/`
- CI (`ci.yml`) is check + e2e (+ the desktop build when `src-tauri/` changes); deploy waits on check and e2e only.
  Visual snapshots and perf budgets are not in CI (owner's decision): run them before a change that could affect them
- `npm run tauri dev` / `npm run tauri build` — the desktop app (needs Rust); a `v*` tag builds installers in CI (`release.yml`)
- `npm run contract` — the build against real GitHub (needs `YERAZ_CONTRACT_TOKEN`, `YERAZ_CONTRACT_REPO`); nightly in CI

## Where things live (ARCHITECTURE.md §12)

- `src/model/` pure logic, no DOM/network: `parse.ts`, `tree.ts`, `graph.ts` (titles, totals, threads), `sha.ts`, `diff.ts`
- `src/github/` `client.ts` (fetch, ETag, errors) · `graphql.ts` (blobs, discover, lookup)
- `src/store/db.ts` key/value (IndexedDB or memory) · `session.ts` the Zustand store, pending edits, autosave
- `src/sync/` `pull.ts` read · `push.ts` commit · `merge.ts` three-way · `autosave.ts` · `structure.ts` (new/move/delete plans) · `overlay.ts` · `assets.ts` (images: fetch by SHA, name) · `folder.ts` (a Family in a folder: scan, write)
- `src/local/folder.ts` folders on this device (issue #64, ARCHITECTURE.md §5.6): File System Access API, or the desktop's
  commands (`src-tauri/src/folder.rs`), or on phones, Safari and Firefox the browser's own storage (`deviceFolders`); a folder Family's id is `~/<slug>`. Tests use `test/memoryFolder.ts`
- `src/editor/` CodeMirror 6 (lazy chunk): `Editor.tsx`, `livePreview.ts` (+ `metaLine.ts`: line 2 hidden, kept whole), `LeafEditor.tsx` (the leaf, edited in the Peek), `mentions.ts`, `insertMenu.ts`, `format.ts` (shortcuts, marks typed over a selection), `toolbar.ts` (touch: a bar above the keyboard), `steady.ts` (touch: the caret stays at eye level), `images.ts`, `emoji.ts`,
  `elements.ts` (an element's ⋯ menu, Markdown shown on request), `tables.ts` (tables as grids; `src/model/table.ts`)
- `src/map/` `layout.ts` (pure, d3) · `family.ts` (a Family's Trees, placed) · `families.ts` (every Family merged, ids
  `owner/name::path`; drawn by `ui/AllView.tsx` at `#/all`, the default `#/`) · `TreeMap.tsx` · `useZoom.ts`
- `src/views/` the other views (`design/views/`): `views.ts` (ids, saved per device), `ViewSwitcher.tsx`, `index.ts` (lazy chunks),
  `Canvas.tsx` (drawn views' stage: camera, selection layer), one file per view, pure layouts in `layout/`;
  Settings › Views (`ui/ViewsSettings.tsx`) and › Tree colours (`ui/TreeColours.tsx`, `.yeraz.json` `trees`)
- `src/read/` `render.ts` (markdown-it, lazy) · `Peek.tsx` · `History.tsx` (past versions, diff, restore) · `src/ui/` App, FamilyView, FamilyMenu, Start, Explorer, TokenScreen,
  theme (saved per device in `localStorage`, applied before paint by `index.html`), `panels.ts` + `ResizeHandle.tsx` (Explorer and Peek widths, per device), Appearance (`#/settings/appearance`),
  `customTheme.ts` + `ThemeEditor.tsx` (custom themes), `contrast.ts` (`readable` adjusts a failing colour)
- `themes/` community themes (each must pass every contrast rule as written) · `src/read/colors.ts` leaf colours
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
- [ ] Optional line 2: `<!-- yeraz {...} -->` metadata; colours are names (`"amber"`), not hex; `coverPosition` is % from the top;
  `icon` is an image icon (`/assets/…` or https, instead of the title's emoji); `iconPosition` is `center` or `right`
- [ ] Sub-leaves live in a sibling folder with the same name (`keycloak.md` + `keycloak/`)
- [ ] A branch is a folder without a same-named `.md`; its name is the folder name, as typed
- [ ] A branch's text is `README.md` in its folder (exact name): not a leaf, never renames the branch, but its
  line 1 emoji and line 2 are the branch's icon and look (a Tree's too); the root's `README.md` and one in a
  leaf's sibling folder stay leaves
- [ ] Threads are root-relative Markdown links (`[Keycloak](/identity/keycloak.md)`)
- [ ] An image's width ends its title: `![Realm](/assets/realm.png "width=50%")`, a percent of the column
- [ ] Images in `/assets/`; `.yeraz.json` marks the root (`name`, `color`, optional `trees`: `{"Identity":"amber"}`); filenames never change on retitle
- [ ] Embeds: a paragraph of one link to YouTube or `/assets/*.pdf|mp4|webm` (subtitles `name.<lang>.vtt`); math `$…$`, `$$…$$`

## Budgets (ARCHITECTURE.md §11)

Reopen cached 1k-leaf Tree < 800 ms laptop / 1.5 s phone · first open structure < 1 s, content < 5 s ·
pan/zoom 60 fps at 2k nodes · select < 50 ms · keystroke < 16 ms · 1 request per commit ·
first-load JS < 200 KB gzip (`npm run size`) · theme switch < 50 ms, no React render.
