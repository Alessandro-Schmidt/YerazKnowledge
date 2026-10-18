// Leaf text → HTML for the read view, which is what a leaf prints as (ARCHITECTURE.md §8). markdown-it is loaded on first
// use, so it isn't part of the first-load JavaScript. Raw HTML in a leaf is shown as text,
// never run; only `<details>` toggles are drawn, from fixed tags. Links to leaves become @
// chips that open the leaf in the app. GitHub's alerts and footnotes are drawn as on
// github.com. Math, code highlighting, diagrams and embeds are in rich.ts.

import type MarkdownItClass from 'markdown-it'
import { calloutOf, calloutTitle, detailsClose, detailsOpen } from '../model/blocks'
import { imageWidth } from '../model/embeds'
import { HEADING, linkTarget, META, ownPath, repairHeader, stripBom } from '../model/parse'
import { encodePath } from '../ui/paths'
import { prepare, rich, type RichEnv } from './rich'

export interface RenderContext {
  /** In-app href for a leaf of this Tree, or null when there is no such leaf. */
  leafHref(path: string): string | null
  leafIcon(path: string): string | null
  /** Every file path in the Tree, for a video's subtitle tracks. */
  files?(): Iterable<string>
  /** A file's size in bytes, when known (attachments show it). */
  size?(path: string): number | null
  /** Another connected Tree by `owner/name`: its title and in-app href (`#/tree/…`). */
  tree?(repo: string): { title: string; href: string } | null
}

type MarkdownIt = InstanceType<typeof MarkdownItClass>
type CoreRule = Parameters<MarkdownIt['core']['ruler']['after']>[2]
type StateCore = Parameters<CoreRule>[0]

let parser: Promise<MarkdownIt> | null = null

function load(): Promise<MarkdownIt> {
  parser ??= Promise.all([
    import('markdown-it'),
    import('markdown-it-footnote'),
    import('@lezer/highlight'),
  ]).then(([{ default: MarkdownIt }, { default: footnote }, highlight]) => {
    const md = new MarkdownIt({ html: false, linkify: true }).use(footnote)
    // GitHub has no inline footnotes (`^[text]`), and numbers them without brackets.
    md.inline.ruler.disable('footnote_inline')
    md.renderer.rules.footnote_caption = (tokens, i) =>
      String(Number((tokens[i]!.meta as { id: number }).id) + 1)
    rich(md, highlight)
    md.core.ruler.after('block', 'callouts', callouts)
    md.core.ruler.after('block', 'details', details)
    md.core.ruler.after('inline', 'task-lists', taskLists)
    // The leaf's title is the page's h2, so its own headings start one level below.
    md.core.ruler.push('shift-headings', (state) => {
      for (const token of state.tokens) {
        if (token.type === 'heading_open' || token.type === 'heading_close') {
          token.tag = `h${Math.min(6, Number(token.tag.slice(1)) + 1)}`
        }
      }
    })
    // The Tree's own images (`/assets/…`) need the token in private repositories: the
    // read view fills in `src` from the blob cache (hydrateAssets).
    const renderImage = md.renderer.rules.image!
    md.renderer.rules.image = (tokens, i, options, env, self) => {
      const token = tokens[i]!
      const own = ownPath(String(token.attrGet('src') ?? ''))
      if (own !== null) {
        token.attrs = token.attrs?.filter(([name]) => name !== 'src') ?? null
        token.attrSet('data-asset', own)
      }
      const title = token.attrGet('title')
      if (title !== null) {
        const { width, caption } = imageWidth(String(title))
        token.attrs = token.attrs?.filter(([name]) => name !== 'title') ?? null
        if (caption) token.attrSet('title', caption)
        if (width !== null) token.attrSet('width', `${width}%`)
      }
      token.attrSet('loading', 'lazy')
      token.attrSet('decoding', 'async')
      return renderImage(tokens, i, options, env, self)
    }
    const renderLink =
      md.renderer.rules.link_open ??
      ((tokens, i, options, _env, self) => self.renderToken(tokens, i, options))
    md.renderer.rules.link_open = (tokens, i, options, env, self) => {
      const { context } = env as { context: RenderContext }
      const token = tokens[i]!
      const href = String(token.attrGet('href') ?? '')
      const target = linkTarget(href)
      const other = target?.repo ? context.tree?.(target.repo) : null
      const inApp = !target
        ? null
        : target.repo === null
          ? context.leafHref(target.path)
          : other
            ? `${other.href}/${encodePath(target.path)}`
            : null
      if (inApp && target) {
        const icon = target.repo === null ? context.leafIcon(target.path) : null
        token.attrSet('href', inApp)
        token.attrJoin('class', 'mention')
        token.attrSet('data-before', `@ ${icon ? `${icon} ` : ''}`)
      } else if (/^https?:\/\//.test(href)) {
        token.attrSet('target', '_blank')
        token.attrSet('rel', 'noopener noreferrer')
      }
      return renderLink(tokens, i, options, env, self)
    }
    return md
  })
  return parser
}

