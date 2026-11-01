# yeraz-import

A [Claude Code](https://claude.com/claude-code) skill (and a plain Node script) that brings
notes from Obsidian, Notion, Logseq, Bear, OneNote exports or any folder of Markdown or HTML into
a [Yeraz](https://github.com/Alessandro-Schmidt/YerazNotes) Family: every page a leaf with
a title and an emoji icon, links as threads, files in `assets/`. It needs Node 20 or newer and
nothing else; the Yeraz repository is not required.

Install the skill:

```sh
npx skills add Alessandro-Schmidt/YerazNotes --skill yeraz-import
```

or copy this folder to `~/.claude/skills/yeraz-import/`. Then ask Claude to import your notes.

Or run the script by hand:

```sh
node convert.mjs inventory ~/Obsidian/Vault > inventory.json   # pages, titles, suggested emoji
node convert.mjs convert ~/Obsidian/Vault ~/Notes/Vault --name "My notes" [--emojis emojis.json]
```

`emojis.json` maps a page's path to its emoji (`{ "Identity/Keycloak.md": "🔐" }`); pages without
one get the script's guess from their words, then `--default-emoji` (📝). `--no-emoji` leaves
titles bare. The source folder is never changed.
