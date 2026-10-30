![Yeraz: map what you know. The Atlas, the Map and six other views of the same notes.](docs/banner.webp)

# Yeraz

Notes as Markdown in your own GitHub repositories. The main screen is a map of how they're structured and connected.

Every note is a `.md` file in a repository you own, and it reads well on github.com too. There's no server of ours: GitHub is the backend. Each repository is a *Family*; its top-level folders are *Trees*, folders *branches*, notes *leaves*, and links between notes *threads*, drawn together as one radial map.

The editor edits the text itself and shows the result as you type: `@` mentions, images, math, code, YouTube, PDFs and subtitled videos. Edits are kept on your device as you type and committed in the background, one commit per save. Two devices editing the same leaf are merged.

## Preview

Two Families together: *Engineering* (400 leaves) and *Art History* (90 leaves), with their threads. Every view shows the same notes; switch from the top bar, or choose one in Settings › Views.

![The map: every Family on one radial map, each in its own ring](docs/preview/map.webp)

| | |
|---|---|
| ![A leaf open beside the map, edited in place](docs/preview/leaf.webp) **A leaf**, edited where it is shown | ![Columns: the path to a leaf, one column per level](docs/preview/columns.webp) **Columns**, from a Tree down to a leaf |
| ![Outline: every Tree, branch and leaf as a list, with first lines and word counts](docs/preview/outline.webp) **Outline**, with first lines and word counts | ![Treemap: the area of each tile is the words written](docs/preview/treemap.webp) **Treemap**, sized by words written |
| ![Graph: leaves and their threads, grouped by Tree](docs/preview/graph.webp) **Graph**, leaves and threads by Tree | ![Mind map: a Family as a tree from its core](docs/preview/mind.webp) **Mind map**, a Family from its core |
| ![Growth rings: one ring per month since the first leaf](docs/preview/rings.webp) **Growth rings**, one ring per month | ![Atlas: every Tree an island, every leaf a peak](docs/preview/atlas.webp) **Atlas**, Trees as islands, leaves as peaks |

## Use it

**On the web:** <https://alessandro-schmidt.github.io/YerazKnowledge/>. It works in any modern browser, and installs as an app: *Add to Home Screen* on a phone, or the install button in Chrome or Edge's address bar.

