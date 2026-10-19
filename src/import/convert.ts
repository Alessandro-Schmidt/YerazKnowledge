// Bringing notes from other apps into a Family (issues #39, #67): a folder of files in, the
// repository format (ARCHITECTURE.md §4) out. One pipeline serves Obsidian vaults, Notion's
// Markdown exports and any folder of Markdown (Logseq, Foam, Bear, iA Writer…):
// - Notion's ids go from every name (`Page 1f2e….md` → `Page.md`): its page with a folder of
//   the same name is then a leaf with sub-leaves, as Yeraz keeps them;
// - `[[wikilinks]]` and relative links become root-relative links, so they are threads;
//   a wikilink to a note that doesn't exist yet links where it would be written (a ghost);
// - every other file goes to `assets/`, and the images and links to it follow;
// - line 1 becomes the title (from front matter's `title`, or the file's name); front matter
//   is kept, in a comment below it; a folder note (`Folder/Folder.md`) becomes the branch's
//   text, `Folder/README.md`.
// Pure: the CLI (scripts/import-notes.ts) reads and writes the files.

import { codeRanges, HEADING } from '../model/parse'
import { slugify } from '../model/slug'

export interface Imported {
  /** The Family's files by path: texts for notes and `.yeraz.json`, bytes for the rest. */
  files: Map<string, string | Uint8Array>
  report: {
    leaves: number
    assets: number
    /** Links rewritten to root-relative paths. */
    links: number
    /** Wikilinks to notes that don't exist: they show as ghosts, leaves to write. */
    unresolved: string[]
  }
}

const decoder = new TextDecoder()
/** Notion's export appends a 32-hex id to every page and folder name. */
const NOTION_ID = /^(.*?) [0-9a-f]{32}(\.[^./]+)?$/
const WIKILINK = /(!?)\[\[([^\]|#^]*)([#^][^\]|]*)?(?:\|([^\]]*))?\]\]/g
const MD_LINK = /(!?)\[([^\]]*)\]\((<[^>]*>|[^)\s]+)(\s+"[^"]*")?\)/g
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

const isHidden = (path: string) => path.split('/').some((p) => p.startsWith('.'))
const dirOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')))
const baseOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const stem = (name: string) => name.replace(/\.md$/i, '')

/** A link destination for a path: root-relative, in angle brackets when it has spaces. */
export const destination = (path: string) => (/[\s()<>]/.test(path) ? `</${path}>` : `/${path}`)

/** `a/./b/../c` → `a/c`; null when it climbs out of the folder. */
function normalise(path: string): string | null {
  const out: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (!out.length) return null
      out.pop()
    } else out.push(part)
  }
  return out.join('/')
}

function decode(url: string): string {
  try {
    return decodeURIComponent(url)
  } catch {
    return url
  }
}

/** `path` made free in `taken` by a number before its extension. */
function unique(path: string, taken: Set<string>, sep = ' '): string {
  const lower = (p: string) => p.toLowerCase()
  if (!taken.has(lower(path))) return path
  const dot = path.lastIndexOf('.')
  const [head, ext] =
    dot > path.lastIndexOf('/') ? [path.slice(0, dot), path.slice(dot)] : [path, '']
  for (let n = 2; ; n++)
    if (!taken.has(lower(`${head}${sep}${n}${ext}`))) return `${head}${sep}${n}${ext}`
}

