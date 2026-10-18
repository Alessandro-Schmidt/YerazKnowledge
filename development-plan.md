# Yeraz — Development plan

This is the plan Claude Code follows to build Yeraz. Read it after `ideas.txt` (why the app exists) and `ARCHITECTURE.md` (how it works). This file says **what to build, in what order, with which tools, and how to prove each step works.**

---

## 1. Ground rules

1. **The repository format in ARCHITECTURE.md §4 is a contract.** Tests lock it. Changing it needs the owner's approval.
2. **Least code wins.** Use the platform and the stack below. A new dependency needs a one-line reason in the commit message, and is rejected if 30 lines of our own code would do.
3. **Logic lives in pure modules.** `model/`, `map/layout.ts` and sync planning have no DOM and no network. They are unit-tested directly.
4. **Tests come first, against the fake GitHub (§5).** Never call real GitHub from unit, integration or end-to-end tests.
5. **Performance budgets are tests.** ARCHITECTURE.md §11 lists them; §7.4 below measures them. A change that breaks a budget is not done.
6. **Every milestone ends deployable.** CI is green and GitHub Pages serves the result.
7. **Don't build ahead.** If a feature belongs to a later milestone, leave it out.
8. **When the plan and reality disagree, stop and ask.** Then update this file.
9. **No hard-coded colours.** Every colour comes from a theme token generated from `design/themes/themes.json`. A test fails the build if a hex or `rgb()` value appears anywhere else in `src/`.

## 2. Stack

Pin exact versions when installing.

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript, `strict` | One language from UI to sync logic |
| UI | React 19 + Vite | Familiar to the owner; Vite gives the build, dev server, code splitting and CSS Modules |
| State | Zustand | One small store, no boilerplate |
| Routing | `wouter` with hash location | GitHub Pages can't rewrite URLs |
| Styling | CSS Modules + CSS variables generated from `design/themes/themes.json` | Themes and per-leaf colours are just variables; no CSS framework |
| Map | `d3-hierarchy`, `d3-shape`, `d3-zoom` (individual modules, not all of d3) | Radial layout, edge bundling, zoom and packing are built in |
| Editor | CodeMirror 6: `@codemirror/view`, `state`, `lang-markdown`, `language-data`, `autocomplete` | Edits Markdown text directly; fast on long documents |
| Read view | `markdown-it` + task lists + KaTeX (loaded on first use) | Small and fast; what a leaf prints as |
| Local storage | `idb-keyval` | IndexedDB as a key/value store, under 1 KB |
| Merging | `node-diff3` | Three-way merge for conflicts between devices |
| GitHub | Plain `fetch` | Only 2 REST endpoints and 3 GraphQL operations are used; Octokit would be bigger than the code it saves |
| PWA | `vite-plugin-pwa` | Manifest and service worker from configuration |
| Desktop | Tauri 2 + `tauri-apps/tauri-action` | Small installers for Windows, macOS and Linux from the same build |
| Fonts | Geist, Geist Mono and Newsreader (the serif reading font), self-hosted (Fontsource variable packages) | Works offline |
| Tests | Vitest, MSW, Playwright, `@axe-core/playwright`, `size-limit` | See §7 |

Not used, on purpose: Octokit, Tailwind, Redux, TipTap/ProseMirror, Shiki, Electron, any backend.

## 3. Design reference

### 3.0 Where the design lives

