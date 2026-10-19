# Yeraz — Architecture

Yeraz is a note-taking app whose notes live as Markdown files in the user's own GitHub repositories, and whose main screen is a map of how those notes are structured and connected.

- **Why and what:** `ideas.txt`
- **Order of work and testing:** `development-plan.md`
- **Visual design:** `design/` holds screenshots of every screen, their source files, and the logo and app icons. `design/README.md` explains each file and links the original design canvas.

This document was written with two lenses: **performance** and **least code**. Most decisions below serve both, and §11 reviews them explicitly.

---

## 1. Principles

1. **GitHub is the backend.** There is no server of ours. A repository is a database, a commit is a transaction. A Family can also live in a folder on the device (§5.6), for people without GitHub: the same files, written instead of committed.
2. **Markdown text is the only document model.** The editor edits text directly. Nothing is converted to another format and back, so nothing can be lost in conversion, and diffs stay minimal.
3. **Everything is cached by content hash.** Each file version is stored locally under its git blob SHA. A SHA never changes meaning, so the cache never needs invalidating and nothing is downloaded twice.
4. **One codebase, two shells.** The same static web build runs on GitHub Pages (installable on phones) and inside a Tauri desktop app.
5. **Common edits touch one file.** The repository format (§4) is designed so editing, adding a sub-note or renaming a title never rewrites other files.
6. **Measure before adding.** No Web Worker, list virtualization, canvas renderer or search engine until a performance budget (§11) fails without it.

## 2. Vocabulary

| Term | Means | On GitHub |
|---|---|---|
| **Family** | One knowledge base: every Tree in it, and the threads between them | One repository |
| **Tree** | One subject of a Family | A folder at the top of the repository, or a leaf there with its sibling folder |
| **Branch** | A grouping of notes | A folder |
| **Leaf** | A note | A `.md` file |
| **Thread** | A link from one leaf to another (`@mention`) | A Markdown link |
| **Explorer** | Left panel: the file view of a Family, each Tree a top-level group | — |
| **Map** | Centre: the radial knowledge map | — |
| **Peek** | Right panel: the selected leaf, editable where it is shown | — |

"Branch" here never means a git branch. Each Family uses its repository's default branch only.

Most people keep everything in one repository, so a Family needs no second one: a new Tree is a new folder (or leaf) at the top. A person can still connect or create more repositories; each is a Family of its own. In code, the session's `TreeRef` and `trees` still name repositories (Families); the Trees inside one are computed by `map/family.ts`.

## 3. System overview

```
┌──────────────────────── Yeraz (static React build) ────────────────────────┐
│  UI      Family view (Explorer | Map of every Tree | Peek with the editor)  │
│  Model   in-memory index: leaves, branches, threads (derived, never saved)  │
│  Store   IndexedDB: blobs by SHA · parsed leaves by SHA · dirty files ·     │
│          last tree + ETag per Family                                        │
│  Sync    GitHub REST (4 endpoints) + GraphQL (3 operations)                 │
└───────────────────────────────────┬────────────────────────────────────────┘
                                    │ HTTPS, user's token
                                    ▼
                    api.github.com  — one repository per Family

Shells:  GitHub Pages (PWA, phones + desktop browsers)
         Tauri 2 (Windows .exe/.msi, macOS .dmg, Linux .AppImage/.deb)
```

## 4. Repository format (the contract)

These rules are the only thing that must stay stable across versions. Tests lock them.

