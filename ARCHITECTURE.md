# Yeraz — Architecture

Yeraz is a note-taking app whose notes live as Markdown files in the user's own GitHub repositories, and whose main screen is a map of how those notes are structured and connected.

- **Why and what:** `ideas.txt`
- **Order of work and testing:** `development-plan.md`
- **Visual design:** `design/` holds screenshots of every screen, their source files, and the logo and app icons. `design/README.md` explains each file and links the original design canvas.

This document was written with two lenses: **performance** and **least code**. Most decisions below serve both, and §11 reviews them explicitly.

---

## 1. Principles

1. **GitHub is the backend.** There is no server of ours. A repository is a database, a commit is a transaction.
2. **Markdown text is the only document model.** The editor edits text directly. Nothing is converted to another format and back, so nothing can be lost in conversion, and diffs stay minimal.
3. **Everything is cached by content hash.** Each file version is stored locally under its git blob SHA. A SHA never changes meaning, so the cache never needs invalidating and nothing is downloaded twice.
4. **One codebase, two shells.** The same static web build runs on GitHub Pages (installable on phones) and inside a Tauri desktop app.
5. **Common edits touch one file.** The repository format (§4) is designed so editing, adding a sub-note or renaming a title never rewrites other files.
6. **Measure before adding.** No Web Worker, list virtualization, canvas renderer or search engine until a performance budget (§11) fails without it.

## 2. Vocabulary

| Term | Means | On GitHub |
|---|---|---|
| **Tree** | One knowledge base | One repository |
| **Branch** | A grouping of notes | A folder |
| **Leaf** | A note | A `.md` file |
| **Thread** | A link from one leaf to another (`@mention`) | A Markdown link |
| **Explorer** | Left panel: the file view of a Tree | — |
| **Map** | Centre: the radial knowledge map | — |
| **Peek** | Right panel: partial view of the selected leaf | — |

"Branch" here never means a git branch. Each Tree uses its repository's default branch only.

## 3. System overview

```
┌──────────────────────── Yeraz (static React build) ────────────────────────┐
│  UI      Home (all Trees) · Tree view (Explorer | Map | Peek) · Editor      │
│  Model   in-memory index: leaves, branches, threads (derived, never saved)  │
│  Store   IndexedDB: blobs by SHA · parsed leaves by SHA · dirty files ·     │
│          last tree + ETag per Tree                                          │
│  Sync    GitHub REST (4 endpoints) + GraphQL (3 operations)                 │
└───────────────────────────────────┬────────────────────────────────────────┘
                                    │ HTTPS, user's token
                                    ▼
                    api.github.com  — one repository per Tree

Shells:  GitHub Pages (PWA, phones + desktop browsers)
         Tauri 2 (Windows .exe/.msi, macOS .dmg, Linux .AppImage/.deb)
```

## 4. Repository format (the contract)

These rules are the only thing that must stay stable across versions. Tests lock them.

