// What the read view adds to Markdown (ARCHITECTURE.md §7, §8): KaTeX math, code
// highlighted by the editor's own Lezer parsers, and embeds (YouTube, and PDFs and videos
// kept in the Tree). KaTeX and the parsers load only for leaves that use them.

import type MarkdownItClass from 'markdown-it'
import type { Parser } from '@lezer/common'
import { embedOf, MATH, subtitleTracks, type Embed } from '../model/embeds'

type MarkdownIt = InstanceType<typeof MarkdownItClass>
type Token = ReturnType<MarkdownIt['parse']>[number]

export type RichEnv = {
  katex?: typeof import('katex').default
  parsers?: Map<string, Parser>
  files?(): Iterable<string>
}

const lang = (info: string) => info.trim().split(/\s+/)[0]!.toLowerCase()

/** Loads KaTeX and the code parsers the tokens need, before rendering (markdown-it is sync). */
export async function prepare(tokens: Token[], env: RichEnv): Promise<void> {
  const walk = (list: Token[]): Token[] => list.flatMap((t) => [t, ...walk(t.children ?? [])])
  const all = walk(tokens)
  const langs = new Set(all.filter((t) => t.type === 'fence' && t.info).map((t) => lang(t.info)))
  const [katex] = await Promise.all([
    all.some((t) => t.type === 'math') ? import('./katex').then((m) => m.default) : undefined,
    langs.size ? loadParsers(langs, (env.parsers = new Map())) : undefined,
  ])
  if (katex) env.katex = katex
}

async function loadParsers(names: Set<string>, into: Map<string, Parser>) {
  const [{ LanguageDescription }, { languages }] = await Promise.all([
    import('@codemirror/language'),
    import('@codemirror/language-data'),
  ])
  await Promise.all(
    [...names].map(async (name) => {
      const found = LanguageDescription.matchLanguageName(languages, name, true)
      if (!found) return
      const support = found.support ?? (await found.load())
      into.set(name, support.language.parser)
    }),
  )
}

export function rich(md: MarkdownIt, highlight: typeof import('@lezer/highlight')) {
  const escape = md.utils.escapeHtml

  // $inline$ and $$display$$ (one paragraph); the rules are in model/embeds.ts.
  const at = new RegExp(MATH.source, 'y')
  md.inline.ruler.before('escape', 'math', (state, silent) => {
    if (state.src[state.pos] !== '$') return false
    at.lastIndex = state.pos
    const m = at.exec(state.src)
    if (!m) return false
    if (!silent) {
      const token = state.push('math', 'span', 0)
      token.content = m[1] ?? m[2]!
      token.meta = { display: m[1] !== undefined, source: m[0] }
    }
    state.pos += m[0].length
    return true
  })
  md.renderer.rules.math = (tokens, i, _options, e) => {
    const env = e as RichEnv
    const { content } = tokens[i]!
    const meta = tokens[i]!.meta as { display: boolean; source: string }
    if (!env.katex) return escape(meta.source)
    return env.katex.renderToString(content, { displayMode: meta.display, throwOnError: false })
  }

  // Code fences, highlighted with the same parsers as the editor.
  const fence = md.renderer.rules.fence!
  md.renderer.rules.fence = (tokens, i, options, e, self) => {
    const env = e as RichEnv
    const token = tokens[i]!
    const parser = token.info ? env.parsers?.get(lang(token.info)) : undefined
    if (!parser) return fence(tokens, i, options, env, self)
    let html = ''
    highlight.highlightCode(
      token.content,
      parser.parse(token.content),
      highlight.classHighlighter,
      (text, classes) => {
        html += classes ? `<span class="${classes}">${escape(text)}</span>` : escape(text)
      },
      () => {
        html += '\n'
      },
    )
    return `<pre><code class="language-${escape(lang(token.info))}">${html}</code></pre>\n`
  }

  // A paragraph that is only a link to a video or a PDF becomes a player.
  md.core.ruler.push('embeds', (state) => {
    const tokens = state.tokens
    for (let i = tokens.length - 2; i > 0; i--) {
      if (tokens[i - 1]!.type !== 'paragraph_open' || tokens[i - 1]!.hidden) continue
      const embed = tokens[i]!.type === 'inline' ? embedOf(tokens[i]!.content) : null
      if (!embed) continue
      const block = new state.Token('html_block', '', 0)
      block.content = embedHtml(embed, state.env as RichEnv, escape)
      tokens.splice(i - 1, 3, block)
    }
  })
}

const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })
const languageName = (code: string) => {
  try {
    return languageNames.of(code) ?? code
  } catch {
    return code
  }
}

function embedHtml(embed: Embed, env: RichEnv, escape: (s: string) => string): string {
  const name = embed.kind === 'youtube' ? '' : embed.path.replace(/^.*\//, '')
  const title = escape(embed.title || name || 'YouTube video')
  if (embed.kind === 'youtube') {
    const src = `https://www.youtube-nocookie.com/embed/${embed.id}${embed.start ? `?start=${embed.start}` : ''}`
    return (
      `<div class="embed video"><iframe src="${src}" title="${title}" loading="lazy" ` +
      `allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen ` +
      `referrerpolicy="strict-origin-when-cross-origin"></iframe></div>\n`
    )
  }
  const path = escape(embed.path)
  if (embed.kind === 'pdf') {
    return (
      `<div class="embed pdf"><iframe class="pdf" data-asset="${path}" title="${title}" loading="lazy"></iframe>` +
      `<a data-asset-href="${path}" download="${escape(name)}">Download ${title}</a></div>\n`
    )
  }
  const tracks = subtitleTracks(embed.path, env.files?.() ?? []).map(
    (t, n) =>
      `<track kind="subtitles"${t.lang ? ` srclang="${escape(t.lang)}"` : ''} label="${escape(
        t.lang ? languageName(t.lang) : 'Subtitles',
      )}" data-asset="${escape(t.path)}"${n === 0 ? ' default' : ''}>`,
  )
  return (
    `<div class="embed video"><video controls preload="metadata" data-asset="${path}" title="${title}">` +
    `${tracks.join('')}</video></div>\n`
  )
}
