#!/usr/bin/env node
// yeraz-import: notes from Obsidian, Notion, Logseq, Bear, OneNote (HTML / MHT exports) or any
// folder of Markdown or HTML, converted into a Yeraz Family (ARCHITECTURE.md §4 of
// github.com/Alessandro-Schmidt/YerazNotes). One file, Node 20+, no dependencies, and no
// need for the Yeraz repository: copy this folder anywhere.
//
//   node convert.mjs inventory <source>                      the pages, their titles and a
//                                                            suggested emoji each, as JSON
//   node convert.mjs convert <source> <new folder> [--name "My notes"] [--emojis emojis.json]
//                                                  [--default-emoji 📝] [--no-emoji] [--color amber]
//
// What comes out: every note a `.md` leaf whose line 1 is `# <emoji> <title>` (the emoji is
// the leaf's icon on the map); a page with a folder of the same name is a leaf with sub-leaves;
// a folder's own note (`Folder/Folder.md`, Logseq's namespace page) is the branch's text,
// `Folder/README.md`; `[[wikilinks]]`, `((block refs))` and relative links become root-relative
// links, so they are threads (a link to a note never written shows as a ghost); every other
// file goes to `assets/`; front matter and Logseq properties are kept in a comment under the
// title; `.yeraz.json` marks the root. The source is never changed.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { parseArgs } from 'node:util'

// ---------------------------------------------------------------------------- Markdown bits
// Copied from Yeraz's src/model (parse.ts, links.ts, slug.ts), so this file stands alone.

const HEADING = /^ {0,3}#(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const FENCE = /^ {0,3}(`{3,}|~{3,})/
const CODE_SPAN = /(`+)(?!`)[\s\S]*?[^`]\1(?!`)/g
// An icon is an emoji shown as emoji: not © or a digit, which are text unless followed by U+FE0F.
const EMOJI =
  /^(?:\p{Regional_Indicator}{2}|(?=.*(?:\p{Emoji_Presentation}|️))\p{Extended_Pictographic})/u
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** The emoji icon at the start of a title, or '' when there is none. */
export function leadingIcon(text) {
  const first = graphemes.segment(text)[Symbol.iterator]().next().value?.segment ?? ''
  return EMOJI.test(first) ? first : ''
}

/** A file-safe name from a title: `Keycloak (IdP)` → `keycloak-idp`. */
export function slugify(title) {
  return (
    title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'untitled'
  )
}

/** A root-relative destination for `path`, in angle brackets when it needs them. */
const destination = (path) => (/[\s()<>]/.test(path) ? `</${path}>` : `/${path}`)

/** The ranges of fenced code and code spans: links inside them are not links. */
function codeRanges(text) {
  const ranges = []
  let fence = null
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
    } else if (marker) fence = { marker, start: offset }
    offset += line.length
  }
  if (fence) ranges.push([fence.start, text.length])
  const out = []
  let last = 0
  for (const [start, end] of ranges) {
    out.push(text.slice(last, start), ' '.repeat(end - start))
    last = end
  }
  out.push(text.slice(last))
  for (const m of out.join('').matchAll(CODE_SPAN)) ranges.push([m.index, m.index + m[0].length])
  return ranges.sort((a, b) => a[0] - b[0])
}

// ------------------------------------------------------------------------------- Emoji
// A page's emoji says what it is about. Claude picks them from the inventory; these are the
// script's own guesses, by the words of the title, the folders and the first lines. Each
// emoji is one that shows as an emoji (U+FE0F where the character is text by default).

