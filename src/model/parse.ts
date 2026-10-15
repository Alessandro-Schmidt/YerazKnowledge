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
export const LINK =
  /(!?)(?<!\\)\[((?:\\.|[^[\]\\]|\[(?:\\.|[^[\]\\])*\])*)\]\(\s*(<[^>\n]*>|[^\s()]*(?:\([^\s()]*\)[^\s()]*)*)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g
const GITHUB_FILE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/[^/]+\/(.+)$/
const WORD = /[\p{L}\p{N}]+(?:['’\-_.][\p{L}\p{N}]+)*/gu
// An icon is an emoji shown as emoji: not © or a digit, which are text unless followed by U+FE0F.
const EMOJI =
  /^(?:\p{Regional_Indicator}{2}|(?=.*(?:\p{Emoji_Presentation}|️))\p{Extended_Pictographic})/u

/** Drops a leading byte-order mark (U+FEFF). */
export const stripBom = (text: string) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** The emoji icon at the start of a title, or '' when there is none. */
export function leadingIcon(text: string): string {
  const first = graphemes.segment(text)[Symbol.iterator]().next().value?.segment ?? ''
  return EMOJI.test(first) ? first : ''
}

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

/**
 * [start, end) offsets of code in `text`: fenced blocks (an unclosed fence runs to the
 * end) and inline code spans. Links and @mentions inside code are text, not threads.
 */
export function codeRanges(text: string): [number, number][] {
  const ranges: [number, number][] = []
  let fence: { marker: string; start: number } | null = null
  let offset = 0
  for (const line of text.split(/(?<=\n)/)) {
    const content = line.replace(/\r?\n$/, '')
    const marker = FENCE.exec(content)?.[1]
    if (fence) {
      if (
        marker &&
        marker[0] === fence.marker[0] &&
        marker.length >= fence.marker.length &&
        content.trim() === marker
      ) {
        ranges.push([fence.start, offset + line.length])
        fence = null
      }
    } else if (marker) {
      fence = { marker, start: offset }
    }
    offset += line.length
  }
  if (fence) ranges.push([fence.start, text.length])

  const outside = blank(text, ranges)
  for (const m of outside.matchAll(CODE_SPAN)) ranges.push([m.index, m.index + m[0].length])
  return ranges.sort((a, b) => a[0] - b[0])
}

/** `text` with the given ranges replaced by spaces, so offsets stay the same. */
function blank(text: string, ranges: [number, number][]): string {
  let out = text
  for (const [start, end] of ranges)
    out = out.slice(0, start) + ' '.repeat(end - start) + out.slice(end)
  return out
}

/** The text with code blanked out, offsets unchanged. */
export const prose = (text: string) => blank(text, codeRanges(text))

export function parseLeaf(text: string): ParsedLeaf {
  const lines = stripBom(text).split(/\r\n|\r|\n/)
  const heading = HEADING.exec(lines[0] ?? '')
  const { icon, title } = heading ? splitIcon(heading[1] ?? '') : { icon: null, title: null }
  const meta = parseMeta(lines[1])
  const body = meta ? [lines[0]!, ...lines.slice(2)] : lines

  const links: LeafLink[] = []
  const seen = new Set<string>()
  for (const [, bang, , destination] of prose(body.join('\n')).matchAll(LINK)) {
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

/**
 * Line 1 with a new icon (or none), keeping the title: `# 🔐 Keycloak`. A text without a
 * title line gets one. Only line 1 changes; the file name never does (ARCHITECTURE.md §4).
 */
export function withIcon(text: string, icon: string | null): string {
  const end = text.search(/\r\n|\r|\n|$/)
  const first = text.slice(0, end)
  const heading = HEADING.exec(stripBom(first))
  const title = heading ? (splitIcon(heading[1] ?? '').title ?? '') : ''
  const line = `# ${icon ? `${icon} ` : ''}${title || 'Untitled'}`.trimEnd()
  return heading ? line + text.slice(end) : `${line}\n\n${text}`
}