| Rule | Example |
|---|---|
| A leaf is a `.md` file. **Line 1 is the title.** | `# Keycloak` |
| An emoji at the start of the title is the leaf's icon. | `# 🔐 Keycloak` |
| Optional **line 2** is a metadata comment: cover and the part of it that shows (`coverPosition`, percent from the top, centred when absent), an image icon (`icon`: `/assets/…` or an https address, in place of the title's emoji; shown on the map in its dot), where the icon sits over the cover (`iconPosition`: `center` or `right`, left when absent), colours. It is invisible when GitHub renders the file. Colours are **named** (`green`, `amber`, `blue`, `violet`…), so they adapt to every theme (§13). | `<!-- yeraz {"cover":"https://…","coverPosition":30,"color":{"heading":"amber"}} -->` |
| A leaf's sub-leaves and sub-branches live in a **sibling folder with the same name**. | `identity/keycloak.md` + `identity/keycloak/realms.md` |
| A branch is a folder with no sibling `.md` file of the same name. Its name is the folder name, kept as typed. Git stores no empty folders, so a new branch is created with its first leaf. | `AI Agents/` |
| A branch's **text** is the `README.md` in its folder (that name exactly, case included), which GitHub shows under the folder's files. It is not a leaf: no node, no words in the totals, and its line 1 doesn't rename the branch. A folder holding only its `README.md` is still a branch. The root's `README.md`, and one in a leaf's sibling folder, stay ordinary leaves. Links in a branch's text are threads from the branch; a link to it is a thread to the branch. | `AI Agents/README.md` |
| A thread is a normal Markdown link with a **root-relative** path. GitHub resolves paths starting with `/` from the repository root, so threads also work on github.com. | `[Keycloak](/identity/keycloak.md)` |
| A thread to another Family is a full GitHub URL to a file in a connected repository. Any other `github.com/owner/repo` URL renders as a repository card. | `https://github.com/user/art-history/blob/main/baroque.md` |
| Images and attachments live in `assets/` at the root, at full quality. An image is committed unchanged unless its long edge is over 4096 px (§8). | `assets/2026-10-14-realm-diagram.png` |
| An image's **width** is the end of its title, a percent of the column; without one it shows at its own size, up to the column. Images are centred. On GitHub it shows at its own size, with the rest of the title as its tooltip. | `![Realm](/assets/realm.png "width=50%")` · `![Realm](/assets/realm.png "The realm width=50%")` |
| A paragraph that is only a link to a YouTube video, or to a PDF or video (`.mp4`, `.webm`) in `assets/`, shows as a player; one to any other file in `assets/` shows as a card that downloads it. On GitHub it stays a link. A video's subtitles are `name.<lang>.vtt` files beside it. | `[OIDC spec](/assets/oidc.pdf)` · `assets/talk.mp4` + `assets/talk.en.vtt` · `[Q3 report.xlsx](/assets/2026-10-17-q3-report.xlsx)` |
| A paragraph that is only a titled link to any other web page is a **bookmark**: a card with its title and address. A bare URL stays a plain link. On GitHub both are links. | `[Baroque](https://en.wikipedia.org/wiki/Baroque)` |
| Math is `$inline$` and `$$display$$`, as GitHub writes it. | `$e^{i\pi} + 1 = 0$` |
| `.yeraz.json` at the root marks a repository as a Family. Every other entry at the root is one of its Trees, except `assets/`, hidden files and the root's `README.md`: that stays a leaf, and the Family's Peek shows it as the Family's own text. Optional `trees` gives a Tree its own colour name, keyed by the Tree's entry at the root (folder name, or leaf file); a Tree without one takes the Family's `color`. | `{"name":"Engineering","color":"green","trees":{"Identity":"amber"}}` |
| The filename is fixed when the leaf is created (a slug of its first title). Changing the title does not rename the file. | Title "Keycloak (IdP)" stays in `keycloak.md` |

Why these rules:

- **Sibling folders instead of `folder/README.md`.** Giving a leaf its first sub-leaf only adds a folder; the leaf itself never moves. With the README convention the leaf would move, and every link to it would need rewriting.
- **A branch's text in `README.md`.** A branch has no file of its own, and GitHub already shows a folder's README under its files. Adding text to a branch adds one file; nothing moves. The root keeps its `README.md` as a leaf, since most repositories already have one that describes the repository.
- **Fixed filenames.** Renaming a title is the most common structural edit. It touches one file.
- **Root-relative links.** Moving a leaf does not break that leaf's own outgoing links. Only links pointing *to* it change. The backlink index finds them, and they are rewritten in the same commit as the move.

## 5. Data flow

### 5.1 Opening a Family (read path)

1. **Head commit, one request:** `GET /repos/{owner}/{repo}/commits/{branch}` with `Accept: application/vnd.github.sha` (the answer is just the commit SHA) and `If-None-Match: <stored ETag>`.
   - A `304 Not Modified` means nothing changed, and it does not count against the rate limit. Done: render from IndexedDB.
   - A SHA equal to the one we have (after our own commit) also means nothing to fetch.
   - Keep the ETag ourselves and call `fetch` with `cache: 'no-store'`. GitHub marks API responses as cacheable for up to 60 s, and the browser's cache would otherwise hide fresh changes.
   - Why not list the tree by branch name: a commit needs the exact commit our edits started from (`expectedHeadOid`, §5.2), and a tree listing doesn't say which commit it belongs to.
   - **Tree listing:** `GET /repos/{owner}/{repo}/git/trees/{commit SHA}?recursive=1`. Limit: 100,000 entries / 7 MB per recursive listing, far beyond a personal knowledge base. If the response is `truncated`, fall back to listing subtrees one at a time.
2. **Diff:** compare each `.md` entry's blob SHA with IndexedDB. Only unknown SHAs are fetched.
3. **Fetch missing blobs by SHA** with GraphQL, many per request (`b0: object(oid:"…"){... on Blob{text}}`, `b1: …`). Group them so each response stays around 1 MB.
4. **Parse** each new blob into `{ title, icon, meta, words, links }`. This is one pure function, stored under the blob SHA.
5. **Build the index** (leaves, branches, threads, backlinks, adjacency) and lay out the map.

**Refresh** in the top bar (issue #63) runs this path again on demand: one request, a free 304 when nothing changed (for a folder, a new scan, §5.6).

The map is **progressive**: it renders right after step 1 using only paths and blob sizes (bytes ÷ 6 ≈ words), then refines as content arrives.

### 5.2 Writing and saving (write path)

- A keystroke changes only the editor state. After 500 ms of no typing, the text is written to IndexedDB under `dirty[path]`. It survives crashes, closed tabs and lost connections.
- **A commit happens when any of these occurs:**
  - 2 minutes pass with no edits.
  - The user leaves the leaf, or the app goes to the background (`visibilitychange` → hidden).
  - The user presses Ctrl/Cmd+S, or Save in the top bar (issue #63; on phones it shows only while edits wait).
- **One request per commit,** however many files changed: GraphQL `createCommitOnBranch` with:
  - every dirty file (additions with base64 contents, plus deletions);
  - `expectedHeadOid` set to the last commit we know. If someone else pushed in between, the commit is refused instead of overwriting their work.
  - GitHub signs these commits automatically.
- **After a successful commit,** each saved file's blob SHA is computed locally: SHA-1 of `"blob " + byteLength + "\0" + content`, via `crypto.subtle`. The text moves from `dirty` into the blob cache, so the next tree listing finds every SHA already known and downloads nothing.
- **When the commit is refused** (another device pushed first):
  1. Run the read path.
  2. For each dirty file that also changed remotely, do a three-way merge with `node-diff3`. The base is the cached blob our edit started from.
  3. A clean merge is committed. If both sides edited the same lines, keep both: the remote version stays in place, ours is saved as `name.conflict-YYYY-MM-DD.md`, and a banner says so.
  4. Text is never lost.
- **Leaving with unsaved edits:** the edits stay in IndexedDB and are committed the next time the app opens. We do not rely on requests sent during page unload, because browsers cap `keepalive` request bodies at 64 KB.

### 5.3 Finding Families

After sign-in, one GraphQL query lists the user's repositories and checks each for the marker file (`object(expression:"HEAD:.yeraz.json")`). Every repository that has it is a Family. No device needs to be told which Families exist.

- **The app opens straight into a Family** (`#/` goes to the one last shown on this device, kept in `localStorage`, or the first one found): every Tree on the map at once, ready to click, edit and create in. There is no "open" step.
- The list is refreshed when the Family menu (beside the Family's name) is opened, not on every start, so reopening the app stays one request (§11). The same menu switches Family, and holds the secondary paths: "Connect repository", "Create a new repository", Appearance, sign out.
- **A new Tree is a new folder or leaf at the top of the Family** (New tree, or New leaf with nothing selected): an ordinary structure edit (`sync/structure.ts`), committed like any other.

Creating a new repository (a new Family) from the app means:

1. `POST /user/repos` with `private: true`.
2. A first commit containing `.yeraz.json` and a welcome leaf.

Renaming a Family changes only `name` in `.yeraz.json`. The edit is committed like any other, and the file keeps its other fields and its layout. Until the commit lands, the name typed on this device wins over what discovery reports, so the top bar and the menu never show the old name again. The repository keeps its name; links and clones are untouched.

### 5.4 A leaf's history

"History" in a leaf's menu lists its past versions, read straight from git: GraphQL `history(path:)` on the commit last pulled, 30 versions per request, with each version's blob SHA (`file(path:) { oid }`). History asked of a commit SHA never changes, so a page is kept for the session; a version's text is fetched by SHA like any blob and kept in the blob cache. A version is compared with the current text (pending edits included) as a line diff.

"Restore this version" saves the old text as an ordinary edit and commits it at once (§5.2): a new commit on top, never a rewrite of history, so the offline outbox and the three-way merge apply as for any edit. Like `git log` without `--follow`, the history stops where the file got its current path: versions from before a move stay on GitHub under the old path.

### 5.5 When leaves were planted

Growth rings (§6.1) asks GraphQL `blame(path:)` on the commit last pulled, 20 files per request, and takes the oldest commit date among each file's lines. The dates are kept on the device (`planted:<owner/name>`); later only leaves not dated yet are asked for, and a leaf not committed yet is planted now. Nothing else reads it.

### 5.6 A Family in a folder

Issue #64: a Family can be a folder on this device instead of a repository, so nobody needs a GitHub account to start. A folder that iCloud Drive, Dropbox, OneDrive or a shared drive keeps in sync shares it between devices; Yeraz itself syncs nothing.

- **Reaching the folder** (`local/folder.ts`): the File System Access API in Chrome and Edge (the handle is kept in IndexedDB; after a restart the browser may need one click to allow access again), and in the desktop app five Rust commands (`src-tauri/src/folder.rs`: pick, list, read, write, remove), since the macOS and Linux webviews lack that API. Safari, Firefox and phone browsers can't open folders, so there Yeraz stays GitHub only.
- **Same format, same model:** the folder holds exactly what a repository would (§4), with `.yeraz.json` at its root. Picking a folder without one adds it, and a welcome leaf if it has no leaves; anything else in it is left as it is. Its id is `~/<slug>` (`~` is no GitHub account), so routes, keys and the session treat it like any Family.
- **Read path** (`sync/folder.ts`): one listing of the folder, hidden entries left out. Leaves are read and known by git blob SHA, cached as in §5.1; one read before is known by its size and modification time, so reopening reads only what changed. Images and other files are listed by size and time and read when shown.
- **Write path:** edits are kept in IndexedDB as in §5.2 and written two seconds after the last keystroke (not two minutes: other devices see the folder, not a commit). Before writing, the folder is listed again: a leaf changed there since the edit started (another device, another app) goes through the same three-way merge as a refused commit. Desktop writes go to a hidden file renamed over the leaf, so a sync client never uploads half a file.
- **Not available:** a leaf's history (§5.4) needs git, so a folder's Peek has no History; Growth rings date a folder's leaves by their last change on disk.

## 6. The map

- **One map per Family, one radial layout per Tree** (`map/family.ts`): each Tree is laid out on its own, centred on its core, as below; then the Trees are placed side by side.
- **Layout: a radial cluster from `d3-hierarchy`,** with branches fanning out from a core (the Tree):
  - `cluster()`: every node without children gets an angle of its own, and a parent sits among its children, so nothing on an outer ring shares an angle with a leaf further in.
  - Each depth sits on its own ring. Neighbours are separated by their dots and labels on every ring between them (inner rings are shorter, so they need more of the angle).
  - A ring moves out when a label on the ring inside it, running along the radius, wouldn't end before it.
- **Threads use hierarchical edge bundling:** `d3.lineRadial().curve(d3.curveBundle.beta(0.7))` drawn through `source.path(target)`.
  - d3 already returns the path through the two leaves' common ancestor, so this is about ten lines of code.
  - Bundling is what keeps the map readable as threads multiply. A force-directed layout (Obsidian's approach) turns into a tangle.
- **Encodings (from the design):**

  | What you see | Means |
  |---|---|
  | Node area | Words written: radius = a + √words × k |
  | Emoji on a dot | The leaf's icon; its dot is never smaller than the emoji |
  | Grey line, heavier near the core | Parent to child (the hierarchy), drawn above threads |
  | Filled dot | Leaf |
  | Hollow ring | Branch |
  | Filled dot with a ring | Leaf with sub-leaves |
  | Donut around the core | Share of words per top-level branch |
  | Accent curve, thinner and fainter | Thread |
- **Rendering:**
  - React renders the SVG geometry once per data change (memoised).
  - Pan and zoom use `d3-zoom`, which writes a single `transform` attribute on one `<g>`. **React does not re-render during pan or zoom.**
  - Selecting adds `data-focus` on the map, then draws a translucent veil over the map and copies of the selection's neighbours (from a precomputed adjacency map) above it, in a second `<svg>` with its own compositor layer. The work depends on the number of neighbours, not the size of the Tree, and the map itself is never repainted. (Restyling every node to dim it cost about 4× more on a throttled phone.)
  - Semantic zoom works the same way: a `data-zoom` attribute (`far` hides labels below the first ring, `near` shows them).
- **Labels never overlap each other or a dot** (a unit test checks the example Tree, the design's Trees and generated ones). Labels are horizontal, as in the design, wherever they fit; one that would touch another label or a dot turns to follow the radius. Trees of more than 60 leaves turn every leaf label. Widths are estimated from the characters, since layout runs without a DOM.
- **Fit** is the bounding box of every dot and label, so a lopsided Tree still fills the screen. A long Tree title wraps onto two lines in the core.
- **The Family map** (`map/family.ts`, drawn by `TreeMap.tsx`):
  - Each Tree keeps its own size (layout units are the same for every Tree), and the Trees are placed with `d3.packSiblings`, largest in the middle. Each is drawn by the same geometry as a lone Tree, in a `<g>` moved to its place, so the drawing has one implementation.
  - A Tree's name is drawn under it, sized with the Tree, while the whole Family is in view; up close (`data-zoom="near"`) the core's title takes over.
  - **Threads between Trees** run from leaf to leaf through both cores, bowed to one side between the cores so the two directions don't overlap, with the same bundle curve as threads inside a Tree. Many threads between two Trees read as one thick cable: how strongly they relate.
  - **Opening:** the whole Family is fitted; a link to a node fits that node's Tree instead. **Selecting a Tree** (its core, its Explorer row) fits the camera to it: the Tree as it is. "Fit all trees" zooms back out.
  - **Every dot is one click from the Peek**, at any zoom: a click on no dot reaches the one whose edge is nearest the pointer, within 10 px (18 px for touch). `familyNodeAt` searches in layout units through the camera's screen transform, so no hit area is added per dot.
- **Every Family on one map** (issue #69, `map/families.ts`, `ui/AllView.tsx`, `#/all`): what `#/` opens on when there is more than one Family, unless Settings › Views says *The last Family* (per device, `localStorage` `yeraz-open`).
  - Each Family's graph is merged under one root with its ids prefixed (`owner/name::path`), so the Family map draws it unchanged. `layoutFamily` packs each Family's Trees together, then the Families, each in a dashed ring with its name.
  - A link to a leaf in another connected Family (its GitHub URL, §4) is a thread between the two rings.
  - A selected node opens in its own Family's Peek, with that Family's graph and paths, so reading, editing and saving are the same code as inside a Family. Save and Refresh act on every Family.
  - Every view (§6.1) shows every Family too: it gets the merged graph and `allRef` (repo `*`, each Tree keeping its Family's colour); its first lines and planting dates are each Family's, merged (`views/common.ts`), and its actions go to the node's Family. The Explorer stays per Family.
  - Opening the app on a Family's own address (a restored tab, a bookmark) shows every Family too; an address naming a leaf opens on it.
- **Ceiling:** SVG should hold 60 fps up to about 2,000 nodes on a mid-range phone; the performance tests confirm the real number. Above it, the node and edge layers can be swapped for one `<canvas>` using the same layout data. That swap is planned, not built.

### 6.1 Other views of a Family

Next to the radial map, a Family can be shown seven other ways (design: `design/views/`): **Mind map, Outline, Columns, Treemap, Graph, Growth rings, Atlas**. Which one is a per-device preference (`localStorage` `yeraz-view`), chosen from the switcher in the top bar (a row of tabs on phones) or Settings › Views.

- **Same data, same selection.** Every view reads the Family's graph; the Family's Trees play the part the design gives a Tree's branches. The selection is the URL's, so switching keeps it.
- **One chunk each** (`views/index.ts`, `React.lazy`): first load is unchanged.
- **Layouts are pure** (`views/layout/*.ts`, unit-tested, deterministic: seeded noise, no `Math.random`). Drawn views (Mind map, Graph, Rings, Atlas) share `views/Canvas.tsx`: one camera moved by `useZoom`, the geometry memoised and drawn once per layout, and the selection drawn into a layer, never by re-rendering the geometry (the map rule).
- **Panels:** Mind map, Outline and Treemap use the floating Peek; Columns docks it as its last column; Graph, Rings and Atlas have their own card and open the Peek only as a full page. Phones use the Peek's sheet, except Rings, whose sheet is its core sample.
- **Graph:** each Tree is laid out on its own (sunflower start, then a small force simulation of our own up to 250 leaves), scaled to 34·√n + 20, placed around the Tree most cross-Tree threads run through, and turned so its threaded leaves face it. Hulls are smoothed convex hulls.
- **Growth rings** need when each leaf was planted: the oldest commit among its lines, by GraphQL `blame` (§5.5). Ring width = 9 px + the words of the leaves planted that month (the owner chose this over words written per month, which would need every file's size at every commit).
- **Atlas:** islands are placed by packing (each Tree's leaves packed, then the islands with open sea between, `d3.packSiblings`); each island has its own elevation field on a grid (2 px for a small Family, coarser for a large one), contoured with `d3-contour`. About 0.3 s for 1,000 leaves, once per graph.
- **Tree colours** colour a Tree in every view and on the map (`--tree` on its group).

## 7. Editor

- **CodeMirror 6** with `@codemirror/lang-markdown` (GitHub-flavoured). The document in the editor *is* the file's text.
- **Live preview is one decoration extension.** It:
  - hides Markdown syntax and styles headings and quotes. Writing shows the result (issue #68): only the piece of syntax the cursor touches shows its marks (a heading's `##`, a span's `**`, a link's `[…](…)`, a task's `[ ]`, inline math), so it can be edited; images, embeds and callouts show their Markdown on the cursor's line;
  - replaces the right ranges with widgets: images, `@` chips, checkboxes, math (KaTeX), YouTube embeds, PDFs, video with subtitle tracks, repository cards and bookmarks.
- **Images resize by their sides** (issue #27): dragging either side inwards makes the image smaller, outwards bigger, both sides moving so it stays centred, from 10% up to the column. The width is written into the image's title once, on release (`imageResize`); the end handle is also a slider (arrows by 5%, Home, End).
- **"Show the code" turns that extension off.** Same editor, same text, no conversion.
- **A new line says how to open the options** (issue #68, `emptyText.ts`): the empty line being written on shows, faintly, "Hold ⌘ / Ctrl to see options", or "Tap and hold, or type /" on touch. The caret is the text's colour.
- **`@` mentions** use `@codemirror/autocomplete` over the in-memory index. Picking a leaf inserts `[Title](/path.md)`, which is displayed as a chip with the target's icon.
- **Hold Ctrl/Cmd for 2 seconds** to open the insert menu: to-do list, ordered list, bullet list, mention, image from files, attach a file, new leaf, new branch.
  - The timer starts when the modifier is pressed on its own. Any other key, or releasing the modifier, cancels it, so normal shortcuts like Ctrl+C never open the menu.
  - Phones have no Ctrl key: a long-press or typing `/` opens the same menu.
- **Pasting a URL** (one http(s) address, into a plain paragraph) inserts it as it is and offers *Keep as link* or *Bookmark*. A bookmark rewrites it as `[Title](url)` in a paragraph of its own; the title comes from the URL's last path segment, or its site, since the browser can't fetch other sites' pages. Typing, moving away or Escape keeps the link.
- **Code blocks** use CodeMirror's nested languages from `@codemirror/language-data`, loaded per language on demand. The read view highlights with the same Lezer parsers (`highlightCode`), so there is one highlighting system, not two.
- **The header above the text** (cover, icon, colours) is drawn from line 1 and line 2. Colours are applied as CSS variables on the leaf container: `--leaf-text` and `--leaf-heading`, with headings in the theme's accent by default.
  - In the live preview, line 2 is hidden and kept whole (`metaLine.ts`): typing never enters it, and Enter after the title starts line 3. Only the header's controls (and Undo) change it.
  - A header damaged before (repeated below itself, or its comment pushed below line 2) shows repaired, and the leaf's next save writes the repair: one title line, one metadata line, a repeated header's metadata winning (`repairHeader`).
- **A branch's text** (`folder/README.md`) is edited in the same editor, at its path, without that header. Before it exists, the branch's Peek offers *Add text*: the editor starts from `# Branch name` and the first save creates the file, committed like any edit.

## 8. Read view and PDF

- A leaf is edited wherever it is shown (issue #17): the floating Peek, its full page and the phone's sheet all hold the editor (`editor/LeafEditor.tsx`), live preview on, with no separate Edit step. The Peek adds the leaf's metadata chips, sub-leaves and threads below it, and "Show Markdown" in its More actions menu. Old `#/edit/…` links redirect to the leaf in its Family.
- The read view is the HTML `markdown-it` makes of a leaf (plus task lists and KaTeX). It is what a leaf prints as.
- **PDF export** uses a print stylesheet and `window.print()` on the read view.
  - Video embeds print as a thumbnail with a link.
  - On desktop, check Tauri's webview printing on all three OSes early in development. The fallback is a small Rust command that calls the webview's native print.
  - PDFs always use the original images, never smaller copies.
  - Printing always uses the Paper base, whatever theme is on screen, so a dark theme never prints as a black page.

### Flags

Windows' emoji font has no flags: "🇫🇷" shows as the letters FR. Where the system can't draw a flag (always on Windows, otherwise tested on a canvas), `ui/flags.ts` adds a flags-only cut of Google's Noto Color Emoji (`public/fonts/noto-flags.woff2`, SIL OFL 1.1, about 700 KB of COLRv1 vectors), named first in every font stack and limited to the flags' code points, so it is fetched only when a flag is on screen, and kept out of the offline precache. Apple's emoji, the owner's first choice, may not be bundled; Noto's waving flags are the closest free match. Apple's and Android's own flags stay.

### Images at full definition

Every image a user sees should be sharp on any screen, including 2× and 3× displays.

- **Interface:** every icon and the logo are SVG. The app's own interface uses no raster images.
- **App icons:**
  - Every size, on every platform, is rendered from the vector masters in `design/brand/`.
  - 32 px and smaller use a heavier drawing made for small sizes.
  - No icon is produced by scaling down another bitmap.
- **Images people add** (paste, drop or pick):
  - **Committed unchanged** when the long edge is 4096 px or less and the format is PNG, JPEG, WebP, GIF or SVG. No re-encoding means no quality loss.
  - **Larger images** are scaled down to 4096 px on the long edge, the most a full-width image needs on a 2× display up to 2048 px wide. Photos are saved as WebP at quality 92. Screenshots, diagrams and images with transparency are saved as lossless WebP so text and edges stay crisp.
  - **Never upscaled.** SVG (a vector) and GIF (possibly animated) are always committed as they are.
  - Images go into the same commit as the leaf that shows them; they are never merged, since their names (date and slug) are unique.
- **Other files people add** (paste, drop or "Attach a file", `editor/attach.ts`) are committed byte for byte under the same names, keeping their extension, in the same commit as the leaf. The leaf gets a paragraph of one plain link, its text the file's name. The card shows the name, type and size (from the tree listing, so nothing is downloaded); the file is fetched only when the card is used.
- **Display:**
  - The browser shows the original image, scaled by CSS. Browsers resample well, and the full pixel density is kept on high-resolution screens.
  - The Tree's own images are fetched the first time they are shown, with `GET /repos/{owner}/{repo}/git/blobs/{sha}` and the raw media type, and kept in IndexedDB by blob SHA. Private repositories need the token, so they are shown through blob URLs.
  - Images load with `loading="lazy"` and `decoding="async"`, so they don't slow down opening a leaf.
  - Smaller display copies, cached by blob SHA, are planned only if a phone memory or speed budget fails.
- **Covers from Unsplash:** store the photo's URL. When displaying it, request the width the slot needs multiplied by the device's pixel ratio; Unsplash resizes images from URL parameters. Covers then stay sharp on any screen without storing large files.

## 9. Authentication

- **v1:** the user pastes a fine-grained personal access token with *Contents: read and write* on the repositories they choose.
  - Stored in IndexedDB on the web, and in the OS keychain on desktop.
  - Creating repositories from the app needs broader permission. The token screen explains which.
- **Later:**
  - **Desktop:** GitHub's device flow, called from Tauri's Rust HTTP client. It needs no client secret and isn't subject to browser CORS.
  - **Web:** the OAuth web flow with PKCE, plus a ~30-line Cloudflare Worker for the token exchange. This is needed because GitHub's OAuth endpoints don't answer browser CORS pre-flight requests, and the web flow needs the client secret.
- **Content Security Policy:** no inline scripts, and network access only to `api.github.com` and the image hosts in use. This protects the token.

## 10. Packaging and delivery

- **One Vite build** produces `dist/`.
- **Web:**
  - A GitHub Actions workflow deploys `dist/` to GitHub Pages.
  - `vite-plugin-pwa` generates the web manifest and a service worker that caches the app shell. Data is offline already through IndexedDB.
  - On a phone, "Add to Home Screen" installs it. Chrome and Edge can also install it on desktop.
  - Routing uses the URL hash (`#/tree/owner/repo/path`), because GitHub Pages cannot rewrite URLs.
- **Desktop:**
  - Tauri 2 wraps the same `dist/`.
  - `tauri-apps/tauri-action` builds Windows, macOS and Linux installers when a version tag is pushed, and attaches them to the GitHub Release.
  - Note that `.exe` is Windows-only; each OS gets its own installer.
- **Icons:** every platform's icon files are already exported in `design/brand/png/` (see `design/README.md`).
- **Signing:** unsigned apps show security warnings on macOS and Windows. Signing (Apple Developer Program, Windows code-signing certificate) can be added later without code changes.

## 11. Performance review

### Budgets

| Hot path | Budget | How the design meets it |
|---|---|---|
| Reopen a cached Tree (1,000 leaves) | Map painted < 800 ms on a mid laptop, < 1.5 s on a mid phone | App shell from the service worker. Index and layout inputs from IndexedDB. One conditional request, normally a free 304. |
| Open a Tree for the first time (1,000 leaves) | Structure < 1 s, all content < 5 s | One tree request. About 10 GraphQL blob requests, run three at a time. The map renders from paths before content arrives. |
| Pan and zoom | 60 fps at 2,000 nodes | One `transform` write per frame. No React renders. Labels hidden by a zoom-level class. |
| Select a leaf | < 50 ms to highlight and open the Peek | Precomputed adjacency. Class toggles only. The editor's chunk is preloaded when a Tree opens; the leaf's text follows from the blob cache. |
| Typing | < 16 ms per keystroke in a 10,000-line leaf | CodeMirror renders only visible lines. No conversion. Local writes debounced. |
| Saving | 1 request per commit | `createCommitOnBranch` with every changed file. |
| First load JavaScript | < 200 KB gzipped | Editor, KaTeX, `markdown-it` and language parsers are separate chunks loaded on first use. |
| Rate limit in normal use | ≈ 0 | 304s are free. Blobs are never fetched twice. |
| Switch theme | < 50 ms, no React render | Only four data attributes on `<html>` change. Every colour is a CSS variable. |

### Decisions that remove both code and work

| Decision | Instead of | Saves |
|---|---|---|
| The editor edits Markdown text directly | A rich-text editor (ProseMirror/TipTap) plus Markdown conversion | A whole conversion layer and its fidelity bugs. Commits change only the lines that changed. |
| Blob-SHA cache | Timestamps and invalidation rules | Cache-invalidation code; every repeat download |
| `createCommitOnBranch` | The blob → tree → commit → ref sequence in the REST Git API | Three of four requests, plus built-in conflict detection |
| Sibling folders, fixed filenames, root-relative links | README promotion, title-based names, relative links | Multi-file rewrites on everyday edits |
| d3 for layout, bundling, zoom and packing | Custom geometry | Hundreds of lines |
| Plain `fetch` | Octokit | Bundle size; the app uses 4 REST endpoints and 4 GraphQL operations |
| Discovery by marker file | A settings store that syncs across devices | A settings service |
| Themes are CSS variables generated from one JSON file | A theming library or CSS-in-JS | A runtime dependency, and a re-render on every theme switch |

### Deliberately not built (until a budget fails)

- A Web Worker for parsing. Regex parsing 1,000 leaves takes milliseconds.
- A canvas map renderer.
- A full-text search engine: search scans titles and the leaves' text in the blob cache; MiniSearch if that gets slow.
- List virtualization in the Explorer: branches start collapsed below depth 1.
- Real-time collaboration, and any backend.

### Risks to watch

- **Printing in Tauri** differs per OS. Test it in the first desktop build.
- **Linux webviews (WebKitGTK)** render SVG more slowly. The performance tests should run there too.
- **Browsers can evict IndexedDB** under storage pressure, which matters most on phones. Call `navigator.storage.persist()`, and treat local data as a cache plus a short-lived outbox; committing on app hide keeps that outbox small.
- **GitHub secondary rate limits** apply to bursts of writes. Batched commits keep the app well below them.
- **Large binaries bloat a repository.** Images over 4096 px are scaled down on upload, any file over 10 MB gets a warning before it is committed, and one over 100 MB (GitHub's limit for a file) is refused.

## 12. Module map

```
src/
  github/   client.ts (fetch, auth, ETag) · graphql.ts (the 4 operations)
            endpoint.ts (the API base; a local fake only in e2e builds)
  store/    db.ts (IndexedDB via idb-keyval) · session.ts (Zustand store)
  model/    parse.ts · tree.ts (paths → hierarchy, sibling-folder rule) · embeds.ts · diff.ts (line diff)
            graph.ts (titles, word totals, threads, backlinks)
            links.ts (find and rewrite) · sha.ts (git blob SHA)
  local/    folder.ts (a Family in a folder: File System Access API, or the desktop's commands)
  sync/     pull.ts · push.ts · merge.ts · autosave.ts · assets.ts (images by SHA) · folder.ts (§5.6)
            structure.ts (new leaf, branch, branch text, move, delete as file changes) · overlay.ts
  map/      layout.ts (one Tree, d3) · family.ts (a Family's Trees, placed) · families.ts (every Family, merged)
            TreeMap.tsx · useZoom.ts
  views/    views.ts (ids, saved choice) · ViewSwitcher.tsx · index.ts (lazy chunks) · common.ts
            Canvas.tsx (the drawn views' stage) · MindMap · Outline · Columns · Treemap · Graph · Rings · Atlas
            layout/ (pure: mindmap, treemap, graph, rings, atlas)
  editor/   Editor.tsx · LeafEditor.tsx · livePreview.ts · metaLine.ts · IconPicker.tsx · EditableCover.tsx
            insertMenu.ts · mentions.ts · images.ts (scale, encode) · attach.ts (files)
            emoji.ts (every emoji, names and keywords, for the icon picker; lazy)
  read/     render.ts (markdown-it) · rich.ts (math, code, embeds) · Peek.tsx · print.css
            History.tsx (a leaf's past versions, compared and restored)
            LeafLook.tsx (cover, colours) · cover.ts (cover position) · files.ts (file cards)
  ui/       App.tsx (routes) · Start.tsx (`#/`) · AllView.tsx (`#/all`) · TopBar.tsx · TokenScreen.tsx
            FamilyView.tsx (Explorer | map or a view | Peek) · FamilyMenu.tsx · Explorer.tsx · Appearance.tsx
            Settings.tsx (the settings frame) · ViewsSettings.tsx · TreeColours.tsx
            theme.ts (turns design/themes/themes.json into CSS, applies it)
  store/    token.ts (the token: IndexedDB on the web, the OS keychain on desktop)
src-tauri/  the desktop shell (Tauri 2): tauri.conf.json (window, CSP, bundle) ·
            src/lib.rs (keychain commands get_token / set_token / delete_token) ·
            src/folder.rs (folder commands, §5.6) · icons/
```

`model/` and the planning half of `sync/` are pure TypeScript with no DOM or network. Most of the logic lives there, and is unit-tested there.

## 13. Themes

The original design, Vanta with green accents and Geist, is the default. Users can change the look; it never changes what is stored in their repositories.

### Three independent layers

| Layer | Options | What changes |
|---|---|---|
| **Base** | Vanta (default), Graphite (softer dark), Paper (light) | Every surface, text and line colour, and whether the theme is dark or light |
| **Accent** | Green (default), Amber, Blue, Violet | Headings, threads, selection, buttons and focus rings. Each accent has a dark-mode and a light-mode value, tuned so it stays readable on either kind of base. |
| **Reading font** | Geist (default), Newsreader (serif) | Only the text of leaves; the interface stays in Geist |

Any combination works: 3 bases × 4 accents × 2 fonts gives 24 themes from 9 definitions, with no pair designed by hand.

### One source of truth

- `design/themes/themes.json` holds every value. The app imports it at build time.
- `ui/theme.ts` turns it into CSS once at start-up: one block of variables per base, one per accent per mode.
- **Applying a theme sets four data attributes** on `<html>`: `data-base`, `data-mode`, `data-accent` and `data-font`. CSS does the rest.
  - There is no React re-render, and the map's SVG changes colour with everything else.
- **No colour is written anywhere else in the code.** A test scans `src/` and fails on any hex or `rgb()` value outside the theme file. This rule is what makes theming free.

### Contrast is guaranteed

- **Every built-in combination passes WCAG AA:** body text at least 7:1; secondary text, headings and button text at least 4.5:1; map dots at least 3:1.
- `design/themes/check.py` checks the rules today; the app's unit tests run the same rules on every combination.
- **Custom colours** (a custom theme, or a hex value in a leaf's metadata) are checked the same way. A colour that fails is adjusted in lightness until it passes, and the editor says so.

### Colours in Trees and leaves are names, not values

- A leaf's heading colour or a Tree's colour is stored as a name, for example `"amber"`, and resolved through the current theme. An amber heading is the dark-mode amber on Vanta and the light-mode amber on Paper.
- A raw hex value is still allowed and goes through the contrast adjustment: `read/colors.ts` keeps one adjusted value per mode on the leaf's container (`data-leaf`), and the theme CSS picks the mode's, so switching still re-renders nothing.
- **Order of priority:** leaf colour → Tree colour (`.yeraz.json` `trees`) → Family colour (`color`) → theme accent.
- Settings › Tree colours sets the Family's and each Tree's colour; Settings › Appearance the interface's.

### Saving the choice

- The theme is a personal preference, not repository content. It is saved per device: the base, accent and font ids in `localStorage`.
- **No flash of the wrong theme:** a few lines of inline script in `index.html` read the saved choice and set the data attributes before the first paint.
- The browser's `theme-color` follows the base's top-bar colour, so the phone status bar matches.
- Syncing the choice across devices is left for later (development-plan.md, After launch).

### Logo and print

- **The logo has no accent colour.** It is a steel Y in shades of grey, so it never changes with the accent.
- **Light bases** use `design/brand/svg/yeraz-mark-light.svg` in the top bar: the same six faces in dark gunmetal instead of bright steel. The app icon never changes with the theme.
- **Printing** always uses Paper (§8).

### Custom themes

A custom theme is a small JSON file that starts from a base and overrides tokens:

```json
{ "yerazTheme": 1, "name": "Midnight", "base": "graphite", "accent": "#5AC8FA", "font": "geist", "tokens": { "bg": "#0E1116" } }
```

It can be imported, exported and shared, and the same contrast rules apply to it. Because the app is open source, people can also contribute themes to the repository.

- **Made in Settings › Appearance** (`ui/ThemeEditor.tsx`): from the current theme, from a file, or from `themes/`. Every colour is a picker; a colour that fails a rule is adjusted (`ui/contrast.ts`, `readable`) and the editor names it.
- **Checked before it reaches a stylesheet** (`ui/customTheme.ts`): known tokens only, values `#RRGGBB` or `rgba(…)` with four numbers. Anything else is refused with a reason.
- **Applied like the built-in themes:** a fifth attribute, `data-custom`, and one `<style>` whose selector outranks the base and accent blocks, on screen only, so printing keeps Paper. It is saved per device, with its CSS in the record `index.html` reads, so it never flashes either.
- **`themes/`** holds community themes; `npm test` requires each one to pass every rule as written.