const EMOJI_HINTS = [
  [/\b(meeting|standup|1:1|retro|agenda)\b/, '🗓️'],
  [/\b(recipe|cook|kitchen|bake|bread|dinner|lunch)\b/, '🍳'],
  [/\b(book|books|reading|novel|author|chapter)\b/, '📚'],
  [/\b(journal|diary|daily|today|log)\b/, '📓'],
  [/\b(todo|to-do|tasks?|checklist|backlog)\b/, '✅'],
  [/\b(idea|ideas|brainstorm)\b/, '💡'],
  [/\b(travel|trip|flight|itinerary|vacation|holiday)\b/, '✈️'],
  [/\b(money|budget|finance|invoice|tax|salary|savings|bank)\b/, '💰'],
  [/\b(health|doctor|medical|gym|workout|fitness)\b/, '🩺'],
  [/\b(jiu[- ]?jitsu|bjj|judo|karate|martial)\b/, '🥋'],
  [/\b(chess|opening|endgame|gambit)\b/, '♟️'],
  [/\b(music|song|album|guitar|drums|piano|concert|symphony)\b/, '🎵'],
  [/\b(art|painting|painter|museum|sculpture|baroque|renaissance)\b/, '🎨'],
  [/\b(architecture|cathedral|church|basilica|palace)\b/, '🏛️'],
  [/\b(faith|prayer|mass|bible|gospel|saint|liturgy)\b/, '✝️'],
  [
    /\b(language|grammar|vocabulary|verbs?|armenian|russian|french|german|spanish|portuguese)\b/,
    '🗣️',
  ],
  [/\b(history|war|empire|century|medieval|ancient)\b/, '🏺'],
  [/\b(math|maths|algebra|calculus|theorem|proof|statistics)\b/, '🧮'],
  [/\b(physics|quantum|relativity)\b/, '⚛️'],
  [/\b(chemistry|molecule|reaction)\b/, '⚗️'],
  [/\b(biology|genetics|dna|cell|evolution)\b/, '🧬'],
  [/\b(security|auth|oauth|oidc|keycloak|password|token|encryption|identity)\b/, '🔐'],
  [/\b(cloud|aws|gcp|azure|kubernetes|k8s|serverless)\b/, '☁️'],
  [/\b(database|sql|postgres|postgresql|mysql|oracle|schema|query)\b/, '🗄️'],
  [/\b(network|http|dns|tcp|api|rest|graphql|endpoint)\b/, '🌐'],
  [/\b(docker|container)\b/, '🐳'],
  [/\b(linux|bash|shell|terminal|unix)\b/, '🐧'],
  [/\b(python|pandas|numpy)\b/, '🐍'],
  [/\b(java|spring|jvm|kotlin)\b/, '☕'],
  [/\b(react|angular|vue|frontend|css|html|typescript|javascript)\b/, '🧩'],
  [/\b(git|github|branch|merge|commit)\b/, '🔀'],
  [/\b(test|tests|testing|junit|playwright|qa)\b/, '🧪'],
  [/\b(bug|bugs|error|debug|incident|fix)\b/, '🐛'],
  [/\b(design|ui|ux|figma|typography|layout)\b/, '🖌️'],
  [/\b(code|coding|programming|software|algorithm|compiler|library|framework)\b/, '💻'],
  [/\b(ai|llm|agent|agents|claude|gpt|machine learning|model|prompt)\b/, '🤖'],
  [/\b(project|projects|roadmap|milestone|sprint|plan|planning)\b/, '🗂️'],
  [/\b(goal|goals|okr|habit|habits)\b/, '🎯'],
  [/\b(question|questions|faq|why|how)\b/, '❓'],
  [/\b(quote|quotes|sayings)\b/, '💬'],
  [/\b(link|links|bookmarks|resources|reading list)\b/, '🔗'],
  [/\b(person|people|contact|contacts|team|friend|friends)\b/, '👤'],
  [/\b(company|business|startup|client|customer|market|pricing)\b/, '🏢'],
  [/\b(school|university|course|lecture|lesson|study|exam|degree)\b/, '🎓'],
  [/\b(law|legal|contract|visa|rights)\b/, '⚖️'],
  [/\b(home|house|apartment|flat|rent|furniture)\b/, '🏠'],
  [/\b(car|cars|porsche|drive|driving)\b/, '🚗'],
  [/\b(wedding|marriage|engagement|ring|bride|groom)\b/, '💍'],
  [/\b(family|parents|kids|children|baby)\b/, '👨‍👩‍👧'],
  [/\b(film|movie|movies|cinema|series|episode)\b/, '🎬'],
  [/\b(photo|photos|photography|camera)\b/, '📷'],
  [/\b(game|games|gaming|chess960|board game)\b/, '🎮'],
  [/\b(sport|football|soccer|tennis|running|cycling|swim)\b/, '⚽'],
  [/\b(food|restaurant|wine|coffee|beer)\b/, '🍽️'],
  [/\b(garden|plant|plants|tree|trees|flowers?)\b/, '🌱'],
  [/\b(map|maps|geography|city|cities|country|countries)\b/, '🗺️'],
  [/\b(weather|climate|rain|snow)\b/, '🌦️'],
  [/\b(note|notes|memo|scratch|inbox)\b/, '📝'],
]

