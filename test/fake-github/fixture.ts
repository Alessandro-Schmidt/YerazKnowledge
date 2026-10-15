import { slugify } from '../../src/model/slug'

export { slugify }

// Deterministic, realistic Trees for tests and `npm run dev:fake` (development-plan.md §5.3).
// Same options, same files, byte for byte. Every file follows the repository format
// in ARCHITECTURE.md §4: line 1 is the title, sub-leaves live in a sibling folder,
// threads are root-relative links, and `.yeraz.json` marks the root.

export interface FixtureOptions {
  leaves: number
  threads: number
  seed: number
  name?: string
  color?: string
}

export interface Fixture {
  files: Record<string, string>
  stats: { leaves: number; branches: number; threads: number; words: number; maxDepth: number }
}

interface Node {
  kind: 'root' | 'branch' | 'leaf'
  title: string
  slug: string
  parent: Node | null
  depth: number
  top: Node | null
  children: Node[]
  slugs: Set<string>
  bias: number
  icon?: string
  links: Node[]
}

const TOPICS = [
  'Identity',
  'Backend',
  'Frontend',
  'Cloud',
  'Data',
  'AI Agents',
  'Security',
  'Networking',
  'Databases',
  'Mobile',
  'Design Systems',
  'Observability',
  'Compilers',
  'Distributed Systems',
  'Mathematics',
  'Linear Algebra',
  'Statistics',
  'Physics',
  'Philosophy',
  'History',
  'Music Theory',
  'Harmony',
  'Rhythm',
  'Painting',
  'Baroque',
  'Renaissance',
  'Modernism',
  'Languages',
  'Grammar',
  'Vocabulary',
  'Writing',
  'Economics',
  'Biology',
  'Chemistry',
]
const QUALIFIERS = [
  'Consistent',
  'Event',
  'Token',
  'Graph',
  'Vector',
  'Stream',
  'Cache',
  'Async',
  'Static',
  'Dynamic',
  'Linear',
  'Modal',
  'Neural',
  'Partial',
  'Lazy',
  'Eager',
  'Distributed',
  'Local',
  'Global',
  'Reactive',
  'Functional',
  'Bayesian',
  'Classical',
  'Gothic',
  'Early',
  'Late',
  'Applied',
  'Formal',
  'Informal',
  'Spoken',
  'Written',
  'Visual',
  'Tonal',
  'Atonal',
]
const SUBJECTS = [
  'Hashing',
  'Sourcing',
  'Refresh',
  'Search',
  'Embeddings',
  'Processing',
  'Invalidation',
  'Rendering',
  'Routing',
  'Typing',
  'Algebra',
  'Logic',
  'Networks',
  'Evaluation',
  'Loading',
  'Consensus',
  'Replication',
  'Sharding',
  'Inference',
  'Regression',
  'Counterpoint',
  'Cadences',
  'Perspective',
  'Composition',
  'Iconography',
  'Conjugation',
  'Phonetics',
  'Idioms',
  'Syntax',
  'Proofs',
  'Limits',
  'Matrices',
  'Kernels',
  'Realms',
  'Sessions',
  'Scopes',
  'Gradients',
]
const FILLER = (
  'the a of to and in is that for it as with on by this be are from or at an which not but ' +
  'can more one when each how all its also their into these than other only most time way ' +
  'system model state value change order rule layer node path link note idea point case form ' +
  'structure pattern process example method result source signal memory question answer ' +
  'context detail reason proof claim limit scale cost trade boundary interface contract'
).split(' ')
// Includes ZWJ sequences, a flag and variation selectors: parse.ts must keep each whole.
const ICONS = [
  '🔐',
  '📚',
  '🧠',
  '⚙️',
  '🌍',
  '🎨',
  '🧪',
  '👩‍💻',
  '🧑🏽‍🔬',
  '🇧🇷',
  '🇯🇵',
  '🧬',
  '📈',
  '🎼',
  '🪐',
  '🛠️',
]
const COLORS = ['green', 'amber', 'blue', 'violet']

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeFixture(options: FixtureOptions): Fixture {
  const { leaves: leafCount, threads: threadCount, seed } = options
  const rand = mulberry32(seed)
  const int = (n: number) => Math.floor(rand() * n)
  const pick = <T>(list: readonly T[]): T => list[int(list.length)]!
  const weighted = <T>(list: readonly T[], weight: (item: T) => number): T => {
    const weights = list.map(weight)
    let r = rand() * weights.reduce((a, b) => a + b, 0)
    for (let i = 0; i < list.length; i++) if ((r -= weights[i]!) <= 0) return list[i]!
    return list.at(-1)!
  }
  const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())

  const root: Node = {
    kind: 'root',
    title: '',
    slug: '',
    parent: null,
    depth: 0,
    top: null,
    children: [],
    slugs: new Set(['assets']),
    bias: 1,
    links: [],
  }
  const branches: Node[] = []
  const leaves: Node[] = []

  const add = (kind: 'branch' | 'leaf', title: string, parent: Node): Node => {
    let slug = slugify(title)
    for (let n = 2; parent.slugs.has(slug); n++) slug = `${slugify(title)}-${n}`
    parent.slugs.add(slug)
    const node: Node = {
      kind,
      title,
      slug,
      parent,
      depth: parent.depth + 1,
      top: parent.kind === 'root' ? null : (parent.top ?? parent),
      children: [],
      slugs: new Set(),
      bias: Math.exp(normal() * 0.8),
      links: [],
    }
    if (kind === 'branch' && parent.kind === 'root') node.top = node
    parent.children.push(node)
    ;(kind === 'branch' ? branches : leaves).push(node)
    return node
  }

  // Branches: a few top-level ones, then nested ones down to depth 3.
  const topics = [...TOPICS]
  const topicTitle = () =>
    topics.length ? topics.splice(int(topics.length), 1)[0]! : `${pick(QUALIFIERS)} ${pick(TOPICS)}`
  const topCount = Math.min(
    leafCount,
    Math.max(1, Math.min(12, Math.round(Math.sqrt(leafCount) / 2.2))),
  )
  for (let i = 0; i < topCount; i++) add('branch', topicTitle(), root)
  for (let i = 0; i < Math.floor(leafCount / 30); i++) {
    const parent = weighted(
      branches.filter((b) => b.depth < 3),
      (b) => b.children.length + 1,
    )
    add('branch', rand() < 0.5 ? topicTitle() : `${pick(QUALIFIERS)} ${pick(SUBJECTS)}`, parent)
  }

  // Leaves: first one in every branch that would otherwise be an empty folder (git keeps no
  // empty folders), then the rest by preferential attachment, so some areas grow much larger.
  const leafTitle = () => (rand() < 0.75 ? `${pick(QUALIFIERS)} ${pick(SUBJECTS)}` : pick(SUBJECTS))
  for (const b of [...branches])
    if (b.children.length === 0 && leaves.length < leafCount) add('leaf', leafTitle(), b)
  while (leaves.length < leafCount) {
    const r = rand()
    const parents = leaves.filter((l) => l.depth <= 3)
    const parent =
      r < 0.04
        ? root
        : r < 0.2 && parents.length
          ? weighted(parents, (l) => (l.children.length + 1) ** 1.5)
          : weighted(branches, (b) => (b.children.length + 1) ** 1.2 * (b.top ?? b).bias)
    add('leaf', leafTitle(), parent)
  }

  // Threads: 60 % stay inside their top-level branch, the rest cross between branches.
  const groups = new Map<Node | null, Node[]>()
  for (const l of leaves) groups.set(l.top, [...(groups.get(l.top) ?? []), l])
  let threads = 0
  for (let attempts = 0; threads < threadCount && attempts < threadCount * 20; attempts++) {
    const source = pick(leaves)
    const target = rand() < 0.6 ? pick(groups.get(source.top)!) : pick(leaves)
    if (target === source || source.links.includes(target)) continue
    source.links.push(target)
    threads++
  }

  // Files.
  const dirOf = (n: Node): string => (n.kind === 'root' ? '' : `${dirOf(n.parent!)}${n.slug}/`)
  const fileOf = (n: Node) => `${dirOf(n.parent!)}${n.slug}.md`
  const sentence = (words: number) => {
    const w = Array.from({ length: words }, () => pick(FILLER))
    return `${w.join(' ').replace(/^./, (c) => c.toUpperCase())}.`
  }

  const files: Record<string, string> = {
    '.yeraz.json': `${JSON.stringify({ name: options.name ?? `Fixture ${leafCount}`, color: options.color ?? 'green' })}\n`,
  }
  let totalWords = 0
  for (const leaf of leaves) {
    const icon = rand() < 0.18 ? `${pick(ICONS)} ` : ''
    const lines = [`# ${icon}${leaf.title}`]
    if (rand() < 0.06)
      lines.push(`<!-- yeraz ${JSON.stringify({ color: { heading: pick(COLORS) } })} -->`)

    const target = Math.min(9000, Math.max(12, Math.round(Math.exp(5.1 + 0.95 * normal()))))
    const blocks: string[] = []
    const paragraphs: number[] = []
    for (let words = leaf.title.split(' ').length; words < target;) {
      const r = rand()
      if (r < 0.1 && target - words > 40) {
        const heading = Array.from({ length: 2 + int(3) }, () => pick(SUBJECTS)).join(' ')
        blocks.push(`## ${heading}`)
        words += heading.split(' ').length
      } else if (r < 0.2) {
        const items = Array.from({ length: 3 + int(3) }, () => `- ${sentence(3 + int(6))}`)
        blocks.push(items.join('\n'))
        words += items.join(' ').split(' ').length - items.length
      } else {
        let paragraph = ''
        for (let n = Math.min(target - words, 25 + int(45)); n > 0;) {
          const len = Math.min(n, 6 + int(12))
          paragraph += `${paragraph ? ' ' : ''}${sentence(len)}`
          n -= len
          words += len
        }
        paragraphs.push(blocks.length)
        blocks.push(paragraph)
      }
    }
    if (!paragraphs.length) {
      paragraphs.push(blocks.length)
      blocks.push(sentence(6))
    }
    for (const link of leaf.links) {
      const at = paragraphs[int(paragraphs.length)]!
      blocks[at] += ` See [${link.title}](/${fileOf(link)}).`
    }
    if (rand() < 0.08) {
      // A link inside code is text, not a thread.
      blocks.push("```ts\nconst example = '[not a thread](/nowhere.md)'\n```")
    }
    totalWords += target
    files[fileOf(leaf)] = `${lines.join('\n')}\n\n${blocks.join('\n\n')}\n`
  }

  return {
    files,
    stats: {
      leaves: leaves.length,
      branches: branches.length,
      threads,
      words: totalWords,
      maxDepth: Math.max(...leaves.map((l) => l.depth)),
    },
  }
}
