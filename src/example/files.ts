// What a new Family starts with, beyond its marker and a welcome leaf (owner's requests):
// - `CLAUDE.md`, a leaf telling an AI agent how notes are kept here (the repository format,
//   ARCHITECTURE.md §4), which Claude Code and most agents read by that name;
// - the example Family, for a first look: four Trees (Mathematics, Software, Chess, Armenia)
//   whose leaves mention one another across Trees, so the map shows threads, sub-leaves, a
//   ghost, tasks, math, code, a table, a diagram, callouts and templates; to keep or delete.

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

- Short leaves, one subject each. Link to a leaf instead of repeating it, and prefer a new leaf beside the one it grows from.
- Keep the person's words and voice. Add structure, and keep your own opinions out. Task lists (\`- [ ]\`) are for things to do.
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

This is an example Family: four Trees, **Mathematics**, **Software**, **Chess** and **Armenia**, whose notes keep running into one another. Look around, change anything, or delete it all.

## Follow a thread

Start anywhere and the threads lead on. One path through all four Trees:

1. [Tigran Petrosian](/Chess/players/tigran-petrosian.md), the Armenian world champion, made Armenia a [chess nation](/Armenia/chess-nation.md).
2. Chess rates its players with the [Elo system](/Chess/ratings.md), which is [probability](/Mathematics/probability.md) at heart,
3. and a small [rating service](/Software/rating-service.md) computes it in a few lines of code.
4. The [chess engine](/Software/chess-engine.md) searches a tree of moves with [minimax](/Software/minimax.md), a game far too big to count by hand: see [combinatorics](/Mathematics/combinatorics.md).
5. The knight's tour is a puzzle of [graph theory](/Mathematics/graph-theory.md), and the [Armenian alphabet](/Armenia/alphabet.md) has its own block in Unicode, which [software](/Software/armenian-unicode.md) has to handle.

## How it works