/** The script's own guess for a page's emoji; null when nothing in it rings a bell. */
export function suggestEmoji(title, folders = [], text = '') {
  // Words and their stems (`cooking` → `cook`), so a hint matches either.
  const haystacks = [title, folders.join(' '), text.slice(0, 600)].map((s) => {
    const words = s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    return `${words} ${words.replace(/\b(\w{4,}?)(ing|ed|es|s)\b/g, '$1')}`
  })
  for (const hay of haystacks) for (const [re, emoji] of EMOJI_HINTS) if (re.test(hay)) return emoji
  return null
}

// --------------------------------------------------------------------------- Conversion

const decoder = new TextDecoder()
/** Notion's export appends a 32-hex id to every page and folder name. */
const NOTION_ID = /^(.*?) [0-9a-f]{32}(\.[^./]+)?$/
const WIKILINK = /(!?)\[\[([^\]|#^]*)([#^][^\]|]*)?(?:\|([^\]]*))?\]\]/g
const MD_LINK = /(!?)\[([^\]]*)\]\((<[^>]*>|[^)\s]+)(\s+"[^"]*")?\)/g
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
const NOTE = /\.(md|markdown|txt)$/i
const HTML = /\.(html?|mht|mhtml)$/i
const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|heic)$/i
/** Logseq keeps its own folders beside pages/ and journals/. */
const SKIPPED_FOLDERS = new Set(['logseq', 'bak', 'version-files', 'whiteboards', 'draws'])

const isHidden = (path) => path.split('/').some((p) => p.startsWith('.'))
const dirOf = (path) => path.slice(0, Math.max(0, path.lastIndexOf('/')))
const baseOf = (path) => path.slice(path.lastIndexOf('/') + 1)
const stem = (name) => name.replace(/\.[^.]+$/, '')

/** `a/./b/../c` → `a/c`; null when it climbs out of the folder. */
function normalise(path) {
  const out = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (!out.length) return null
      out.pop()
    } else out.push(part)
  }
  return out.join('/')
}

function decode(url) {
  try {
    return decodeURIComponent(url)
  } catch {
    return url
  }
}

/** `path` made free in `taken` by a number before its extension. */
function unique(path, taken, sep = ' ') {
  if (!taken.has(path.toLowerCase())) return path
  const dot = path.lastIndexOf('.')
  const [head, ext] =
    dot > path.lastIndexOf('/') ? [path.slice(0, dot), path.slice(dot)] : [path, '']
  for (let n = 2; ; n++)
    if (!taken.has(`${head}${sep}${n}${ext}`.toLowerCase())) return `${head}${sep}${n}${ext}`
}