| Rule | Example |
|---|---|
| A leaf is a `.md` file. **Line 1 is the title.** | `# Keycloak` |
| An emoji at the start of the title is the leaf's icon. | `# 🔐 Keycloak` |
| Optional **line 2** is a metadata comment: cover and the part of it that shows (`coverPosition`, percent from the top, centred when absent), image icon, colours. It is invisible when GitHub renders the file. Colours are **named** (`green`, `amber`, `blue`, `violet`…), so they adapt to every theme (§13). | `<!-- yeraz {"cover":"https://…","coverPosition":30,"color":{"heading":"amber"}} -->` |
| A leaf's sub-leaves and sub-branches live in a **sibling folder with the same name**. | `identity/keycloak.md` + `identity/keycloak/realms.md` |
| A branch is a folder with no sibling `.md` file of the same name. Its name is the folder name, kept as typed. Git stores no empty folders, so a new branch is created with its first leaf. | `AI Agents/` |
| A branch's **text** is the `README.md` in its folder (that name exactly, case included), which GitHub shows under the folder's files. It is not a leaf: no node, no words in the totals, and its line 1 doesn't rename the branch. A folder holding only its `README.md` is still a branch. The root's `README.md`, and one in a leaf's sibling folder, stay ordinary leaves. Links in a branch's text are threads from the branch; a link to it is a thread to the branch. | `AI Agents/README.md` |
| A thread is a normal Markdown link with a **root-relative** path. GitHub resolves paths starting with `/` from the repository root, so threads also work on github.com. | `[Keycloak](/identity/keycloak.md)` |
| A thread to another Tree is a full GitHub URL to a file in a connected repository. Any other `github.com/owner/repo` URL renders as a repository card. | `https://github.com/user/art-history/blob/main/baroque.md` |
| Images and attachments live in `assets/` at the root, at full quality. An image is committed unchanged unless its long edge is over 4096 px (§8). | `assets/2026-10-14-realm-diagram.png` |
| A paragraph that is only a link to a YouTube video, or to a PDF or video (`.mp4`, `.webm`) in `assets/`, shows as a player; one to any other file in `assets/` shows as a card that downloads it. On GitHub it stays a link. A video's subtitles are `name.<lang>.vtt` files beside it. | `[OIDC spec](/assets/oidc.pdf)` · `assets/talk.mp4` + `assets/talk.en.vtt` · `[Q3 report.xlsx](/assets/2026-10-17-q3-report.xlsx)` |
| A paragraph that is only a titled link to any other web page is a **bookmark**: a card with its title and address. A bare URL stays a plain link. On GitHub both are links. | `[Baroque](https://en.wikipedia.org/wiki/Baroque)` |
| Math is `$inline$` and `$$display$$`, as GitHub writes it. | `$e^{i\pi} + 1 = 0$` |
| `.yeraz.json` at the root marks a repository as a Tree. | `{"name":"Engineering","color":"green"}` |
| The filename is fixed when the leaf is created (a slug of its first title). Changing the title does not rename the file. | Title "Keycloak (IdP)" stays in `keycloak.md` |

Why these rules:

- **Sibling folders instead of `folder/README.md`.** Giving a leaf its first sub-leaf only adds a folder; the leaf itself never moves. With the README convention the leaf would move, and every link to it would need rewriting.
- **A branch's text in `README.md`.** A branch has no file of its own, and GitHub already shows a folder's README under its files. Adding text to a branch adds one file; nothing moves. The root keeps its `README.md` as a leaf, since most repositories already have one that describes the repository.
- **Fixed filenames.** Renaming a title is the most common structural edit. It touches one file.
- **Root-relative links.** Moving a leaf does not break that leaf's own outgoing links. Only links pointing *to* it change. The backlink index finds them, and they are rewritten in the same commit as the move.

## 5. Data flow

### 5.1 Opening a Tree (read path)

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

The map is **progressive**: it renders right after step 1 using only paths and blob sizes (bytes ÷ 6 ≈ words), then refines as content arrives.

### 5.2 Writing and saving (write path)

- A keystroke changes only the editor state. After 500 ms of no typing, the text is written to IndexedDB under `dirty[path]`. It survives crashes, closed tabs and lost connections.
- **A commit happens when any of these occurs:**
  - 2 minutes pass with no edits.
  - The user leaves the leaf, or the app goes to the background (`visibilitychange` → hidden).
  - The user presses Ctrl/Cmd+S.
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

### 5.3 Finding Trees (Home)

After sign-in, one GraphQL query lists the user's repositories and checks each for the marker file (`object(expression:"HEAD:.yeraz.json")`). Every repository that has it is a Tree. No device needs to be told which Trees exist.

Creating a Tree from the app means:

1. `POST /user/repos` with `private: true`.
2. A first commit containing `.yeraz.json` and a welcome leaf.

Renaming a Tree changes only `name` in `.yeraz.json`. The edit is committed like any other, and the file keeps its other fields and its layout. Until the commit lands, the name typed on this device wins over what discovery reports, so Home and the map never show the old name again. The repository keeps its name; links and clones are untouched.

## 6. The map