export function importNotes(source: ReadonlyMap<string, Uint8Array>, name: string): Imported {
  const paths = [...source.keys()].filter((p) => !isHidden(p) && p !== '.yeraz.json')
  // New paths: Notion's ids out of every name; other files into assets/.
  const renamed = new Map<string, string>()
  const taken = new Set<string>(['.yeraz.json'])
  const notes = paths.filter((p) => /\.md$/i.test(p)).sort()
  const strip = (path: string) =>
    path
      .split('/')
      .map((part) => part.replace(NOTION_ID, '$1$2'))
      .join('/')
  for (const old of notes) {
    let path = strip(old).replace(/\.MD$/, '.md')
    // A folder note (Obsidian's Folder/Folder.md) is the branch's text.
    const folder = dirOf(path)
    if (folder && stem(baseOf(path)) === baseOf(folder) && !notes.includes(`${folder}.md`))
      path = `${folder}/README.md`
    path = unique(path, taken)
    taken.add(path.toLowerCase())
    renamed.set(old, path)
  }
  for (const old of paths.filter((p) => !/\.md$/i.test(p)).sort()) {
    const base = baseOf(strip(old))
    const dot = base.lastIndexOf('.')
    const ext = dot > 0 ? base.slice(dot).toLowerCase() : ''
    const path = unique(`assets/${slugify(dot > 0 ? base.slice(0, dot) : base)}${ext}`, taken, '-')
    taken.add(path.toLowerCase())
    renamed.set(old, path)
  }

  // Wikilinks name a note or file by its name (or the end of its path), as Obsidian finds them.
  const byName = new Map<string, string[]>()
  for (const old of renamed.keys()) {
    for (const key of [
      baseOf(old),
      stem(baseOf(old)),
      baseOf(strip(old)),
      stem(baseOf(strip(old))),
    ])
      byName.set(key.toLowerCase(), [...new Set([...(byName.get(key.toLowerCase()) ?? []), old])])
  }
  const findWiki = (target: string, from: string): string | null => {
    const key = target.trim().replace(/\\/g, '/')
    if (!key) return from
    const candidates = byName.get(baseOf(key).toLowerCase()) ?? []
    const matching = key.includes('/')
      ? candidates.filter((c) => stem(c).toLowerCase().endsWith(stem(key).toLowerCase()))
      : candidates
    if (!matching.length) return null
    // The nearest: in the same folder, else the shortest path.
    const near = matching.find((c) => dirOf(c) === dirOf(from))
    return near ?? [...matching].sort((a, b) => a.length - b.length)[0]!
  }

  const files = new Map<string, string | Uint8Array>()
  const report: Imported['report'] = { leaves: 0, assets: 0, links: 0, unresolved: [] }
  for (const [old, path] of renamed) {
    const bytes = source.get(old)!
    if (!path.endsWith('.md')) {
      files.set(path, bytes)
      report.assets++
      continue
    }
    files.set(path, convertNote(decoder.decode(bytes), old, path))
    report.leaves++
  }
  files.set('.yeraz.json', `${JSON.stringify({ name })}\n`)
  return { files, report }

  function convertNote(raw: string, old: string, path: string): string {
    let text = raw.replace(/^\uFEFF/, '')
    let title: string | null = null
    let front = ''
    const fm = FRONT_MATTER.exec(text)
    if (fm) {
      text = text.slice(fm[0].length)
      title = /^title:\s*["']?(.+?)["']?\s*$/m.exec(fm[1]!)?.[1] ?? null
      front = `<!-- Front matter, as imported:\n${fm[1]!.replace(/-->/g, '--\\>')}\n-->\n\n`
    }
    text = rewriteLinks(text, old)
    const first = text.split(/\r?\n/, 1)[0]!
    if (HEADING.test(first))
      return front ? text.replace(/^.*\r?\n?/, (l) => `${l}\n${front}`) : text
    const name = title ?? stem(baseOf(path === `${dirOf(path)}/README.md` ? dirOf(path) : path))
    return `# ${name}\n\n${front}${text.replace(/^\s*\n/, '')}`
  }

  function rewriteLinks(text: string, old: string): string {
    // Markdown links first, so the links written for wikilinks aren't read again; code is
    // found again for each pass, as the first moves it.
    const outside = (text: string) => {
      const code = codeRanges(text)
      return (at: number) => !code.some(([a, b]) => at >= a && at < b)
    }
    const to = (target: string) => destination(renamed.get(target)!)
    const inText = outside(text)
    text = text.replace(
      MD_LINK,
      (all, bang: string, label: string, dest: string, title = '', at?: number) => {
        if (!inText(at!)) return all
        const url = dest.startsWith('<') ? dest.slice(1, -1) : dest
        if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(url)) return all
        const [pathPart, hash = ''] = decode(url).split(/(?=#)/)
        const target = pathPart!.startsWith('/')
          ? normalise(pathPart!)
          : normalise(`${dirOf(old)}/${pathPart}`)
        if (target === null || !renamed.has(target)) return all
        report.links++
        return `${bang}[${label}](${to(target).replace(/>?$/, (end) => `${hash}${end}`)}${title})`
      },
    )
    const inWikiText = outside(text)
    return text.replace(
      WIKILINK,
      (all, bang: string, target: string, part = '', alias?: string, at?: number) => {
        if (!inWikiText(at!)) return all
        const found = findWiki(target, old)
        const label = (alias ?? (target.trim() || part.slice(1))).replace(/[[\]]/g, '')
        report.links++
        if (found === null) {
          // Not written yet: where it would be, beside the note, so it shows as a ghost.
          report.unresolved.push(target.trim())
          const ghost = [dirOf(renamed.get(old)!), `${baseOf(target.trim())}.md`]
            .filter(Boolean)
            .join('/')
          return `[${label}](${destination(ghost)})`
        }
        const heading = part.startsWith('#') ? `#${slugify(part.slice(1))}` : ''
        const href = to(found).replace(/>?$/, (end) => `${heading}${end}`)
        const isImage = bang && /\.(png|jpe?g|gif|webp|svg)$/i.test(found)
        return isImage ? `![${alias ?? ''}](${href})` : `[${label}](${href})`
      },
    )
  }
}
