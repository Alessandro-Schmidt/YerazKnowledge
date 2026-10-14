// One leaf's text → what the index needs: title, icon, line-2 metadata, words, links.
// Pure and stored by blob SHA, so each version of a file is parsed once, ever.
// The rules are the repository format in ARCHITECTURE.md §4.

export interface LeafMeta {
  cover?: string
  icon?: string
  color?: { text?: string; heading?: string }
  [key: string]: unknown
}

export interface LeafLink {
  /** Path from the repository root, e.g. `identity/keycloak.md`. */
  path: string
  /** `owner/name` for a leaf in another Tree; null for this one. */
  repo: string | null
}

export interface ParsedLeaf {
  /** Null when line 1 is not a `# ` heading, or holds only an icon. */
  title: string | null
  icon: string | null
  meta: LeafMeta | null
  words: number
  links: LeafLink[]
}

export const HEADING = /^ {0,3}#(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
export const META = /^<!--\s*yeraz\s+(\{.*\})\s*-->\s*$/
const FENCE = /^ {0,3}(`{3,}|~{3,})/
const CODE_SPAN = /(`+)(?!`)[\s\S]*?[^`]\1(?!`)/g
// [text](destination "optional title"), text may hold one level of brackets; not after "\".
const LINK =
  /(!?)(?<!\\)\[((?:\\.|[^[\]\\]|\[(?:\\.|[^[\]\\])*\])*)\]\(\s*(<[^>\n]*>|[^\s()]*(?:\([^\s()]*\)[^\s()]*)*)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g
const GITHUB_FILE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/[^/]+\/(.+)$/
const WORD = /[\p{L}\p{N}]+(?:['’\-_.][\p{L}\p{N}]+)*/gu
// An icon is an emoji shown as emoji: not © or a digit, which are text unless followed by U+FE0F.
const EMOJI =
  /^(?:\p{Regional_Indicator}{2}|(?=.*(?:\p{Emoji_Presentation}|️))\p{Extended_Pictographic})/u

/** Drops a leading byte-order mark (U+FEFF). */
export const stripBom = (text: string) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

function splitIcon(heading: string): { icon: string | null; title: string | null } {
  const first = graphemes.segment(heading)[Symbol.iterator]().next().value?.segment ?? ''
  const icon = EMOJI.test(first) ? first : null
  const title = (icon ? heading.slice(first.length) : heading).trim()
  return { icon, title: title || null }
}

function parseMeta(line: string | undefined): LeafMeta | null {
  const json = line && META.exec(line)?.[1]
  if (!json) return null
  try {
    const value: unknown = JSON.parse(json)
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as LeafMeta) : null
  } catch {
    return null
  }
}

/** Where a link destination points, if it is a leaf here or in another Tree. */
export function linkTarget(destination: string): LeafLink | null {
  let url = destination.startsWith('<') ? destination.slice(1, -1) : destination
  try {
    url = decodeURI(url)
  } catch {
    // Keep it as written.
  }
  url = url.replace(/[?#].*$/, '')
  if (!url.endsWith('.md')) return null
  if (url.startsWith('/') && !url.startsWith('//')) return { path: url.slice(1), repo: null }
  const other = GITHUB_FILE.exec(url)
  return other ? { path: other[3]!, repo: `${other[1]}/${other[2]}` } : null
}

/** Lines outside fenced code blocks, joined; inline code spans removed. */
function prose(lines: string[]): string {
  const out: string[] = []
  let fence: string | null = null
  for (const line of lines) {
    const marker = FENCE.exec(line)?.[1]
    if (fence) {
      if (
        marker &&
        marker[0] === fence[0] &&
        marker.length >= fence.length &&
        line.trim() === marker
      )
        fence = null
    } else if (marker) {
      fence = marker
    } else {
      out.push(line)
    }
  }
  return out.join('\n').replace(CODE_SPAN, ' ')
}

export function parseLeaf(text: string): ParsedLeaf {
  const lines = stripBom(text).split(/\r\n|\r|\n/)
  const heading = HEADING.exec(lines[0] ?? '')
  const { icon, title } = heading ? splitIcon(heading[1] ?? '') : { icon: null, title: null }
  const meta = parseMeta(lines[1])
  const body = meta ? [lines[0]!, ...lines.slice(2)] : lines

  const links: LeafLink[] = []
  const seen = new Set<string>()
  for (const [, bang, , destination] of prose(body).matchAll(LINK)) {
    const link = bang ? null : linkTarget(destination!)
    const key = link && `${link.repo ?? ''}:${link.path}`
    if (link && !seen.has(key!)) {
      seen.add(key!)
      links.push(link)
    }
  }

  // Words: link text counts, destinations don't.
  const words = body.join('\n').replace(LINK, ' $2 ').match(WORD)?.length ?? 0

  return { title, icon, meta, words, links }
}