- **`design/screens/`** — screenshots of every screen at 2× pixel density (the phone at 3×). This is what the app must look like, and the visual tests compare against it.
- **`design/screens/source/`** — the source of each screen: HTML with the exact colours, sizes and copy. `Tree.dc.html` also contains working reference code for the map layout (`layoutTree()`), selection and dimming. Port the behaviour, not the code: the app builds the map with d3 (ARCHITECTURE.md §6).
- **`design/brand/`** — the logo and every app icon: SVG masters, all PNG, ICO and ICNS sizes, `draw.py`, which draws the SVG masters, and `export.py`, which renders everything else from them.
- **`design/themes/`** — `themes.json`, every colour of every theme (§3.4), and `check.py`, which verifies contrast for every combination.
- **`design/README.md`** — what each file shows and where each icon goes.
- **Links for the owner:** the design canvas (https://claude.ai/artifact/UWV7RLc2iLsYxB5Sde26c5) and the conversation where the design, the architecture and this plan were made (https://claude.ai/code/session_01LA2iepBJ3k2JUEstrXEcTD).
  - Both are private, and Claude Code can't open them.
  - The files in `design/` are the source of truth. If a screenshot and this plan disagree, ask the owner.

The sections below copy the values that matter most, so they can be used without opening the files.

### 3.1 Tokens

Values shown are the default theme: Vanta base, green accent. Every theme defines the same tokens (`design/themes/themes.json`).

| Token | Vanta value | Use |
|---|---|---|
| `--bg` | `#030303` | Page background (the "vantablack") |
| `--top` | `#050606` | Top bar |
| `--panel` | `#0A0B0B` | Explorer, Peek, floating controls |
| `--raised` | `#121514` | Selected rows, cover placeholder |
| `--hover` | `#101211` | Hovered rows and buttons |
| `--hair` / `--hair-strong` | `#1C1E1D` / `#2A2E2B` | Borders and dividers / button outlines |
| `--text` / `--text-body` | `#E8EAE6` / `#C9CEC9` | Main text / leaf body text |
| `--muted` / `--faint` | `#8D918C` / `#7D827C` | Secondary text / counts (both at least 4.5:1 on `--panel`) |
| `--node` / `--line` / `--core` | `#DCE3DE` / `#E8EAE6` / `#0B0D0C` | Map leaf dots / structure lines / the Tree's core |
| `--grid` / `--shadow` | `rgba(255,255,255,0.05)` / `rgba(0,0,0,0.6)` | Map dot grid / panel shadow |
| `--accent` | `#4BE3A0` | Headings ("text divisions"), threads, selection, focus rings |
| `--accent-soft` / `--on-accent` | `rgba(75,227,160,0.12)` / `#06140D` | @mention chips / text on accent buttons |

- **Type:** Geist for the interface, Geist Mono for paths, counts and shortcuts.
- **Radii:** 8–9 px for controls, 14 px for floating panels.
- **Icons:** stroke icons, 1.6 px, no emoji in the interface. Emoji appear only as leaf icons chosen by the user.
- **Logo:** a capital Y cut into six flat faces of brushed steel.
  - `design/brand/svg/yeraz-mark.svg` sits in the top bar, 22 px tall, next to the word "Yeraz" in Geist 600. On the light Paper base, use `yeraz-mark-light.svg` instead.
  - The logo has no colour of its own. Never tint it with the accent or recolour it with CSS; use the files as they are.
  - Favicon and app icons come from `design/brand/` (see `design/README.md`).
- **No raster images in the interface:** icons and the logo are SVG, so they stay sharp at every pixel density.

### 3.2 Screens

1. **Home — all Trees.** *Replaced (owner's request, after M4): the app opens straight into the Family view below, with every Tree of the repository on one map (ARCHITECTURE.md §5.3, §6). The design's screen 01 is out of date.*
2. **Family view** (was the Tree view).
   - **Top bar (56 px):** the Family's name (rename in place) with the Family menu (other Families, "Connect repository", "Create a new repository", Appearance, sign out), search, sync state, toggles for Explorer and Peek, "New leaf".
   - **Explorer (272 px, collapsible):**
     - Rows show a glyph (dot = leaf, ring = branch, dot with ring = leaf with sub-leaves), the name and the word count.
     - "New branch" and "New leaf" buttons at the bottom.
   - **Map:**
     - Layer toggles ("Branches", "Threads") top-left.
     - Zoom controls and the legend bottom-left.
   - **Peek panel (420 px):**
     - Floats over the map with a 16 px inset.
     - Header: kind, breadcrumb, expand and dismiss.
     - Body: cover, icon, title, metadata chips, content preview, sub-leaves, "Threads out" and "Threads in".
     - Footer: file path. A leaf is editable in the Peek itself, with no "Edit leaf" step (issue #17).
     - Expand turns it into a full page with a 760 px content column.
3. **Map only.** Explorer and Peek dismissed. Hovering a leaf shows a tooltip with words and threads. An optional panel, "Where you write most", shows word totals per branch.
4. **Phone (390 px wide).** The map fills the screen, zoomed in. The Peek becomes a bottom sheet with a handle, expand, dismiss and "Open leaf". All touch targets are at least 44 px.
5. **Settings › Appearance** (`design/screens/09`, `10`).
   - Base cards (Vanta, Graphite, Paper), each with a small live preview of the app in the current accent.
   - Accent swatches (green, amber, blue, violet), plus "Custom" (after launch).
   - Reading font cards (Geist, Newsreader).
   - Custom themes: "Create from current", "Import .json", "Export current" (after launch).
   - A live preview of a leaf and the map on the right.
   - Every change applies instantly to the whole app.

### 3.3 Map values from the design

Values below assume a layout radius `R`.

- **Rings:**
  - Depth rings at `0.35R`, `0.70R` and `R`.
  - The core circle at `0.125R`, showing the Tree name and total words.
  - Around the core, a donut with one segment per top-level branch, proportional to its words.
- **Node radius:**
  - Leaf: `2.4 + √words / 5.6`.
  - Branch: `4 + √(words inside) / 11`.
  - Scale both with zoom.
- **Gaps:** 0.16 rad between top-level branches.
- **Threads:** bundled curves with `beta` between 0.82 and 0.85. Unselected threads at 42 % opacity. When a leaf is selected, its threads go to 95 % at 2 px and the others drop to 10 %.
- **Selection:**
  - The selected leaf fills with the accent and gets a halo.
  - Its parent, children and thread ends stay bright; everything else dims to 30 %.
  - If the Peek is open, the camera pans so the selected leaf isn't hidden under it.
- **Labels:**
  - Placed outward from the centre, with a 4 px `--bg` halo (`paint-order: stroke`).
  - Branch labels are uppercase, 10.5 px, with 0.14 em letter spacing, in the accent colour.
  - Below 85 % zoom, leaf labels are hidden except the selected one.

### 3.4 Themes

The full rules are in ARCHITECTURE.md §13. In short:

- **Three layers, picked independently:** base (Vanta, Graphite, Paper), accent (green, amber, blue, violet) and reading font (Geist, Newsreader). The default is Vanta, green, Geist: the original design.
- **Applying a theme** means setting `data-base`, `data-mode` (`dark` or `light`), `data-accent` and `data-font` on `<html>`. `ui/theme.ts` generates the CSS for every value from `themes.json` once, at start-up.
- **Body text of leaves** gets the class `reading`, which is the only thing the reading font changes.
- **Leaf and Tree colours** are stored as names (`"amber"`), never as hex, so they follow the theme.
- **The choice is saved per device,** and applied by an inline script in `index.html` before the first paint, so the wrong theme never flashes.
- **Reference screens:**
  - `design/screens/11` — Graphite with blue;
  - `design/screens/12` — Paper with green and the serif font;
  - `design/screens/source/Tree.dc.html` — the same tree view, written entirely with the tokens.

## 4. How to start (first session)

1. **Write `CLAUDE.md`,** at most 60 lines. It holds:
   - commands (`dev`, `dev:fake`, `test`, `e2e`, `perf`, `build`);
   - the folder map from ARCHITECTURE.md §12;
   - the contract rules (ARCHITECTURE.md §4) as a checklist;
   - the budgets;
   - "tests first, against the fake".
2. **Scaffold:** a Vite React TypeScript app in the repository root.
   - `strict: true`, ESLint (typescript-eslint) and Prettier.
   - Vitest and Playwright installed and configured.
   - `ui/theme.ts` generating the theme CSS from `design/themes/themes.json` (§3.4). Only the default theme is used until M3, but the whole interface is built on the tokens from the first component.
   - The test that fails on hard-coded colours (§1, rule 9).
   - `public/favicon.svg`, `public/favicon.ico` and the top-bar logo from `design/brand/`.
3. **Build the fake GitHub before any feature** (§5). Every later test uses it, and it lets the app run without a token.
4. **Add CI** (§8) and deploy the empty shell to GitHub Pages.
5. Stop and report. Then start M1.

## 5. The fake GitHub

The fake GitHub lives in `test/fake-github/`.

### 5.1 The fake itself

**`fakeGitHub.ts`** is a pure function: `(request) → response`. It is backed by an in-memory repository holding:

- a map of `path → content`;
- a commit list and the head OID;
- an ETag per tree.

It implements exactly what the app uses, and nothing else:

1. `GET /repos/{o}/{r}/commits/{ref}` with the `vnd.github.sha` media type: the head commit SHA, with an ETag and `304`s (ARCHITECTURE.md §5.1).
2. `GET /repos/{o}/{r}/git/trees/{ref}?recursive=1`
   - Returns real git blob SHAs and ETags, and answers `304` to a matching `If-None-Match`.
   - Supports a `truncated` flag for the fallback test.
3. **GraphQL, blobs by OID:** aliased `object(oid:)` queries.
4. **GraphQL, `createCommitOnBranch`:** applies additions and deletions, and rejects a stale `expectedHeadOid` the way GitHub does.
5. **GraphQL, repository discovery:** repositories, plus the `.yeraz.json` marker check.
6. `POST /user/repos`.

It also keeps:

- **a request log,** so tests can assert things like "the second open made 1 request and fetched 0 blobs";
- **fault switches:** offline, 500 errors, slow responses, and another device pushing concurrently.

### 5.2 Adapters

- **MSW handlers,** used by Vitest and by `npm run dev:fake`.
- **A local HTTP server** (`server.ts`), used by end-to-end tests. Each Playwright worker runs one; each test registers its own fake under a path prefix. The app reaches it through `window.__YERAZ_API__`, which only builds made with `VITE_E2E=1` read (`src/github/endpoint.ts`); CI checks that production builds don't contain it.
  - Real HTTP gives real CORS and real `304`s in every engine. A `page.route` adapter was tried first, but Playwright can't fulfil a 3xx status in WebKit, so the Safari and iPhone runs couldn't reopen a Tree.
  - No service worker is involved, so nothing competes with the app's own (M4).

### 5.3 Fixture generator

`scripts/make-fixture.ts --leaves 1000 --threads 1500 --seed 7` builds a deterministic, realistic Tree:

- depth 1–4;
- word counts on a long-tailed distribution;
- some leaves with sub-leaves and some emoji icons;
- threads both within and across branches.

Generate the 100, 1,000 and 5,000-leaf fixtures from it.

## 6. Milestones

Each milestone lists its scope and its exit tests ("Done when").

### M0 — Foundation

Scope: §4 and §5, plus CI.

**Done when:**

- CI is green.
- GitHub Pages serves the empty shell (top bar on `--bg`).
- The hard-coded-colour test runs in CI.
- `npm run dev:fake` opens the app against a 300-leaf fixture with no token.

### M1 — Read-only Tree (the design comes alive)

1. **`model/parse.ts`:** title, emoji icon, line-2 metadata, word count and links. Edge cases to test:
   - missing title;
   - CRLF line endings;
   - multi-codepoint emoji (ZWJ sequences, flags);
   - links inside code blocks, which must be ignored.
2. **`model/tree.ts`:** paths → hierarchy, applying the sibling-folder rule. Tests for:
   - a branch;
   - a leaf;
   - a leaf with sub-leaves;
   - an empty folder;
   - a `.md` file with a same-named folder at the root.
3. **`model/sha.ts`:** must match `git hash-object` for ASCII, UTF-8 and CRLF fixtures.
4. **`github/`** client and the three operations used here; **`sync/pull.ts`** with the IndexedDB cache, reporting progress as it goes.
5. **Token screen.** Connect a repository by `owner/name` or from the discovered list.
6. **Home** (§3.2, screen 1).
7. **Tree view** (§3.2, screen 2):
   - Explorer;
   - Map with layout, bundling, zoom, semantic zoom, layer toggles, legend and selection;
   - Peek, read-only, with expand to a full read page and dismiss;
   - dismissing the Explorer.

**Done when:**

- **End-to-end:** opening the 300-leaf fixture shows the right number of nodes. Clicking a node opens the Peek with the correct title, sub-leaves, threads in and threads out. Expand and dismiss both work. The Explorer collapses.
- **Second open:** according to the fake's request log, exactly 1 request (a 304) and 0 blob fetches.
- **Performance:** the 1,000-leaf fixture is within the budgets for reopening, first open, pan and zoom, and selecting.
- **Visual review:** screenshots of Home, Tree view and Map only match `design/screens/01`–`06`, and the owner approves them.

### M2 — Writing and sync

1. **Editor route:**
   - CodeMirror 6 with live preview for headings, emphasis, lists, quotes, links, images, checkboxes and code;
   - a toggle to the source view;
   - a header with the title and an emoji icon picker.
2. **Structure editing:**
   - create a leaf (at the root by default, or in the selected branch) and create a branch;
   - add a sub-leaf, which creates the sibling folder;
   - rename a title, which never renames the file;
   - move a leaf, rewriting every backlink in the same commit;
   - delete, warning if other leaves link to it.
3. **Saving:**
   - the dirty store, and the three commit triggers (2 minutes idle, app hidden, Ctrl/Cmd+S);
   - `createCommitOnBranch`, with the blob SHA computed locally afterwards;
   - three-way merge, or keeping both versions on a real conflict.
4. **Sync state in the top bar:** "Synced", "Unsaved · pushes in m:ss", "Offline" or "Conflict".
5. **Create a Tree:** a new private repository with a `.yeraz.json` and a welcome leaf.

**Done when** (end-to-end, using Playwright's `page.clock`):

- Editing, then waiting 1:59, produces no commit. At 2:00 there is exactly one commit, containing only the changed file.
- Hiding the page commits immediately.
- An edit made offline survives a reload and is committed once the connection returns.
- **Two devices** (two browser contexts, one fake repository):
  - edits to different lines merge cleanly;
  - edits to the same lines produce a conflict file and a banner.
- Moving a leaf rewrites all backlinks in one commit.
- Unit tests cover the merge cases and the autosave timer.

### M3 — Threads and rich content

1. **Threads:**
   - `@` autocomplete, chips with icons, and click-through;
   - backlinks in the Peek;
   - after a save, the map gains or loses threads by re-parsing only the changed leaf.
2. **Insert menu:** holding Ctrl/Cmd for 2 s opens it; `/` and long-press open it on touch screens.
3. **Images:**
   - pick, paste or drop an image; it is saved in `assets/` at full quality and included in the next commit, following the image rules in ARCHITECTURE.md §8: unchanged up to 4096 px, larger photos scaled down to 4096 px;
   - private images are shown through blob URLs from the cache.
4. **Embeds:** math (KaTeX), syntax-highlighted code, YouTube, PDFs, and video with subtitle tracks. Each works both in the editor and in the read view.
5. **Leaf styling:** text and heading colours, chosen from the named colours, and a cover image (uploaded, or from Unsplash).
6. **Other repositories:**
   - links to other GitHub repositories render as repository cards;
   - threads between Trees appear on the Family map.
7. **Themes:**
   - the Appearance screen (§3.2, screen 5);
   - all three bases, four accents and two reading fonts;
   - the light logo on Paper;
   - the choice saved per device, with no flash on load.

**Done when:**

- Unit tests pass for finding and rewriting links, and line-2 metadata survives a round trip byte for byte.
- **Insert menu (end-to-end):**
  - holding for 1.9 s shows no menu, and 2.0 s shows it;
  - Ctrl+C and Ctrl+V never open it.
- **Mentions (end-to-end):** picking a mention inserts `[Title](/path.md)`, and after the save the map shows the new thread.
- **Images (end-to-end):**
  - a 1,200 px PNG screenshot is committed byte for byte;
  - a 6,000 px photo is committed at 4,096 px on its long edge;
  - both render sharp at pixel densities 2 and 3 (screenshot test).
- **Themes:**
  - the contrast test passes for all 12 base and accent combinations;
  - switching theme re-renders nothing (React Profiler shows zero commits);
  - after a reload the first painted frame already uses the saved theme;
  - the tree view in Graphite·blue and Paper·green·serif matches `design/screens/11` and `12`.

### M4 — Ship

1. **PDF export:** a print stylesheet on the read view.
2. **PWA:** installable, works offline, and calls `navigator.storage.persist()`. Manifest and home-screen icons are `pwa-*.png`, `pwa-maskable-*.png` and `apple-touch-icon.png` from `design/brand/png/`. Set the manifest's `background_color` to `#000000`, the icon's tile, so the splash screen matches the icon.
3. **Tauri desktop app:**
   - copy `yeraz-app.icns`, `yeraz-app.ico` and the PNG sizes from `design/brand/png/` into `src-tauri/icons/`. Don't let a tool create the small sizes by downscaling the 1024 px file; that blurs them.
   - stores the token in the OS keychain;
   - a release workflow runs on `v*` tags and attaches the installers to the GitHub Release.
4. **Title search** (Ctrl/Cmd+K) across all Trees.
5. **Optional:** GitHub sign-in (device flow on desktop; a small Worker for the web, see ARCHITECTURE.md §9).
6. **`README.md`** with install steps and how to create the token.

**Done when:**

- A tag produces installers for Windows, macOS and Linux.
- The PWA passes the browser's installability checks.
- The printing checklist (§7.6) passes on Chrome, Safari and the desktop app on all three OSes.

### After launch

Not part of the first release:

- **Custom theme editor:** create a theme from the current one, edit its tokens with live contrast checks, and import or export it as JSON (ARCHITECTURE.md §13). **Built.**
- **Theme sync across devices.** Not built: the default in §11 is that each device keeps its own.
- **Community themes:** a `themes/` folder in the repository that accepts contributions by pull request. **Built.**
- **Tree views** (`design/views/`, the owner asked for all seven): Mind map, Outline, Columns, Treemap, Graph, Growth rings and Atlas next to the map, chosen per device from the top bar or Settings › Views; Tree colours in `.yeraz.json` (Settings › Tree colours). ARCHITECTURE.md §6.1. **Built.** Owner's decisions: Rings uses each leaf's planted month from git blame, ring width = words planted that month; Tree colours live in the repository; the Atlas contours use `d3-contour`. Not built yet: the Atlas phone overview inset, the Graph phone edge chips for threads leaving the screen.

## 7. Testing strategy

### 7.1 Layers

| Layer | Tools | What it covers | When it runs |
|---|---|---|---|
| Unit | Vitest (Node) | `model/`, links, metadata, SHA, layout, sync planning, merge, autosave timers | On every save in watch mode, and in CI |
| Integration | Vitest + MSW + fake GitHub | Pull and push flows, 304 path, truncated tree, retries, conflicts | CI |
| End-to-end | Playwright: desktop Chromium, WebKit, Pixel and iPhone emulation | The user journeys in `ideas.txt` and accessibility; visual snapshots on demand (`snapshots.yml`) | CI |
| Performance | Playwright with CPU throttling | The budgets in ARCHITECTURE.md §11 | On demand (`npm run perf`), before a change that could affect them |
| Contract | Playwright against real GitHub | That the real API still behaves like the fake | Nightly |
| Desktop | Tauri build + launch smoke test | Packaging on three OSes | On release tags |

### 7.2 Unit tests worth having

- **Layout invariants for every fixture:**
  - no `NaN` coordinates;
  - every node on its depth ring;
  - sibling angles in order;
  - top-level branches don't overlap;
  - every thread passes through its leaves' common ancestor.
- **`sha.ts`** against `git hash-object` output stored in fixtures.
- **Contract round-trips:** parse → serialize leaves the file unchanged byte for byte.
- **Themes:**
  - every base × accent combination passes the contrast rules in `design/themes/check.py`;
  - `themes.json` defines every token for every base;
  - no hex or `rgb()` value appears in `src/` outside the theme file;
  - a custom colour that fails contrast is adjusted until it passes.

### 7.3 End-to-end conventions

- Every test starts from a seeded fixture served by the local fake server (§5.2).
- Use `page.clock` for the 2-minute autosave and the 2-second insert menu. Never sleep for real.
- **Visual snapshots** (`toHaveScreenshot`) of Home, Tree view, Map only, Phone and Appearance, taken at pixel density 2 like `design/screens/`. Take the tree view once per base (Vanta, Graphite, Paper). Wait for fonts first (`document.fonts.ready`). Compare them with `design/screens/`; the owner approves any difference.
- Run an `axe` accessibility scan on every screen.
- The Explorer is the keyboard-accessible route to every leaf, using `role="tree"` and arrow keys. Test keyboard navigation there.

### 7.4 Performance tests

- The app records `performance.mark` / `measure` for each budget and exposes them as `window.__yerazPerf`. This is test builds only.
- **Laptop scenarios** run unthrottled; **phone scenarios** run with 4× CPU throttling through the Chrome DevTools Protocol.
- **Scenarios,** each run on the 1,000 and 5,000-leaf fixtures:
  1. Reopening a cached Tree: time until the map is painted.
  2. First open: time until structure appears, and until all content is in.
  3. Scripted wheel zoom for 3 s: the 95th-percentile frame time, sampled with `requestAnimationFrame`. The budget holds the main thread's work per frame (from the frame's start until style, layout and paint are done). The time between delivered frames is reported only: CI's runners have no GPU, so there it is mostly software rasterisation, not the app.
  4. Time from clicking a leaf until the Peek appears.
  5. Keystroke latency in a 10,000-line leaf.
- **Bundle size:** `size-limit` keeps first-load JavaScript under 200 KB gzipped.
- **Failure rule:** a test fails when a number exceeds its budget by more than 20 %. Every number is written to `perf-results/results.json`.
- **Not in CI** (owner's decision): shared runners have no GPU and are noisy, and a failing budget must never hold back a deploy. Run `npm run perf` before merging a change that could affect a budget.

### 7.5 Contract test (real GitHub)

- Uses a dedicated private repository, `yeraz-contract-test`, and a fine-grained token stored in Actions secrets.
- The test connects, reads, edits, waits for autosave, verifies the commit through the API, and resets the repository.
- It runs in a real browser, so it also catches CORS changes.

### 7.6 Manual checklist (until it can be automated)

- **Printing:** check the output on Chrome, Safari, and the desktop app on Windows, macOS and Linux.
- **Installing:** install the PWA on iOS and Android.
- **Icons:** the dock, taskbar, desktop shortcut and phone home screen icons are sharp on standard and high-density screens (compare with `design/screens/08-app-icon.png`).
- **Unsigned desktop app:** check that it launches on macOS through right-click → Open.

## 8. CI pipeline (GitHub Actions)

```
on pull request and push to main:
  install (cached) → typecheck → lint → unit + integration → build → size-limit
  → e2e (Chromium, WebKit, mobile emulation)
on push to main:  deploy dist/ to GitHub Pages, once check and e2e pass
on demand:        visual snapshots (snapshots.yml) · performance budgets (npm run perf)
nightly:          contract test against real GitHub
on tag v*:        tauri-action builds Windows/macOS/Linux → GitHub Release
```

## 9. Definition of done (every change)

- Typecheck, lint, unit, integration and end-to-end tests pass.
- No performance budget regresses.
- Tests are updated, and ARCHITECTURE.md too if the contract or a budget changed.
- No new dependency without a one-line reason.

## 10. Prompts for the owner

Paste these into Claude Code, one milestone per session:

- **M0:** "Read `ideas.txt`, `ARCHITECTURE.md` and `development-plan.md`. Implement M0. Build the fake GitHub and its tests before anything else. Stop at the end of M0 and summarise what exists and what's next."
- **M1 onwards:** "Read `CLAUDE.md` and `development-plan.md`. Implement M1 steps 1–4, tests first. Stop when they pass." Then the remaining steps of the milestone in a second session.
- **Before merging M1:** "Run the visual snapshot tests and show me each screenshot next to its reference in `design/screens/`."

## 11. Decisions the owner still needs to make

| Decision | Needed by | Default if nobody decides |
|---|---|---|
| Product name: "Yeraz" or "YerazKnowledge" | M0 (manifest, window title) | Yeraz |
| Licence before the repository goes public | M0 | MIT |
| New Trees always private? | M2 | Yes |
| Branch folder names: slug or as typed? | M2 | **Decided:** as typed (`AI Agents/`) |
| Do the select and pan/zoom budgets apply to phones? | M2 | **Decided:** no. On phones they are measured and reported, not enforced |
| Unsplash API key (needs an Unsplash developer account; demo keys are rate-limited) | M3 | Upload-only covers |
| Code signing for desktop | M4 | Unsigned, with install instructions |
| Sync the theme across devices? | After launch | No: each device keeps its own |