/** A source path as Yeraz would keep it: Notion's ids out, Logseq's folders and names resolved. */
function newName(old) {
  const parts = old
    .split('/')
    .map((part) => part.replace(NOTION_ID, '$1$2'))
    .filter((part) => part !== 'pages')
  // Logseq's journals: `journals/2024_01_15.md` → `Journals/2024-01-15.md`.
  if (parts[0] === 'journals') {
    parts[0] = 'Journals'
    parts[parts.length - 1] = parts[parts.length - 1].replace(
      /^(\d{4})_(\d{2})_(\d{2})/,
      '$1-$2-$3',
    )
  }
  // Logseq's namespaces, one file per page: `a___b.md` or `a%2Fb.md` → `a/b.md`.
  const last = parts.pop().replace(/___|%2F/g, '/')
  return [...parts, ...last.split('/')].join('/').replace(/\.(MD|markdown|txt)$/, '.md')
}

/**
 * Converts a folder of notes (paths → bytes) into a Family's files (paths → text or bytes).
 * `options.emojis` maps a page's path (new or old) to its emoji; pages without one get the
 * script's guess, then `options.defaultEmoji`; `options.emoji: false` leaves titles bare.
 */
export function importNotes(source, options = {}) {
  const {
    name = 'Notes',
    emojis = {},
    defaultEmoji = '📝',
    emoji: wantEmoji = true,
    color,
  } = options
  const paths = [...source.keys()].filter(
    (p) =>
      !isHidden(p) &&
      p !== '.yeraz.json' &&
      !SKIPPED_FOLDERS.has(p.split('/')[0]) &&
      !/\.(docx|one|onepkg|onetoc2)$/i.test(p),
  )
  const isNote = (p) => NOTE.test(p) || HTML.test(p)
  const renamed = new Map()
  const taken = new Set(['.yeraz.json'])
  const notes = paths.filter(isNote).sort()
  const noteNames = new Set(notes.map((p) => newName(p).toLowerCase()))
  for (const old of notes) {
    let path = newName(old)
    if (HTML.test(path)) path = path.replace(HTML, '.md')
    // A folder note (Obsidian's Folder/Folder.md, Logseq's namespace page) is the branch's text.
    const folder = dirOf(path)
    const sibling = source.has(`${folder}.md`) || noteNames.has(`${folder}.md`.toLowerCase())
    if (folder && stem(baseOf(path)) === baseOf(folder) && !sibling) path = `${folder}/README.md`
    path = unique(path, taken)
    taken.add(path.toLowerCase())
    renamed.set(old, path)
  }
  for (const old of paths.filter((p) => !isNote(p)).sort()) {
    const base = baseOf(newName(old))
    const dot = base.lastIndexOf('.')
    const ext = dot > 0 ? base.slice(dot).toLowerCase() : ''
    const path = unique(`assets/${slugify(dot > 0 ? base.slice(0, dot) : base)}${ext}`, taken, '-')
    taken.add(path.toLowerCase())
    renamed.set(old, path)
  }

  // Wikilinks name a note or file by its name (or the end of its path), as Obsidian and
  // Logseq find them.
  const byName = new Map()
  const remember = (key, old) => {
    const k = key.toLowerCase()
    byName.set(k, [...new Set([...(byName.get(k) ?? []), old])])
  }
  for (const [old, path] of renamed) {
    for (const key of [baseOf(old), stem(baseOf(old)), baseOf(path), stem(baseOf(path))])
      remember(key, old)
    // A Logseq namespace page is linked as `a/b`; a branch's text as its folder.
    if (path.endsWith('/README.md')) remember(dirOf(path), old)
    remember(stem(path), old)
  }
  const findWiki = (target, from) => {
    const key = target.trim().replace(/\\/g, '/')
    if (!key) return from
    const candidates = byName.get(key.toLowerCase()) ?? byName.get(baseOf(key).toLowerCase()) ?? []
    const matching = key.includes('/')
      ? candidates.filter((c) =>
          stem(renamed.get(c)).toLowerCase().endsWith(stem(key).toLowerCase()),
        )
      : candidates
    if (!matching.length) return null
    const near = matching.find((c) => dirOf(c) === dirOf(from))
    return near ?? [...matching].sort((a, b) => a.length - b.length)[0]
  }

  const files = new Map()
  const pages = []
  const report = { leaves: 0, assets: 0, links: 0, unresolved: [], skipped: [] }
  for (const p of [...source.keys()].filter((p) => /\.(docx|one|onepkg|onetoc2)$/i.test(p)))
    report.skipped.push(p)
  const extra = new Map()
  for (const [old, path] of renamed) {
    const bytes = source.get(old)
    if (!path.endsWith('.md')) {
      files.set(path, bytes)
      report.assets++
      continue
    }
    const raw = typeof bytes === 'string' ? bytes : decoder.decode(bytes)
    const page = convertNote(raw, old, path)
    files.set(path, page.text)
    pages.push(page.entry)
    report.leaves++
  }
  for (const [path, bytes] of extra) {
    files.set(path, bytes)
    report.assets++
  }
  files.set('.yeraz.json', `${JSON.stringify(color ? { name, color } : { name })}\n`)
  return { files, report, pages }

  /** An image from an HTML page's own data (a data: URI or an MHT part), as a file in assets/. */
  function keepImage(hint, ext, bytes) {
    const path = unique(`assets/${slugify(hint)}${ext}`, taken, '-')
    taken.add(path.toLowerCase())
    extra.set(path, bytes)
    return path
  }

  function convertNote(raw, old, path) {
    let text = raw.replace(/^﻿/, '')
    let title = null
    let front = ''
    if (HTML.test(old)) {
      const page = htmlToMarkdown(text, stem(baseOf(newName(old))), keepImage)
      text = page.text
      title = page.title
    }
    const fm = FRONT_MATTER.exec(text)
    if (fm) {
      text = text.slice(fm[0].length)
      title = /^title:\s*["']?(.+?)["']?\s*$/m.exec(fm[1])?.[1] ?? title
      front = `<!-- Front matter, as imported:\n${fm[1].replace(/-->/g, '--\\>')}\n-->\n\n`
    }
    const logseq = logseqToMarkdown(text)
    if (logseq) {
      text = logseq.text
      title = logseq.title ?? title
      if (logseq.properties) front += `<!-- Properties, as imported:\n${logseq.properties}\n-->\n\n`
    }
    text = rewriteLinks(text, old)
    const lines = text.split(/\r?\n/)
    const heading = HEADING.exec(lines[0])
    let body
    if (heading) {
      title = heading[1] ?? ''
      body = lines
        .slice(1)
        .join('\n')
        .replace(/^\s*\n/, '')
    } else {
      const isBranch = path === `${dirOf(path)}/README.md`
      title ??= stem(baseOf(isBranch ? dirOf(path) : path))
      body = text.replace(/^\s*\n/, '')
    }
    const icon = leadingIcon(title)
    const bare = icon ? title.slice(icon.length).trim() : title.trim()
    let chosen = icon
    let suggested = false
    if (!icon && wantEmoji) {
      const picked = emojis[path] ?? emojis[old]
      if (picked) chosen = picked
      else {
        chosen = suggestEmoji(bare, path.split('/').slice(0, -1), body) ?? defaultEmoji
        suggested = true
      }
    }
    const line1 = `# ${chosen ? `${chosen} ` : ''}${bare}`.trimEnd()
    const entry = {
      path,
      source: old,
      title: bare,
      emoji: chosen || null,
      suggested,
      excerpt: body
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160),
    }
    const rest = `${front}${body}`.replace(/\s+$/, '')
    return { text: rest ? `${line1}\n\n${rest}\n` : `${line1}\n`, entry }
  }

  function rewriteLinks(text, old) {
    const outside = (text) => {
      const code = codeRanges(text)
      return (at) => !code.some(([a, b]) => at >= a && at < b)
    }
    const to = (target) => destination(renamed.get(target))
    const inText = outside(text)
    text = text.replace(MD_LINK, (all, bang, label, dest, title = '', at) => {
      if (!inText(at)) return all
      const url = dest.startsWith('<') ? dest.slice(1, -1) : dest
      if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(url)) return all
      const [pathPart, hash = ''] = decode(url).split(/(?=#)/)
      const target = pathPart.startsWith('/')
        ? normalise(pathPart)
        : normalise(`${dirOf(old)}/${pathPart}`)
      if (target === null || !renamed.has(target)) return all
      report.links++
      return `${bang}[${label}](${to(target).replace(/>?$/, (end) => `${hash}${end}`)}${title})`
    })
    const inWikiText = outside(text)
    return text.replace(WIKILINK, (all, bang, target, part = '', alias, at) => {
      if (!inWikiText(at)) return all
      const found = findWiki(target, old)
      const label = (alias ?? (target.trim() || part.slice(1))).replace(/[[\]]/g, '')
      report.links++
      if (found === null) {
        // Not written yet: where it would be, beside the note, so it shows as a ghost.
        report.unresolved.push(target.trim())
        const ghost = [dirOf(renamed.get(old)), `${baseOf(target.trim())}.md`]
          .filter(Boolean)
          .join('/')
        return `[${label}](${destination(ghost)})`
      }
      const heading = part.startsWith('#') ? `#${slugify(part.slice(1))}` : ''
      const href = to(found).replace(/>?$/, (end) => `${heading}${end}`)
      const isImage = bang && IMAGE.test(renamed.get(found))
      return isImage ? `![${alias ?? ''}](${href})` : `[${label}](${href})`
    })
  }
}

// --------------------------------------------------------------------------- Logseq
// Logseq writes an outline: every block a `- ` bullet, children indented by a tab. Read as
// prose: top-level blocks become paragraphs, their children a list; `key:: value` properties
// at the top are kept in a comment; TODO markers become task boxes; block references and
// embeds become plain links or go.

const PROPERTY = /^([\w.-]+)::\s*(.*)$/
const OUTLINE = /^(\s*)-\s?(.*)$/

/** A Logseq page as Markdown, or null when the text isn't one. */
export function logseqToMarkdown(text) {
  const lines = text.split(/\r?\n/)
  const props = []
  let i = 0
  while (i < lines.length && PROPERTY.test(lines[i])) props.push(lines[i++])
  const body = lines.slice(i)
  const content = body.filter((l) => l.trim())
  const outlined = content.length > 0 && content.every((l) => OUTLINE.test(l))
  if (!outlined && !props.length) return null
  const title = props.map((p) => PROPERTY.exec(p)).find((m) => m[1] === 'title')?.[2] ?? null
  let out
  if (outlined) {
    const indentOf = (s) => s.replace(/\t/g, '  ').length
    out = []
    for (const line of body) {
      const m = OUTLINE.exec(line)
      if (!m) {
        if (line.trim()) out.push(line.trim())
        continue
      }
      const depth = indentOf(m[1])
      const item = m[2]
        .replace(/^(TODO|LATER|NOW|DOING)\s+/, '[ ] ')
        .replace(/^(DONE)\s+/, '[x] ')
        .replace(/^(CANCELED|CANCELLED)\s+/, '[x] ~~')
        .replace(/\{\{embed\s+(\[\[[^\]]*\]\])\}\}/g, '$1')
        .replace(/\(\([0-9a-f-]{36}\)\)/g, '')
        .replace(/#\[\[([^\]]+)\]\]/g, '#$1')
        .trimEnd()
      if (PROPERTY.test(item)) continue
      if (depth === 0) {
        if (out.length && out[out.length - 1] !== '') out.push('')
        out.push(item)
      } else out.push(`${' '.repeat(Math.max(0, depth - 2))}- ${item}`)
    }
  } else out = body
  return {
    text: out.join('\n').replace(/^\n+/, ''),
    title,
    properties: props.filter((p) => !/^title::/.test(p)).join('\n') || null,
  }
}

// ----------------------------------------------------------------------------- HTML
// OneNote exports a page as HTML or as an MHT archive (a single file with its images as
// base64 parts). Enough of HTML for notes: headings, paragraphs, lists, emphasis, links,
// images, tables, code.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const unescapeHtml = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) =>
    e[0] === '#'
      ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1))
      : (ENTITIES[e.toLowerCase()] ?? all),
  )