**On the desktop:** installers for Windows, macOS and Linux are attached to each [release](https://github.com/Alessandro-Schmidt/YerazKnowledge/releases). They aren't signed yet, so the first launch needs one extra step:

- **macOS:** right-click Yeraz in Applications, choose *Open*, then *Open* again.
- **Windows:** on the SmartScreen warning, choose *More info*, then *Run anyway*.
- **Linux:** make the AppImage executable (`chmod +x Yeraz_*.AppImage`) and run it, or install the `.deb`.

### Connect GitHub

Yeraz signs in with a fine-grained personal access token, kept on your device (in the OS keychain on desktop).

1. Open [New fine-grained token](https://github.com/settings/personal-access-tokens/new).
2. Under **Repository access**, choose the repositories that hold your notes, or all repositories.
3. Under **Permissions**, set **Contents** to *Read and write*. Metadata stays read-only.
4. To create new repositories from the app, also set **Administration** to *Read and write* (on all repositories).
5. Paste the token into Yeraz.

### Or use a folder, without GitHub

*Folder* on the first screen (or *Open an existing folder* in the Family menu) keeps a Family in a folder on your computer instead, with no account and no token. Pick one that iCloud Drive, Dropbox, OneDrive or a shared drive keeps in sync, and your other devices see the same notes. Edits are written to the folder a couple of seconds after you stop typing; when another device changed the same leaf meanwhile, the two versions are merged, or both kept. The files follow the same format as a repository, so the folder can become one later.

It works in the desktop app and in Chrome or Edge on a computer. Safari, Firefox and phone browsers can't open folders, so there Yeraz keeps the Family in the browser's own storage. A folder keeps no history: *History* is GitHub's. When you want it tracked, *Push to GitHub* in the Family menu makes a private repository of it, every file in one commit, and shows the repository in its place.

### Notes shared with other people

There is no backend to share through, and none is needed: the notes are files, and whatever already shares files shares them.

- **A repository** anyone you add as a collaborator can open in Yeraz with their own token. Each person's edits are committed on their own device; when two people change the same leaf, the second commit is refused by GitHub, the app pulls, merges the two versions three ways and commits again, and a line both of them changed is kept in both versions. *History* shows who changed what.
- **A folder** that a shared service keeps in sync (a Dropbox or OneDrive shared folder, a Google Drive folder on the desktop, a network drive or any other file system the computer can mount) works the same way for the people it is shared with: Yeraz only reads and writes the folder, and the service carries the files. Another person's change to the same leaf is merged in the same way when the folder is next read.

Edits are not live between people, as in a shared document: each person sees the others' changes when their device next pulls or reads the folder.

*Try an example* on the first screen writes a small example Family to look around in: a few leaves with threads, tasks, a video, maths and code, and a `CLAUDE.md` that tells an AI agent such as Claude Code how notes are kept here. Every new Family gets that `CLAUDE.md` too.

### Templates for new leaves

A template is a note kept in the Family's `.yeraz/templates/` folder: its title is the template's name, its emoji and look go to the new leaf, and `{{title}}`, `{{date}}` and `{{tree}}` in its text are filled in. *New leaf* offers every template under *Start from*; Settings › Templates makes, edits, copies and deletes them, and *Save as template* in a leaf's Options menu turns that leaf into one. Because templates are files of the Family, every device and everyone sharing the repository has them, and *Copy to…* puts one in another Family so it travels with that repository too.

### Bring your notes from another app

An Obsidian vault, a Notion export (*Markdown & CSV*, unzipped) or any folder of Markdown becomes a new Family with one command, from a clone of this repository:

```sh
npm run import -- ~/Obsidian/Vault ~/Notes/Vault --name "My notes"
```

Notion's ids leave the file names, `[[wikilinks]]` and relative links become threads, attachments move to `assets/`, and each note gets its title on line 1. The source isn't touched. Open the new folder with *Folder* on the first screen, or push it to a GitHub repository. With [Claude Code](https://claude.com/claude-code) in this repository, asking it to *import my Obsidian vault* runs the same steps (`.claude/skills/import-notes/`).

Without a clone, the standalone skill in [`skills/yeraz-import/`](skills/yeraz-import/) does the same from one Node script, reads Logseq graphs and OneNote's HTML or MHT exports too, and gives every page an emoji icon that says what it is about (Claude chooses them from an inventory of the pages):

```sh
npx skills add Alessandro-Schmidt/YerazKnowledge --skill yeraz-import
```

### Every Family together

With more than one Family (repositories or folders), Yeraz opens on all of them on one map, each in its own ring, and every view (Mind map, Outline, Columns, Treemap, Graph, Growth rings, Atlas) shows them all too. Click any leaf to read and edit it there. *All projects* in the Family menu brings that map back; to open on the last Family instead, choose *The last Family* in Settings › Views.

### Make a repository a Family

A repository is a Family when it has a `.yeraz.json` at its root, for example `{"name": "Engineering", "color": "green"}`. Yeraz finds every such repository the token can see. *Create a new repository*, on the first screen's GitHub step or in the Family menu, makes one for you. To rename a Family, click its name in the top bar, or choose *Rename Family* in the Family menu. This repository's [`knowledge-base-example/`](knowledge-base-example) folder is an example Family.

## The repository format

These rules are the contract between Yeraz and your files (ARCHITECTURE.md §4):

- A leaf is a `.md` file. Line 1 is its title: `# 🔐 Keycloak`. A leading emoji is its icon.
- Optional line 2 holds its look: `<!-- yeraz {"cover":"/assets/cover.png","color":{"heading":"amber"}} -->`. Colours are names (`green`, `amber`, `blue`, `violet`), so they follow every theme.
- A leaf's sub-leaves live in a folder with the same name beside it: `keycloak.md` and `keycloak/realms.md`. A folder without such a file is a branch.
- A thread is a root-relative link: `[Keycloak](/identity/keycloak.md)`. A link to a file in another Tree is its full GitHub URL.
- Images and files live in `assets/`. A paragraph that is only a link to YouTube, or to a PDF or video in `assets/`, shows as a player; subtitles are `name.<lang>.vtt` beside the video. Math is `$…$` and `$$…$$`.
- A template for new leaves is a `.md` file in `.yeraz/templates/`: line 1 its name, line 2 the leaf's look, the rest what the leaf starts with (`{{title}}`, `{{date}}`, `{{tree}}` filled in).
- Renaming a title never renames the file.

## Develop

Node 24. `npm ci`, then:

| Command | |
|---|---|
| `npm run dev` | The app, against real GitHub |
| `npm run dev:fake` | The app against an in-memory fake GitHub, signed in, with sample Trees |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run e2e` | End-to-end tests on the production build (Playwright) |
| `npm run perf` | Performance budgets on a 1,000-leaf Tree |
| `npm run typecheck` · `npm run lint` · `npm run build` · `npm run size` | |
| `npm run tauri dev` | The desktop app (needs Rust and the [Tauri prerequisites](https://tauri.app/start/prerequisites/)) |

Start with [`ideas.txt`](ideas.txt) (why), [`ARCHITECTURE.md`](ARCHITECTURE.md) (how) and [`development-plan.md`](development-plan.md) (what, in what order). [`design/`](design) holds the screens, the brand and every colour.

Releases: pushing a `v*` tag builds the desktop installers and attaches them to a draft release.

## Licence

[MIT](LICENSE)
