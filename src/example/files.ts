// What a new Family starts with, beyond its marker and a welcome leaf (owner's requests):
// - `CLAUDE.md`, a leaf telling an AI agent how notes are kept here (the repository format,
//   ARCHITECTURE.md §4), which Claude Code and most agents read by that name;
// - the example Family, for a first look: a few leaves showing threads, tasks, embeds, math,
//   code and a branch's text, to keep, change or delete.

/** The file an agent reads first; a leaf at the root, so it is a Tree of its own on the map. */
export const AGENTS_FILE = 'CLAUDE.md'

export const AGENTS_TEXT = `# 🤖 Notes for AI agents

These notes are kept with [Yeraz](https://github.com/Alessandro-Schmidt/YerazKnowledge). An agent writing here keeps to this format, so the map stays right.

## One leaf, one file

- A leaf is a \`.md\` file. Its line 1 is its title: \`# 🔐 Keycloak\`. The emoji at the start is its icon on the map: give every new leaf one that says what it is about.
- Line 2 may hold metadata in a comment: \`<!-- yeraz {"color":{"heading":"amber"}} -->\`. Leave it as it is; never write text on line 2.
- Sub-leaves live in a folder with the same name beside the leaf: \`keycloak.md\` and \`keycloak/realms.md\`.
- A folder without a same-named file is a branch; the \`README.md\` inside it is the branch's text, not a leaf. Every folder or leaf at the root is a Tree.
- File names stay when titles change: links depend on them.
- A template for new leaves is a \`.md\` file in \`.yeraz/templates/\` (never a leaf): its line 1 is its name, and \`{{title}}\`, \`{{date}}\` and \`{{tree}}\` in its text are filled in when a leaf is made from it.

## Threads

- Mention another leaf with a root-relative link: \`[Keycloak](/identity/keycloak.md)\`. The map draws a thread between the two. A link to a leaf not written yet is fine: it shows as a ghost, a leaf to write.
- Images and files go in \`/assets/\`: \`![Realm](/assets/realm.png "width=50%")\`.
- A paragraph (or list item) that is only a YouTube link, or a link to a PDF or video in \`/assets/\`, plays in place. Math is \`$x^2$\` or \`$$…$$\`; code uses fences with a language.

## Writing well here

- Short leaves, one subject each, linked rather than repeated. Prefer a new leaf beside the one it grows from.
- Keep the person's words and voice; add structure, not opinions. Task lists (\`- [ ]\`) are for things to do.
- Don't touch \`.yeraz.json\` (the Family's name and colours) or anything in \`assets/\` unless asked.
- When \`.yeraz.json\` names a \`root\` folder (\`"root":"notes"\`), the notes live in that folder: every path here, links included, starts inside it.

## Text encoding

- Write every file as UTF-8 without a BOM. Emoji, \`→\` and accents must stay as they are: \`â†’\`, \`Ã©\` or \`ðŸ\` in a note means a file was read or written in another encoding.
- On Windows, PowerShell 5.1's \`Set-Content\`, \`Add-Content\`, \`Out-File\` and \`>\` don't write UTF-8 by default, and \`Get-Content\` misreads it: use your file tools, or pass \`-Encoding utf8\` both ways.
- Fix such text where you find it: \`â†’\` is \`→\`, \`â€™\` is \`’\`, \`â€”\` is \`—\`, \`Ã©\` is \`é\`.
`

/** The example Family's leaves, written where the person wants it kept. */
export const EXAMPLE_NAME = 'Example'
export const EXAMPLE_FILES: Record<string, string> = {
  [AGENTS_FILE]: AGENTS_TEXT,
  'Welcome.md': `# 🌱 Welcome

This is an example Family: a few notes to look around in, change, or delete. Every leaf is a Markdown file; line 1 is its title, the emoji at its start its icon.

- The map draws a **thread** wherever a leaf mentions another: [Yeraz](</Projects/Yeraz.md>) mentions this leaf.
- A folder is a **branch**; its text is the \`README.md\` inside, like [Projects](</Projects/README.md>).
- A link to a leaf not written yet, like [Ideas](/Ideas.md), shows as a ghost: a leaf to write.
- Edits are saved as you type. Hold Ctrl (⌘ on a Mac) for a second while writing to see what can be inserted.
- [Notes for AI agents](/${AGENTS_FILE}) tells an agent such as Claude Code how notes are kept here.
- A new leaf can start from a **template**: *Meeting* is one, under *Start from* in New leaf. Settings › Templates keeps them.
`,
  '.yeraz/templates/meeting.md': `# 📝 Meeting

{{title}}, on {{date}}, in {{tree}}.

## Decisions

- [ ] 

## Next

- [ ] 
`,
  'Projects/README.md': `# 🧭 Projects

What is being built, one leaf each. A branch's text is this file, \`README.md\`, shown above what the branch holds.
`,
  'Projects/Yeraz.md': `# 🗺️ Yeraz

Notes as Markdown, drawn as a map. Start at [Welcome](/Welcome.md).

- [x] Keep the files plain, so GitHub and any editor read them
- [ ] Hide a leaf from the map when it is done with
- [ ] Try the views: Outline, Columns, Treemap

A snippet, highlighted by language:

\`\`\`ts
const thread = (from: string, to: string) => \`[\${to}](/\${to}.md)\`
\`\`\`

A little maths: the map scales a node by $r = \\sqrt{w}$, where $w$ is its words.

A video, from a paragraph of one link:

https://www.youtube.com/watch?v=dQw4w9WgXcQ
`,
  'Reading/README.md': `# 📚 Reading

Books and pages worth keeping, with what they left behind.
`,
  'Reading/Meditations.md': `# 🏛️ Meditations

Marcus Aurelius, read on the train. Pairs well with [Yeraz](/Projects/Yeraz.md): write things down.

> You have power over your mind, not outside events. Realize this, and you will find strength.

[Meditations on Wikipedia](https://en.wikipedia.org/wiki/Meditations)
`,
}
