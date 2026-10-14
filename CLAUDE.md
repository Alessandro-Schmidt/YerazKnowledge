# Yeraz

Notes as Markdown in the user's own GitHub repositories; the main screen is a map of them.
Read `ideas.txt` (why), `ARCHITECTURE.md` (how), `development-plan.md` (what, in what order).
**Current milestone: M1.** Steps 1–4 done (parse, tree, sha, github + pull). Next: steps 5–7 (token screen, Home, Tree view).

## Commands

- `npm run dev` — the app; `npm run dev:fake` — the app against the in-memory fake GitHub (no token)
- `npm test` — Vitest (unit + integration); `npm run e2e` — Playwright on the production build
- `npm run typecheck` · `npm run lint` · `npm run format` · `npm run build` · `npm run size`
- `npm run fixture -- --leaves 1000 --threads 1500 --seed 7` — write a fixture Tree to `fixtures-out/`
- `perf` arrives with M1, when there is a map to measure (§7.4)

## Where things live (ARCHITECTURE.md §12)

- `src/model/` pure logic, no DOM/network: `parse.ts`, `tree.ts`, `sha.ts`
- `src/github/` `client.ts` (fetch, ETag, errors) · `graphql.ts` (blobs, discover, lookup)
- `src/store/db.ts` key/value (IndexedDB or memory) · `src/sync/pull.ts` the read path
- `src/map/` · `src/editor/` · `src/read/` · `src/ui/` (`Shell.tsx`, `theme.ts`, `contrast.ts`)
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
- The fake implements only what the app uses. If the app needs a new endpoint or field, add it to
  the fake with a test first.

## Repository format (the contract, ARCHITECTURE.md §4)

- [ ] A leaf is a `.md` file; line 1 is the title (`# 🔐 Keycloak`, leading emoji = icon)
- [ ] Optional line 2: `<!-- yeraz {...} -->` metadata; colours are names (`"amber"`), not hex
- [ ] Sub-leaves live in a sibling folder with the same name (`keycloak.md` + `keycloak/`)
- [ ] A branch is a folder without a same-named `.md`
- [ ] Threads are root-relative Markdown links (`[Keycloak](/identity/keycloak.md)`)
- [ ] Images in `/assets/`; `.yeraz.json` marks the root; filenames never change on retitle

## Budgets (ARCHITECTURE.md §11)

Reopen cached 1k-leaf Tree < 800 ms laptop / 1.5 s phone · first open structure < 1 s, content < 5 s ·
pan/zoom 60 fps at 2k nodes · select < 50 ms · keystroke < 16 ms · 1 request per commit ·
first-load JS < 200 KB gzip (`npm run size`) · theme switch < 50 ms, no React render.

## Known gaps

- Creating a Tree needs `auto_init: true` on `POST /user/repos`: `createCommitOnBranch` can't
  commit to an empty repository (no branch yet). The fake behaves the same way.