- **Layout: a radial cluster from `d3-hierarchy`,** with branches fanning out from a core (the Tree):
  - `cluster()`: every node without children gets an angle of its own, and a parent sits among its children, so nothing on an outer ring shares an angle with a leaf further in.
  - Each depth sits on its own ring. Neighbours are separated by their dots and labels on every ring between them (inner rings are shorter, so they need more of the angle).
  - A ring moves out when a label on the ring inside it, running along the radius, wouldn't end before it.
- **Threads use hierarchical edge bundling:** `d3.lineRadial().curve(d3.curveBundle.beta(0.85))` drawn through `source.path(target)`.
  - d3 already returns the path through the two leaves' common ancestor, so this is about ten lines of code.
  - Bundling is what keeps the map readable as threads multiply. A force-directed layout (Obsidian's approach) turns into a tangle.
- **Encodings (from the design):**

  | What you see | Means |
  |---|---|
  | Node area | Words written: radius = a + √words × k |
  | Filled dot | Leaf |
  | Hollow ring | Branch |
  | Filled dot with a ring | Leaf with sub-leaves |
  | Donut around the core | Share of words per top-level branch |
  | Green curve | Thread |
- **Rendering:**
  - React renders the SVG geometry once per data change (memoised).
  - Pan and zoom use `d3-zoom`, which writes a single `transform` attribute on one `<g>`. **React does not re-render during pan or zoom.**
  - Selecting adds `data-focus` on the map, then draws a translucent veil over the map and copies of the selection's neighbours (from a precomputed adjacency map) above it, in a second `<svg>` with its own compositor layer. The work depends on the number of neighbours, not the size of the Tree, and the map itself is never repainted. (Restyling every node to dim it cost about 4× more on a throttled phone.)
  - Semantic zoom works the same way: a `data-zoom` attribute (`far` hides labels below the first ring, `near` shows them).
- **Labels never overlap each other or a dot** (a unit test checks the example Tree, the design's Trees and generated ones). Labels are horizontal, as in the design, wherever they fit; one that would touch another label or a dot turns to follow the radius. Trees of more than 60 leaves turn every leaf label. Widths are estimated from the characters, since layout runs without a DOM.
- **Fit** is the bounding box of every dot and label, so a lopsided Tree still fills the screen. A long Tree title wraps onto two lines in the core.
- **Home** lays out every Tree independently:
  - Each is scaled by √(total words) and placed with `d3.packSiblings`.
  - Only branch labels are drawn at that zoom.
  - Threads between Trees are drawn as dashed curves between their cores.
  - **Every dot opens straight into its Tree.** A click reaches the dot whose edge is nearest the pointer, within 10 px (18 px for touch), so even the smallest dots are easy to hit. Clicking the core opens the Tree itself; clicking anywhere else on a Tree selects it. `nodeAt` in `layout.ts` does the search in layout units, through the Tree's screen transform, so no hit area is added per dot. Hovering lights up the reached dot and names it in a tip, using attributes only and never a React render.
- **Ceiling:** SVG should hold 60 fps up to about 2,000 nodes on a mid-range phone; the performance tests confirm the real number. Above it, the node and edge layers can be swapped for one `<canvas>` using the same layout data. That swap is planned, not built.

## 7. Editor

- **CodeMirror 6** with `@codemirror/lang-markdown` (GitHub-flavoured). The document in the editor *is* the file's text.
- **Live preview is one decoration extension.** It:
  - hides Markdown syntax on lines that don't hold the cursor, and styles headings and quotes;
  - replaces the right ranges with widgets: images, `@` chips, checkboxes, math (KaTeX), YouTube embeds, PDFs, video with subtitle tracks, repository cards and bookmarks.
- **"Show the code" turns that extension off.** Same editor, same text, no conversion.
- **`@` mentions** use `@codemirror/autocomplete` over the in-memory index. Picking a leaf inserts `[Title](/path.md)`, which is displayed as a chip with the target's icon.
- **Hold Ctrl/Cmd for 2 seconds** to open the insert menu: to-do list, ordered list, bullet list, mention, image from files, attach a file, new leaf, new branch.
  - The timer starts when the modifier is pressed on its own. Any other key, or releasing the modifier, cancels it, so normal shortcuts like Ctrl+C never open the menu.
  - Phones have no Ctrl key: a long-press or typing `/` opens the same menu.
- **Pasting a URL** (one http(s) address, into a plain paragraph) inserts it as it is and offers *Keep as link* or *Bookmark*. A bookmark rewrites it as `[Title](url)` in a paragraph of its own; the title comes from the URL's last path segment, or its site, since the browser can't fetch other sites' pages. Typing, moving away or Escape keeps the link.
- **Code blocks** use CodeMirror's nested languages from `@codemirror/language-data`, loaded per language on demand. The read view highlights with the same Lezer parsers (`highlightCode`), so there is one highlighting system, not two.
- **The header above the text** (cover, icon, colours) is drawn from line 1 and line 2. Colours are applied as CSS variables on the leaf container: `--leaf-text` and `--leaf-heading`, with headings in the theme's accent by default.
- **A branch's text** (`folder/README.md`) is edited in the same editor, at its path, without that header. Before it exists, the branch's Peek offers *Add text*: the editor starts from `# Branch name` and the first save creates the file, committed like any edit.

## 8. Read view and PDF

- The Peek panel and read-only pages render HTML with `markdown-it` (plus task lists and KaTeX). Output is cached by blob SHA.
- **PDF export** uses a print stylesheet and `window.print()` on the read view.
  - Video embeds print as a thumbnail with a link.
  - On desktop, check Tauri's webview printing on all three OSes early in development. The fallback is a small Rust command that calls the webview's native print.
  - PDFs always use the original images, never smaller copies.
  - Printing always uses the Paper base, whatever theme is on screen, so a dark theme never prints as a black page.

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
| Select a leaf | < 50 ms to highlight and open the Peek | Precomputed adjacency. Class toggles only. Read HTML cached by SHA. |
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
| Plain `fetch` | Octokit | Bundle size; the app uses 4 REST endpoints and 3 GraphQL operations |
| Discovery by marker file | A settings store that syncs across devices | A settings service |
| Themes are CSS variables generated from one JSON file | A theming library or CSS-in-JS | A runtime dependency, and a re-render on every theme switch |

### Deliberately not built (until a budget fails)

- A Web Worker for parsing. Regex parsing 1,000 leaves takes milliseconds.
- A canvas map renderer.
- A full-text search engine: title search first, MiniSearch if asked for.
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
  github/   client.ts (fetch, auth, ETag) · graphql.ts (the 3 operations)
            endpoint.ts (the API base; a local fake only in e2e builds)
  store/    db.ts (IndexedDB via idb-keyval) · session.ts (Zustand store)
  model/    parse.ts · tree.ts (paths → hierarchy, sibling-folder rule) · embeds.ts
            graph.ts (titles, word totals, threads, backlinks)
            links.ts (find and rewrite) · sha.ts (git blob SHA)
  sync/     pull.ts · push.ts · merge.ts · autosave.ts · assets.ts (images by SHA)
            structure.ts (new leaf, branch, branch text, move, delete as file changes) · overlay.ts
  map/      layout.ts (d3) · TreeMap.tsx · HomeMap.tsx · Home.tsx · useZoom.ts
  editor/   Editor.tsx · EditorPage.tsx · livePreview.ts · IconPicker.tsx · EditableCover.tsx
            insertMenu.ts · mentions.ts · images.ts (scale, encode) · attach.ts (files)
            emoji.ts (every emoji, names and keywords, for the icon picker; lazy)
  read/     render.ts (markdown-it) · rich.ts (math, code, embeds) · Peek.tsx · print.css
            LeafLook.tsx (cover, colours) · cover.ts (cover position) · files.ts (file cards)
  ui/       App.tsx (routes) · TopBar.tsx · TokenScreen.tsx · TreeView.tsx
            Explorer.tsx · Appearance.tsx
            theme.ts (turns design/themes/themes.json into CSS, applies it)
  store/    token.ts (the token: IndexedDB on the web, the OS keychain on desktop)
src-tauri/  the desktop shell (Tauri 2): tauri.conf.json (window, CSP, bundle) ·
            src/lib.rs (keychain commands get_token / set_token / delete_token) · icons/
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
- **Order of priority:** leaf colour → Tree colour → theme accent.

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
