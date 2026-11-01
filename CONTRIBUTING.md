# Contributing to Yeraz

Thank you for wanting to help. Yeraz is a note-taking app whose notes are Markdown files in the
user's own GitHub repositories (or a folder), shown as a map. There is no server of ours: the
app runs in the browser or as a Tauri desktop app and talks to GitHub directly.

Bug reports, fixes, themes, translations of the docs, and ideas are all welcome. For anything
larger than a small fix, please open an issue first, so we can agree on the approach before you
spend time on it.

## Before you start

Read these, in this order. They are short and they save a lot of back and forth:

1. [`ideas.txt`](ideas.txt): why Yeraz exists and what it is not.
2. [`ARCHITECTURE.md`](ARCHITECTURE.md): how it works. §4 is the repository format, the contract
   between the app and people's files; §12 is where things live.
3. [`development-plan.md`](development-plan.md): what was built, in what order, and the
   performance budgets.
4. [`CLAUDE.md`](CLAUDE.md): the working rules, in brief. It is written for AI coding agents and
   holds for people just the same.

## Set up

You need Node 24 (`.nvmrc`). For the desktop app, also Rust and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/).

```sh
npm ci
npm run dev:fake
```

`dev:fake` runs the app against an in-memory fake of GitHub, signed in, with sample notes: no
token, no network. Use `npm run dev` to try it against your real GitHub account with a
fine-grained token (see the README).

| Command | What it does |
|---|---|
| `npm test` | Unit and integration tests (Vitest), against the fake GitHub |
| `npm run e2e` | End-to-end tests on the production build (Playwright); `npx playwright install` first |
| `npm run typecheck` · `npm run lint` · `npm run format` | TypeScript, ESLint and Prettier |
| `npm run build` · `npm run size` | The production build and its size budget (200 KB gzip first load) |
| `npm run perf` | Performance budgets on a 1,000-leaf Tree |
| `npm run visual` | Screenshots of every screen and view into `visual-review/` |
| `npm run tauri dev` | The desktop app |

## The rules

These keep the project small and its behaviour predictable. A pull request that breaks one will
be asked to change.

- **Tests first, against the fake.** A bug fix comes with a test that fails without it. Tests
  never call real GitHub: `test/fake-github/` implements the parts of GitHub the app uses. If the
  app needs a new endpoint or field, add it to the fake, with its own test, first.
- **The repository format is a contract.** People's notes must stay readable on github.com and in
  any editor. A change to how files are named, laid out or written (ARCHITECTURE.md §4) needs an
  issue and agreement first.
- **No colours outside `design/themes/themes.json`.** Use `var(--token)` in CSS.
  `src/ui/theme.test.ts` fails on a hex or colour function anywhere in `src/`.
- **Least code wins.** Prefer removing code to adding it. A new dependency needs a one-line
  reason in the commit message, and versions are pinned exactly (no `^` or `~`).
- **Budgets hold.** Keystroke under 16 ms, selection under 50 ms, pan and zoom at 60 fps with 2,000
  nodes, one request per commit, first-load JS under 200 KB gzip. Run `npm run perf` and
  `npm run size` when a change could affect them.
- **The map draws once per layout.** Selection, zoom and layers are data attributes or the
  selection layer, never a React render of the map.
- **Accessibility is tested.** New screens get an axe check in `e2e/`; everything works from the
  keyboard.
- **Scripted find-and-replace edits must check they matched.** Prettier reflows code, and a silent
  no-op has shipped bugs here before.

### Comments marked `ponytail:`

A `ponytail:` comment marks a deliberate simplification: the simple version is enough today, and
the comment says what to do if it stops being enough (for example, search is a linear scan, with
MiniSearch named as the next step). They are not TODOs. Change one only when you can show the
limit being reached.

## Pull requests

1. Fork, and branch from `develop`. Pull requests go to `develop`; `main` only takes releases.
2. Keep each pull request to one change. Separate refactoring from behaviour changes.
3. Run `npm run lint`, `npm run typecheck` and `npm test`, and the e2e specs that cover what you
   changed (`npx playwright test e2e/<spec> --project=chromium`).
4. Write commit messages that say what changed and why, in plain sentences. The first line is a
   summary under about 72 characters.
5. Fill in the pull request template. Screenshots help for anything visible.

CI runs the checks and the end-to-end tests on Chromium for every pull request. WebKit and the
phone layouts run nightly. Visual snapshots run on demand: a maintainer runs them for visual
changes.

### Branches and releases

- `develop` is where work lands, through pull requests. It is the default branch.
- `main` is what is released: a push to it deploys <https://yeraznotes.com>. It only takes a
  pull request from `develop` (a release) or from a `hotfix/…` branch; CI's `release-source`
  check refuses anything else.
- A release: open a pull request from `develop` into `main` titled `Release vX.Y.Z` and merge
  it with a merge commit; then tag that commit `vX.Y.Z`, which builds the desktop installers
  into a draft release.
- A hotfix: branch `hotfix/…` from `main`, open the pull request into `main`, then merge
  `main` back into `develop`.

### Changing how something looks

`design/` is the visual source of truth: the screens, the brand and every colour. Match it.
For a new screen or a visual change, attach before and after screenshots, in a light and a dark
theme and on a phone width.

### Themes

Community themes live in `themes/`. Each must pass every contrast rule as written; the tests
check them.

## Reporting bugs and security issues

Open an issue with the bug report form. Please include the browser or desktop platform, what you
did, what you expected and what happened. **Never paste a GitHub token** into an issue.

For a security vulnerability, do not open a public issue: follow [SECURITY.md](SECURITY.md).

## Code of conduct

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

By contributing, you agree that your contributions are licensed under the project's
[MIT licence](LICENSE).