/** A quote whose first line is only `[!NOTE]` (TIP, IMPORTANT, WARNING, CAUTION) is an alert. */
function callouts(state: StateCore) {
  const tokens = state.tokens
  for (let i = 0; i + 2 < tokens.length; i++) {
    const inline = tokens[i + 2]!
    if (tokens[i]!.type !== 'blockquote_open' || tokens[i + 1]!.type !== 'paragraph_open') continue
    const [first = '', ...rest] = inline.content.split('\n')
    const kind = calloutOf(first)
    if (!kind) continue
    tokens[i]!.attrJoin('class', `callout callout-${kind}`)
    const title = new state.Token('html_block', '', 0)
    title.content = `<p class="callout-title">${calloutTitle(kind)}</p>\n`
    inline.content = rest.join('\n')
    // The marker alone was the whole paragraph: the title takes its place.
    tokens.splice(i + 1, rest.length ? 0 : 3, title)
  }
}

/**
 * `<details>` toggles, as GitHub draws them: a paragraph of only `<details>` (and its
 * `<summary>`) opens one and a paragraph of only `</details>` closes it, at the top level.
 * Only these fixed tags are written, the summary escaped, so raw HTML still never runs.
 */
function details(state: StateCore) {
  const tokens = state.tokens
  const html = (content: string) => {
    const token = new state.Token('html_block', '', 0)
    token.content = content
    return token
  }
  const opens: number[] = []
  for (let i = 0; i + 2 < tokens.length; i++) {
    if (tokens[i]!.type !== 'paragraph_open' || tokens[i]!.level !== 0) continue
    const text = tokens[i + 1]!.content
    if (detailsOpen(text)) opens.push(i)
    else if (detailsClose(text) && opens.length) {
      const at = opens.pop()!
      const { open, summary } = detailsOpen(tokens[at + 1]!.content)!
      const tag = `<details${open ? ' open' : ''}><summary>${state.md.utils.escapeHtml(summary)}</summary>\n`
      tokens.splice(i, 3, html('</details>\n'))
      tokens.splice(at, 3, html(tag))
      i -= 2
    }
  }
}

/** `- [ ] task` and `- [x] done` become disabled checkboxes (read-only in the read view). */
function taskLists(state: StateCore) {
  const tokens = state.tokens
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i]!
    if (
      inline.type !== 'inline' ||
      tokens[i - 1]!.type !== 'paragraph_open' ||
      tokens[i - 2]!.type !== 'list_item_open'
    ) {
      continue
    }
    const mark = /^\[([ xX])\][ \t]/.exec(inline.content)
    const first = inline.children?.[0]
    if (!mark || first?.type !== 'text') continue
    first.content = first.content.slice(mark[0].length)
    const box = new state.Token('html_inline', '', 0)
    box.content = `<input type="checkbox" disabled${mark[1] === ' ' ? '' : ' checked'}> `
    inline.children!.unshift(box)
    tokens[i - 2]!.attrJoin('class', 'task')
  }
}

/** The body without line 1 (the title, shown above it) and line 2 (metadata), even repeated. */
export function bodyOf(text: string): string {
  const lines = stripBom(repairHeader(text)).split(/\r\n|\r|\n/)
  if (HEADING.test(lines[0] ?? '')) lines.shift()
  else return lines.join('\n')
  if (META.test(lines[0] ?? '')) lines.shift()
  return lines.join('\n')
}

/** HTML for a leaf, as printed (the screen shows it in the editor). */
export async function renderLeaf(text: string, context: RenderContext): Promise<string> {
  const md = await load()
  const env: RichEnv & { context: RenderContext } = { context }
  if (context.files) env.files = context.files
  if (context.size) env.size = context.size
  if (context.tree) env.tree = context.tree
  const tokens = md.parse(bodyOf(text), env)
  await prepare(tokens, env)
  return md.renderer.render(tokens, md.options, env)
}