- Every leaf is a Markdown file; line 1 is its title, the emoji at its start its icon.
- The map draws a **thread** wherever a leaf mentions another, like the ones above.
- A folder is a **branch**; its text is the \`README.md\` inside, like [Chess](</Chess/README.md>).
- A leaf can hold **sub-leaves**: [Graph theory](/Mathematics/graph-theory.md) holds the [knight's tour](/Mathematics/graph-theory/knights-tour.md).
- A link to a leaf not written yet, like [Armenian cuisine](/Armenia/cuisine.md), shows as a ghost: a leaf to write.
- Edits are saved as you type. Hold Ctrl (⌘ on a Mac) for a second while writing to see what can be inserted.
- A new leaf can start from a **template**: *Meeting* and *Chess game* are two, under *Start from* in New leaf. Settings › Templates keeps them.
- [Notes for AI agents](/CLAUDE.md) tells an agent such as Claude Code how notes are kept here.
`,
  '.yeraz/templates/meeting.md': `# 📝 Meeting

{{title}}, on {{date}}, in {{tree}}.

## Decisions

- [ ] 

## Next

- [ ] 
`,
  '.yeraz/templates/chess-game.md': `# ♟️ Chess game

{{title}}, played on {{date}}.

| White | Black | Result | Opening |
| --- | --- | --- | --- |
|  |  |  |  |

## Moves

\`\`\`text
1. 
\`\`\`

## What I learned

- 
`,
  'Armenia/README.md': `# 🇦🇲 Armenia

An old country under Mount Ararat, with its own alphabet, its own church and a love of chess: four leaves here, and threads to every other Tree.
`,
  'Armenia/alphabet.md': `# 🔤 Alphabet

Created by Mesrop Mashtots in 405, with 36 letters; two more came later. It is still written today, and has its own block in [Unicode](/Software/armenian-unicode.md).

| Letter | Name | Sound |
| --- | --- | --- |
| Ա ա | ayb | a |
| Բ բ | ben | b |
| Գ գ | gim | g |
| Դ դ | da | d |

The first sentence written in it was from the Book of Proverbs: *To know wisdom and instruction…* The first arithmetic book in it was [Shirakatsi](/Mathematics/mathematicians.md)'s.
`,
  'Armenia/architecture.md': `# ⛪ Architecture

Stone churches on hills, nearly all built on a few shapes of [geometry](/Mathematics/geometry.md): a cross, a square, a circle, a cone for the roof of the dome.

- **Zvartnots** (643–652): a round cathedral, three tiers high, in ruins since the 10th century.
- **Geghard**: partly carved out of the mountain itself.
- **Khor Virap**: the closest view of Ararat.

> [!NOTE]
> Visit Geghard and Garni on the same day: they are 10 km apart.
`,
  'Armenia/chess-nation.md': `# 🏆 Chess nation

In 2011 Armenia became the first country to teach chess in every primary school. It is a small country with a big team: Olympiad gold in 2006, 2008 and 2012, led by [Levon Aronian](/Chess/players/levon-aronian.md), all after [Tigran Petrosian](/Chess/players/tigran-petrosian.md) made the game a national pride.

- [ ] Find the curriculum's first-year lessons
`,
  'Armenia/yerevan.md': `# 🏙️ Yerevan

The capital, founded as the fortress of Erebuni in 782 BC, older than Rome. Built of pink tuff stone.

- **Matenadaran**: a museum of ancient manuscripts, among them [Shirakatsi](/Mathematics/mathematicians.md)'s.
- **Cascade**: a giant staircase with Ararat behind the city.
- **Chess House**, named after [Petrosian](/Chess/players/tigran-petrosian.md).
- To write: [Armenian cuisine](/Armenia/cuisine.md).
`,
  'Chess/README.md': `# ♟️ Chess

Sixty-four squares, thirty-two pieces, and more possible games than atoms in the universe ([combinatorics](/Mathematics/combinatorics.md)).
`,
  'Chess/engines.md': `# 🤖 Engines

Programs have beaten world champions since 1997, when Deep Blue beat Kasparov. They can't search every game ([combinatorics](/Mathematics/combinatorics.md) says why) so they search a few moves deep with [minimax](/Software/minimax.md) and evaluate what they find.

My own is the [chess engine](/Software/chess-engine.md), much weaker.
`,
  'Chess/players.md': `# 👑 Players

Players worth studying, one leaf each:

- [Tigran Petrosian](/Chess/players/tigran-petrosian.md), world champion 1963–1969
- [Levon Aronian](/Chess/players/levon-aronian.md), three Olympiads with Armenia
- [Magnus Carlsen](/Chess/players/magnus-carlsen.md), not written yet: a ghost on the map
`,
  'Chess/players/levon-aronian.md': `# 🎯 Levon Aronian

Born in Yerevan in 1982. Rated 2830 in 2014, among the highest [Elo ratings](/Chess/ratings.md) ever. He led [Armenia](/Armenia/chess-nation.md) to Olympiad gold in 2006, 2008 and 2012.
`,
  'Chess/players/tigran-petrosian.md': `# 🛡️ Tigran Petrosian

World champion from 1963 to 1969, born in Tbilisi to Armenian parents. "Iron Tigran" was famous for *prophylaxis*: stopping the opponent's plan before it starts.

- Beat Botvinnik in 1963, defended the title against Spassky in 1966.
- A hero in [Armenia](/Armenia/chess-nation.md), where chess became a school subject.
- [ ] Add three of his games to the [engine](/Software/chess-engine.md)'s opening book
`,
  'Chess/ratings.md': `# 📈 Ratings

The Elo system, by Arpad Elo, a physics professor: each player has a number, and the gap between two numbers predicts the result. The formula is [probability](/Mathematics/probability.md); the [rating service](/Software/rating-service.md) computes it.

| Rating | Who |
| --- | --- |
| 2800+ | the very best ([Aronian](/Chess/players/levon-aronian.md) at his peak) |
| 2500 | grandmaster |
| 2000 | expert |
| 1200 | club beginner |
`,
  'Mathematics/README.md': `# 📐 Mathematics

The ideas under everything else here: the graphs a knight walks on, the numbers that make chess too big to solve, the probability behind a rating, the geometry of a church.
`,
  'Mathematics/combinatorics.md': `# 🎲 Combinatorics

Counting without listing. Chess shows how fast counting gets out of hand:

| What | About |
| --- | --- |
| Positions after White's and Black's first moves | $20 \\times 20 = 400$ |
| Legal positions | $4.8 \\times 10^{44}$ |
| Games (the Shannon number) | $10^{120}$ |
| Atoms in the observable universe | $10^{80}$ |

So no computer will ever list every game; an [engine](/Chess/engines.md) searches a few moves deep instead, with [minimax](/Software/minimax.md). A search $d$ moves deep with $b$ choices a move looks at $b^d$ positions, which is why pruning matters.
`,
  'Mathematics/geometry.md': `# 📏 Geometry

Shapes, sizes and the space between them.

Medieval [Armenian architecture](/Armenia/architecture.md) is geometry made of stone: a dome is a circle lifted on a square, and Zvartnots was a circle around a cross of four half-circles.

- [ ] Work out how a square base carries a round drum (pendentives and squinches)
- [ ] Draw the plan of Zvartnots with ruler and compass

The area of a circle inside a square of side $a$ is $\\frac{\\pi}{4}a^2$: about 79 % of it.
`,
  'Mathematics/graph-theory.md': `# 🕸️ Graph theory

A graph is points (vertices) joined by lines (edges). It began in 1736, when Euler showed that no walk crosses each of Königsberg's seven bridges exactly once.

- A chessboard is a graph: squares are vertices, a piece's moves are edges. The [knight's tour](/Mathematics/graph-theory/knights-tour.md) asks for a path through all 64.
- A map like this one is a graph too: leaves are vertices, threads are edges.
- The [chess engine](/Software/chess-engine.md) walks the graph of positions, one move per edge.

A vertex of degree $d$ touches $d$ edges, and every edge has two ends, so

$$\\sum_{v} \\deg(v) = 2\\,|E|$$
`,
  'Mathematics/graph-theory/knights-tour.md': `# 🐴 Knight's tour

Move a knight so it lands on every square of the board exactly once. Euler studied it in 1759; in 1823 Warnsdorff gave a rule that almost always works: **go next to the square with the fewest onward moves.**

The rule is a few lines of code (see [minimax](/Software/minimax.md) for a search that looks further ahead):

\`\`\`ts
const jumps = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]

function tour(n = 8): number[][] {
  const board = Array.from({ length: n }, () => Array<number>(n).fill(0))
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && !board[y][x]
  const next = (x: number, y: number) =>
    jumps.map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => free(a, b))
  let [x, y] = [0, 0]
  for (let step = 1; step <= n * n; step++) {
    board[y][x] = step
    const options = next(x, y).sort((a, b) => next(a[0], a[1]).length - next(b[0], b[1]).length)
    if (!options.length) break
    ;[x, y] = options[0]
  }
  return board
}
\`\`\`

On a board of $n \\times n$ squares a tour exists for every $n \\ge 5$.
`,
  'Mathematics/mathematicians.md': `# 🧮 Armenian mathematicians

- **Anania Shirakatsi** (7th century) wrote one of the first arithmetic books in [Armenian](/Armenia/alphabet.md), with tables and puzzles; copies are kept in the Matenadaran in [Yerevan](/Armenia/yerevan.md).
- **Sergey Mergelyan** (1928–2008) proved in 1951, in his early twenties, which functions on a compact set of the plane are limits of polynomials: *Mergelyan's theorem*.

Both belong in two Trees at once, which is what threads are for: see [Armenia](</Armenia/README.md>).
`,
  'Mathematics/probability.md': `# 📊 Probability

How likely something is, from 0 to 1. The [Elo rating](/Chess/ratings.md) turns the gap between two ratings into the chance that one player beats the other:

$$E_A = \\frac{1}{1 + 10^{(R_B - R_A)/400}}$$

A player rated 200 points higher is expected to score about $0.76$. After a game, the rating moves by how much the result surprised: $R'_A = R_A + K\\,(S_A - E_A)$. The [rating service](/Software/rating-service.md) does exactly this.
`,
  'Software/README.md': `# 💻 Software

Small programs that put the other Trees to work: a chess engine, a rating service, text in Armenian.
`,
  'Software/armenian-unicode.md': `# 🔤 Armenian in Unicode

The [Armenian alphabet](/Armenia/alphabet.md) has its own Unicode block, U+0530 to U+058F. Capitals start at U+0531 (Ա) and small letters at U+0561 (ա), so a letter's case is 48 code points away:

\`\`\`ts
const isArmenian = (c: string) => /[Ա-Ֆա-և]/.test(c)

// The ligature և becomes Ե + Ւ, not the ԵՎ Armenians write today: check names by hand
'Երևան'.toUpperCase() // 'ԵՐԵՒԱՆ'
\`\`\`

> [!WARNING]
> Save files as UTF-8. Armenian read in another encoding turns into strings of accented Latin letters.
`,
  'Software/chess-engine.md': `# ♞ Chess engine

A side project: an engine that plays a decent game. It uses [minimax](/Software/minimax.md) to search and [graph theory](/Mathematics/graph-theory.md) to think about positions.

- [x] Board as bitboards: one 64-bit number per piece type, a bit per square
- [x] Write the [move generation](/Software/chess-engine/move-generation.md)
- [ ] Alpha-beta pruning
- [ ] Opening book from [Petrosian](/Chess/players/tigran-petrosian.md)'s games
- [ ] Play it against the [engines](/Chess/engines.md) and give it an [Elo rating](/Chess/ratings.md)

\`\`\`mermaid
flowchart LR
  A[Position] --> B[Generate moves]
  B --> C[Search: minimax]
  C --> D[Evaluate]
  D --> C
  C --> E[Best move]
\`\`\`
`,
  'Software/chess-engine/move-generation.md': `# 🧩 Move generation

With bitboards, the squares a knight attacks are a few shifts. Square 0 is a1, square 63 is h8; the masks stop a jump from wrapping round the board's edge.

\`\`\`ts
const notA = 0xfefefefefefefefen
const notAB = 0xfcfcfcfcfcfcfcfcn
const notH = 0x7f7f7f7f7f7f7f7fn
const notGH = 0x3f3f3f3f3f3f3f3fn

const knightAttacks = (k: bigint) =>
  (((k << 17n) & notA) | ((k << 15n) & notH) | ((k << 10n) & notAB) | ((k << 6n) & notGH) |
    ((k >> 17n) & notH) | ((k >> 15n) & notA) | ((k >> 10n) & notGH) | ((k >> 6n) & notAB)) &
  0xffffffffffffffffn
\`\`\`

> [!TIP]
> The same masks drive the [knight's tour](/Mathematics/graph-theory/knights-tour.md): each attacked square is an edge of the knight's graph.
`,
  'Software/minimax.md': `# 🌳 Minimax

Pick the move that is best if the opponent always answers with their best. It searches the tree of moves that [combinatorics](/Mathematics/combinatorics.md) says is far too big to search whole, so it stops at a depth and estimates.

\`\`\`ts
function minimax(position: Position, depth: number, maximizing: boolean): number {
  if (depth === 0 || position.isOver()) return evaluate(position)
  const scores = position.moves().map((m) => minimax(position.play(m), depth - 1, !maximizing))
  return maximizing ? Math.max(...scores) : Math.min(...scores)
}
\`\`\`

Alpha-beta pruning skips branches that can't change the answer, and at best searches about $b^{d/2}$ positions instead of $b^d$. Used by the [chess engine](/Software/chess-engine.md).
`,
  'Software/rating-service.md': `# 🏅 Rating service

The [Elo](/Chess/ratings.md) update as code. The formula is from [probability](/Mathematics/probability.md).

\`\`\`ts
/** The chance A beats B, from their ratings. */
const expected = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400))

/** A's new rating after scoring \`score\` (1 a win, ½ a draw, 0 a loss) against B. */
const rate = (a: number, b: number, score: number, k = 20) =>
  Math.round(a + k * (score - expected(a, b)))

rate(2700, 2830, 1) // a win against Aronian at his peak: 2700 → 2714
\`\`\`

- [ ] Store each club game and recompute ratings each evening
`,
}