/** The HTML part of an MHT archive, and its other parts by Content-Location / Content-ID. */
function unpackMht(text) {
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(text)?.[1]
  if (!boundary || !/^MIME-Version:/im.test(text)) return { html: text, parts: new Map() }
  const parts = new Map()
  let html = ''
  for (const chunk of text.split(`--${boundary}`).slice(1)) {
    const split = chunk.search(/\r?\n\r?\n/)
    if (split < 0) continue
    const head = chunk.slice(0, split)
    const body = chunk.slice(split).replace(/^\r?\n\r?\n/, '')
    const type = /Content-Type:\s*([^;\r\n]+)/i.exec(head)?.[1]?.trim() ?? ''
    const encoding = /Content-Transfer-Encoding:\s*(\S+)/i.exec(head)?.[1]?.toLowerCase()
    const location = /Content-Location:\s*(\S+)/i.exec(head)?.[1]
    const id = /Content-ID:\s*<([^>]+)>/i.exec(head)?.[1]
    if (type.startsWith('text/html') && !html) {
      html =
        encoding === 'quoted-printable'
          ? Buffer.from(
              body
                .replace(/=\r?\n/g, '')
                .replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
              'latin1',
            ).toString('utf8')
          : encoding === 'base64'
            ? Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8')
            : body
    } else if (encoding === 'base64') {
      const bytes = new Uint8Array(Buffer.from(body.replace(/\s+/g, ''), 'base64'))
      for (const key of [location, id && `cid:${id}`]) if (key) parts.set(key, { type, bytes })
    }
  }
  return { html: html || text, parts }
}

