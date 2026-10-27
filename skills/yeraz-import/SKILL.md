---
name: yeraz-import
description: Bring notes from Obsidian, Notion, Logseq, Bear, OneNote (HTML or MHT exports), Apple Notes, iA Writer or any folder of Markdown or HTML into a Yeraz Family, every page with a title and an emoji that says what it is about. Use when someone asks to import, migrate, convert or move their notes into Yeraz, or to give their notes emoji icons. Needs Node 20 or newer and nothing else, not even the Yeraz repository.
---

# Import notes into Yeraz

`convert.mjs` in this folder turns a folder of notes into a new folder in Yeraz's repository
format: `.md` leaves whose line 1 is `# <emoji> <title>`, sub-leaves in a sibling folder of the
same name, a branch's text in its `README.md`, root-relative links (threads), files in
`assets/`, `.yeraz.json` at the root. It never changes the source. `<skill>` below is this
folder; run everything with plain `node`.

## 1. Find the source

Ask where the notes are, then:

- **Obsidian:** the vault folder itself. `.obsidian/` and other hidden files are skipped.
- **Notion:** Settings › Export all workspace content (or a page's ••• › Export), format
  *Markdown & CSV*, *Include subpages*; unzip it, and any zip inside it, and use that folder.
  Databases (`.csv`) are kept as files in `assets/`.
- **Logseq:** the graph folder (the one holding `pages/` and `journals/`). Pages keep their
  names, journals become `Journals/<date>.md`, namespaces (`a/b`) become sub-leaves, the outline
  becomes prose with lists, `key:: value` properties are kept in a comment, TODO and DONE become
  task boxes.
- **Bear, iA Writer, Ulysses, Typora:** export as Markdown with attachments, into a folder.
- **OneNote:** OneNote for Windows can export a page or a section as a *Single File Web Page*
  (`.mht`) or as HTML (File › Export); the exporter tools that write Markdown work too. `.docx`
  exports are not read: convert them first with `pandoc file.docx -t gfm --extract-media=.` if
  pandoc is installed, or export as HTML instead. The script says which files it skipped.
- **Apple Notes:** export to Markdown with a tool such as Exporter (App Store), then use that folder.
- **Anything else:** a folder of `.md`, `.txt` or `.html` files.

## 2. Take the inventory and choose the emojis

```sh
node <skill>/convert.mjs inventory "<source>" > inventory.json
```

Each page has `path`, `title`, `excerpt`, `emoji` and `suggested`. Where `suggested` is true the
emoji is the script's guess from the words of the title, the folders and the first lines, or
its default (📝). Read those pages and choose better ones yourself: one emoji each, the thing
the page is about (a person 👤, a place 🗺️, a recipe 🍳, a language 🗣️, a decision ⚖️), the
same emoji for pages of one kind, a flag only for a country, and nothing that reads as text
(no © or digits). Write them to `emojis.json` as `{ "<path>": "<emoji>", … }` keyed by the
page's `path`. A title that already starts with an emoji keeps it. With more than a few hundred
pages, choose for the folders' README pages and the pages the script marked as default (📝)
and let the guesses stand for the rest; say so in the summary.

## 3. Convert, into a folder that doesn't exist yet

```sh
node <skill>/convert.mjs convert "<source>" "<new folder>" --name "<Family name>" --emojis emojis.json
```

Options: `--default-emoji 📄` for pages nobody chose for; `--no-emoji` to leave titles bare;
`--color amber` for the Family's colour (a Yeraz colour name). Then read the summary to the
person: leaves, files in `assets/`, links rewritten, notes linked but never written (they show
as ghosts, to write later), and files skipped. Spot-check two or three converted pages against
the source, the titles' emojis included.

## 4. Open it in Yeraz

- **A folder:** in Yeraz, *Use a folder* (the desktop app, or Chrome or Edge on a computer) and
  pick the new folder. A phone keeps notes in its own storage: *Copy in a folder* there.
- **GitHub:** `cd "<new folder>" && git init -b main && git add -A && git commit -m "Import notes"`,
  push it to a new private repository, then Refresh in Yeraz: it is found by its `.yeraz.json`.

The format in one line: a leaf is a `.md` file whose line 1 is its title, with an emoji at its
start as its icon; `keycloak.md` plus `keycloak/` is a leaf with sub-leaves; a folder without
such a file is a branch, and its `README.md` is the branch's text; threads are root-relative
links such as `[OAuth](/identity/oauth.md)`; images and files live in `/assets/`.
