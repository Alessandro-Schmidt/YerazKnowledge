// Leaf text → HTML for the read view (ARCHITECTURE.md §8). markdown-it is loaded on first
// use, so it isn't part of the first-load JavaScript. Raw HTML in a leaf is shown as text,
// never run. Links to leaves become @ chips that open the leaf in the app. Math, code
// highlighting and embeds are in rich.ts.

import type MarkdownItClass from 'markdown-it'
import { HEADING, linkTarget, META, ownPath, stripBom } from '../model/parse'
import { encodePath } from '../ui/paths'
import { prepare, rich, type RichEnv } from './rich'

export interface RenderContext {
  /** In-app href for a leaf of this Tree, or null when there is no such leaf. */
  leafHref(path: string): string | null
  leafIcon(path: string): string | null
  /** Every file path in the Tree, for a video's subtitle tracks. */
  files?(): Iterable<string>
  /** Another connected Tree by `owner/name`: its title and in-app href (`#/tree/…`). */
  tree?(repo: string): { title: string; href: string } | null
}

type MarkdownIt = InstanceType<typeof MarkdownItClass>
type CoreRule = Parameters<MarkdownIt['core']['ruler']['after']>[2]
type StateCore = Parameters<CoreRule>[0]

let parser: Promise<MarkdownIt> | null = null

function load(): Promise<MarkdownIt> {
  parser ??= Promise.all([import('markdown-it'), import('@lezer/highlight')]).then(
    ([{ default: MarkdownIt }, highlight]) => {
      const md = new MarkdownIt({ html: false, linkify: true })
      rich(md, highlight)
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
    },
  )
  return parser
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

/** The body without line 1 (the title, shown above it) and line 2 (metadata). */
export function bodyOf(text: string): string {
  const lines = stripBom(text).split(/\r\n|\r|\n/)
  if (HEADING.test(lines[0] ?? '')) lines.shift()
  else return lines.join('\n')
  if (META.test(lines[0] ?? '')) lines.shift()
  return lines.join('\n')
}

const cache = new Map<string, string>()

/** HTML for a leaf; cached by blob SHA, since a SHA's content never changes. */
export async function renderLeaf(
  text: string,
  context: RenderContext,
  sha?: string,
): Promise<string> {
  const key = sha && `${sha}`
  if (key && cache.has(key)) return cache.get(key)!
  const md = await load()
  const env: RichEnv & { context: RenderContext } = { context }
  if (context.files) env.files = context.files
  if (context.tree) env.tree = context.tree
  const tokens = md.parse(bodyOf(text), env)
  await prepare(tokens, env)
  const html = md.renderer.render(tokens, md.options, env)
  if (key) cache.set(key, html)
  return html
}
