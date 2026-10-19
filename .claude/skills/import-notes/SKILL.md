---
name: import-notes
description: Bring notes from Obsidian, Notion, Logseq, Bear or any folder of Markdown into Yeraz as a new Family. Use when someone asks to import, migrate or move their notes from another app.
---

# Import notes into Yeraz

`npm run import` (scripts/import-notes.ts, logic in src/import/convert.ts) converts a folder of notes into a
new folder in the repository format (CLAUDE.md, ARCHITECTURE.md §4). It never changes the source.

1. Find the source with the person:
   - **Obsidian**: the vault folder itself (`.obsidian/` and other hidden files are skipped).
   - **Notion**: Settings › Export all workspace content (or a page's ••• › Export), format
     *Markdown & CSV*, *Include subpages*; unzip it (and any zip inside it) and use that folder.
   - **Anything else** (Logseq's `pages/`, Bear or iA Writer exports, a plain folder): the folder of `.md` files.
2. Run, into a folder that doesn't exist yet:
   `npm run import -- "<source>" "<new folder>" --name "<Family name>"`
3. Read the summary to the person: leaves, files moved to `assets/`, links rewritten, and the notes linked
   but never written (they show as ghosts, to write later). Spot-check two or three converted files.
4. Open the result:
   - **A folder**: in Yeraz, *Use a folder* (desktop app, or Chrome / Edge on a computer) and pick it.
   - **GitHub**: `cd "<new folder>" && git init -b main && git add -A && git commit -m "Import notes"`, push it
     to a new private repository, then Refresh in Yeraz: it is found by its `.yeraz.json`.

What it converts: Notion's ids out of every name (a page and its folder become a leaf with sub-leaves);
`[[wikilinks]]` (aliases, `#heading`, `![[embeds]]`) and relative links into root-relative links (threads);
every other file into `assets/`; line 1 becomes the title (front matter's `title`, else the file name), with
the front matter kept in a comment below it; a folder note `Folder/Folder.md` becomes `Folder/README.md`.
Notion databases (CSV) are copied to `assets/` as files.