/** An HTML (or MHT) page as Markdown: its title, and its text with images kept as files. */
export function htmlToMarkdown(source, fallbackTitle, keepImage) {
  const { html, parts } = unpackMht(source)
  const title = unescapeHtml(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  let s = (/<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html)
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
  let images = 0
  const image = (src, alt) => {
    const hint = `${fallbackTitle}-${++images}`
    const data = /^data:([^;,]+);base64,(.*)$/s.exec(src)
    if (data) {
      const ext = `.${data[1]
        .split('/')[1]
        .replace('jpeg', 'jpg')
        .replace(/\+xml$/, '')}`
      return `![${alt}](${destination(keepImage(hint, ext, new Uint8Array(Buffer.from(data[2], 'base64'))))})`
    }
    const part = parts.get(src) ?? parts.get(decode(src))
    if (part) {
      const ext = `.${(part.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg').replace(/\+xml$/, '')}`
      return `![${alt}](${destination(keepImage(hint, ext, part.bytes))})`
    }
    return `![${alt}](${src})`
  }
  const attr = (tag, name) => {
    const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
    return m ? unescapeHtml(m[2] ?? m[3] ?? m[4] ?? '') : ''
  }
  // Inline first (they nest inside blocks), then blocks, then what is left.
  s = s
    .replace(
      /<img\b[^>]*>/gi,
      (tag) => `\u0000IMG${image(attr(tag, 'src'), attr(tag, 'alt'))}\u0000`,
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t) =>
      t.trim() ? `**${t.trim()}**` : '',
    )
    .replace(/<(i|em)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t) => (t.trim() ? `*${t.trim()}*` : ''))
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, t) => `\`${t}\``)
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (tag, t) => {
      const href = attr(tag.slice(0, tag.indexOf('>') + 1), 'href')
      const label = t.replace(/<[^>]+>/g, '').trim()
      return href && !href.startsWith('#') ? `[${label || href}](${href})` : label
    })
  const blocks = []
  s = s
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, t) => {
      blocks.push(`\`\`\`\n${unescapeHtml(t.replace(/<[^>]+>/g, '')).replace(/\s+$/, '')}\n\`\`\``)
      return `\u0000B${blocks.length - 1}\u0000`
    })
    .replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_, t) => {
      const rows = [...t.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) =>
        [...r[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) =>
          unescapeHtml(c[1].replace(/<[^>]+>/g, ''))
            .replace(/\s+/g, ' ')
            .trim(),
        ),
      )
      if (!rows.length) return ''
      const width = Math.max(...rows.map((r) => r.length))
      const line = (cells) =>
        `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`
      blocks.push(
        [line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n'),
      )
      return `\u0000B${blocks.length - 1}\u0000`
    })
    .replace(
      /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_, n, t) => `\n\n${'#'.repeat(+n)} ${t.trim()}\n\n`,
    )
    .replace(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi, (all, kind, t) => {
      let n = 0
      return `\n\n${t.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, item) => `${kind.toLowerCase() === 'ol' ? `${++n}.` : '-'} ${item.replace(/\s+/g, ' ').trim()}\n`)}\n`
    })
    .replace(/<\/(p|div|section|article|blockquote|tr)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
  s = unescapeHtml(s)
    .replace(/\u0000IMG(.*?)\u0000/g, '$1')
    .replace(/\u0000B(\d+)\u0000/g, (_, i) => `\n\n${blocks[+i]}\n\n`)
    .split(/\n/)
    .map((l) => l.replace(/[ \t ]+$/g, '').replace(/^[ \t]+(?=\S)/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { title: title || fallbackTitle, text: s }
}

// ------------------------------------------------------------------------------ CLI

function readFolder(source) {
  const files = new Map()
  for (const entry of readdirSync(source, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const path = join(entry.parentPath, entry.name)
    files.set(relative(source, path).split(sep).join('/'), readFileSync(path))
  }
  return files
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      name: { type: 'string' },
      emojis: { type: 'string' },
      'default-emoji': { type: 'string' },
      'no-emoji': { type: 'boolean' },
      color: { type: 'string' },
    },
  })
  const [command, source, out] = positionals
  const usage = () => {
    console.error(
      'Usage:\n  node convert.mjs inventory <source folder>\n  node convert.mjs convert <source folder> <new folder> [--name "My notes"] [--emojis emojis.json] [--default-emoji 📝] [--no-emoji] [--color amber]',
    )
    process.exit(1)
  }
  if (!source || !existsSync(source)) usage()
  const options = {
    name: values.name ?? basename(source),
    emojis: values.emojis ? JSON.parse(readFileSync(values.emojis, 'utf8')) : {},
    defaultEmoji: values['default-emoji'] ?? '📝',
    emoji: !values['no-emoji'],
    color: values.color,
  }
  if (command === 'inventory') {
    const { pages, report } = importNotes(readFolder(source), options)
    console.log(JSON.stringify({ pages, skipped: report.skipped }, null, 2))
    return
  }
  if (command !== 'convert' || !out) usage()
  if (existsSync(out) && readdirSync(out).length) {
    console.error(`${out} isn't empty: give a new folder, so nothing is overwritten.`)
    process.exit(1)
  }
  const { files, report, pages } = importNotes(readFolder(source), options)
  for (const [path, content] of files) {
    mkdirSync(dirname(join(out, path)), { recursive: true })
    writeFileSync(join(out, path), content)
  }
  const guessed = pages.filter((p) => p.suggested).length
  console.log(
    `${out}: ${report.leaves} leaves, ${report.assets} files in assets/, ${report.links} links; ${guessed} emoji chosen by the script (the rest from the titles or --emojis).`,
  )
  if (report.unresolved.length)
    console.log(
      `Links to notes not written yet (they show as ghosts): ${[...new Set(report.unresolved)].join(', ')}`,
    )
  if (report.skipped.length)
    console.log(
      `Not converted (export them as HTML or Markdown first): ${report.skipped.join(', ')}`,
    )
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main()
