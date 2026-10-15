// Live preview (ARCHITECTURE.md §7): one decoration extension over the Markdown text.
// Lines without the cursor hide their syntax and show the result; the line being edited
// shows its Markdown. "Show Markdown" turns this extension off: same editor, same text.

import { syntaxTree } from '@codemirror/language'
import { Facet, RangeSetBuilder, type EditorState, type Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import { embedOf, mathSpans, type Embed } from '../model/embeds'
import { leadingIcon, linkTarget, META, ownPath } from '../model/parse'
import { mentionSource } from './mentions'

/** The title's icon with the space after it, so both can be hidden. */
const titleIcon = (rest: string) => {
  const icon = leadingIcon(rest)
  return icon && rest.slice(icon.length).startsWith(' ') ? `${icon} ` : icon
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked
  }
  toDOM() {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = this.checked
    box.className = 'cm-task'
    box.setAttribute('aria-label', this.checked ? 'Done' : 'To do')
    return box
  }
  ignoreEvent() {
    return false
  }
}

/** URLs for the Tree's own files (`/assets/…`): private repositories need the token. */
export const assetSource = Facet.define<
  (path: string) => Promise<string | null>,
  ((path: string) => Promise<string | null>) | null
>({ combine: (values) => values[0] ?? null })

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly resolve: ((path: string) => Promise<string | null>) | null,
  ) {
    super()
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt
  }
  toDOM() {
    const img = document.createElement('img')
    const own = ownPath(this.src)
    if (own === null) img.src = this.src
    else void this.resolve?.(own).then((url) => url && (img.src = url))
    img.alt = this.alt
    img.className = 'cm-image'
    img.loading = 'lazy'
    img.decoding = 'async'
    return img
  }
}

/** KaTeX, loaded the first time math is shown. */
class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
  ) {
    super()
  }
  eq(other: MathWidget) {
    return other.tex === this.tex && other.display === this.display
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = this.display ? 'cm-math cm-math-display' : 'cm-math'
    el.textContent = this.tex
    void import('../read/katex').then(({ default: katex }) =>
      katex.render(this.tex, el, { displayMode: this.display, throwOnError: false }),
    )
    return el
  }
}

/** A YouTube video, or a PDF or video kept in the Tree, in place of its link. */
class EmbedWidget extends WidgetType {
  constructor(
    readonly embed: Embed,
    readonly resolve: ((path: string) => Promise<string | null>) | null,
  ) {
    super()
  }
  eq(other: EmbedWidget) {
    return JSON.stringify(other.embed) === JSON.stringify(this.embed)
  }
  toDOM() {
    const { embed } = this
    const box = document.createElement('div')
    box.className = `cm-embed cm-embed-${embed.kind}`
    const el = document.createElement(embed.kind === 'video' ? 'video' : 'iframe')
    el.title = embed.title || (embed.kind === 'youtube' ? 'YouTube video' : embed.path)
    if (embed.kind === 'youtube') {
      el.src = `https://www.youtube-nocookie.com/embed/${embed.id}${embed.start ? `?start=${embed.start}` : ''}`
      el.setAttribute('allow', 'encrypted-media; picture-in-picture; fullscreen')
      el.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
    } else {
      if (el instanceof HTMLVideoElement) {
        el.controls = true
        el.preload = 'metadata'
      }
      void this.resolve?.(embed.path).then((url) => url && (el.src = url))
    }
    box.append(el)
    return box
  }
  ignoreEvent() {
    return true
  }
}

const hide = Decoration.replace({})
const line = (cls: string) => Decoration.line({ class: cls })
const mark = (cls: string) => Decoration.mark({ class: cls })

/** Lines holding the cursor or a selection: they show their Markdown. */
function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>()
  for (const r of state.selection.ranges) {
    const from = state.doc.lineAt(r.from).number
    const to = state.doc.lineAt(r.to).number
    for (let n = from; n <= to; n++) lines.add(n)
  }
  return lines
}

function build(view: EditorView): DecorationSet {
  const { state } = view
  const active = activeLines(state)
  const isActive = (pos: number) => active.has(state.doc.lineAt(pos).number)
  const decorations: Range<Decoration>[] = []

  // Line 1 is the title; line 2 may hold the metadata comment (ARCHITECTURE.md §4).
  decorations.push(line('cm-title').range(0))
  if (state.doc.lines >= 2) {
    const second = state.doc.line(2)
    if (META.test(second.text)) decorations.push(line('cm-meta').range(second.from))
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name
        const heading = /^ATXHeading(\d)$/.exec(name)
        if (heading) {
          decorations.push(line(`cm-h${heading[1]}`).range(state.doc.lineAt(node.from).from))
          return
        }
        switch (name) {
          case 'HeaderMark': {
            const after = state.sliceDoc(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to
            // Line 1 is the title: its "# " and icon stay hidden even while editing it,
            // since the icon picker above shows and changes the icon.
            if (node.from === 0) {
              const icon = titleIcon(state.doc.line(1).text.slice(after))
              decorations.push(hide.range(node.from, after + icon.length))
            } else if (!isActive(node.from)) {
              decorations.push(hide.range(node.from, after))
            }
            return
          }
          case 'Emphasis':
            decorations.push(mark('cm-em').range(node.from, node.to))
            return
          case 'StrongEmphasis':
            decorations.push(mark('cm-strong').range(node.from, node.to))
            return
          case 'Strikethrough':
            decorations.push(mark('cm-strike').range(node.from, node.to))
            return
          case 'InlineCode':
            decorations.push(mark('cm-inline-code').range(node.from, node.to))
            return
          case 'EmphasisMark':
          case 'CodeMark':
          case 'StrikethroughMark': {
            const parent = node.node.parent?.name
            if (parent !== 'FencedCode' && !isActive(node.from))
              decorations.push(hide.range(node.from, node.to))
            if (parent === 'FencedCode')
              decorations.push(mark('cm-fence').range(node.from, node.to))
            return
          }
          case 'Link': {
            const url = node.node.getChild('URL')
            const dest = url ? state.sliceDoc(url.from, url.to) : ''
            const target = linkTarget(dest)
            const active = isActive(node.from)
            const leaf =
              target && target.repo === null
                ? state.facet(mentionSource)?.leaf(target.path)
                : undefined
            decorations.push(
              (leaf && !active
                ? Decoration.mark({
                    class: 'cm-mention',
                    attributes: {
                      'data-path': leaf.path,
                      'data-before': `@ ${leaf.icon ? `${leaf.icon} ` : ''}`,
                    },
                  })
                : mark(target && target.repo === null ? 'cm-mention' : 'cm-link')
              ).range(node.from, node.to),
            )
            if (!active) {
              for (const child of [...node.node.getChildren('LinkMark'), ...(url ? [url] : [])]) {
                decorations.push(hide.range(child.from, child.to))
              }
              const title = node.node.getChild('LinkTitle')
              if (title) decorations.push(hide.range(title.from, title.to))
            }
            return false
          }
          case 'Image': {
            if (isActive(node.from)) return false
            const url = node.node.getChild('URL')
            const text = state.sliceDoc(node.from, node.to)
            const alt = /^!\[([^\]]*)\]/.exec(text)?.[1] ?? ''
            if (url) {
              decorations.push(
                Decoration.replace({
                  widget: new ImageWidget(
                    state.sliceDoc(url.from, url.to),
                    alt,
                    state.facet(assetSource),
                  ),
                }).range(node.from, node.to),
              )
            }
            return false
          }
          case 'Blockquote': {
            for (let pos = node.from; pos <= node.to;) {
              const l = state.doc.lineAt(pos)
              decorations.push(line('cm-quote').range(l.from))
              pos = l.to + 1
            }
            return
          }
          case 'QuoteMark':
            if (!isActive(node.from)) decorations.push(hide.range(node.from, node.to))
            return
          case 'ListMark':
            decorations.push(mark('cm-list-mark').range(node.from, node.to))
            return
          case 'TaskMarker': {
            const checked = /x/i.test(state.sliceDoc(node.from, node.to))
            if (!isActive(node.from)) {
              // The checkbox replaces the bullet too.
              const bullet = node.node.parent?.parent?.getChild('ListMark')
              if (bullet) decorations.push(hide.range(bullet.from, node.from))
              decorations.push(
                Decoration.replace({ widget: new CheckboxWidget(checked) }).range(
                  node.from,
                  node.to,
                ),
              )
            }
            if (checked)
              decorations.push(mark('cm-done').range(node.to, state.doc.lineAt(node.to).to))
            return
          }
          case 'FencedCode': {
            for (let pos = node.from; pos <= node.to;) {
              const l = state.doc.lineAt(pos)
              decorations.push(line('cm-code-block').range(l.from))
              pos = l.to + 1
            }
            return
          }
          case 'HorizontalRule':
            decorations.push(line('cm-rule').range(state.doc.lineAt(node.from).from))
            if (!isActive(node.from))
              decorations.push(mark('cm-rule-mark').range(node.from, node.to))
            return
        }
        return
      },
    })
  }

  // Math and embeds replace whole spans; what was decorated inside them gives way.
  const replaced = richRanges(view, isActive)
  const inside = (d: Range<Decoration>) =>
    d.from !== d.to && replaced.some((r) => d.from < r.to && d.to > r.from)
  const builder = new RangeSetBuilder<Decoration>()
  ;[...decorations.filter((d) => !inside(d)), ...replaced]
    .sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide)
    .forEach((d) => builder.add(d.from, d.to, d.value))
  return builder.finish()
}

/** Single-line math and embed lines, away from the cursor and outside code. */
function richRanges(view: EditorView, isActive: (pos: number) => boolean): Range<Decoration>[] {
  const { state } = view
  const out: Range<Decoration>[] = []
  const resolve = state.facet(assetSource)
  const inCode = (pos: number) => {
    for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent)
      if (n.name === 'FencedCode' || n.name === 'CodeBlock') return true
    return false
  }
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const l = state.doc.lineAt(pos)
      pos = l.to + 1
      if (l.number === 1 || isActive(l.from) || !l.text.trim() || inCode(l.from)) continue
      const alone =
        state.doc.line(l.number - 1).text.trim() === '' &&
        (l.number === state.doc.lines || state.doc.line(l.number + 1).text.trim() === '')
      const embed = alone ? embedOf(l.text) : null
      if (embed) {
        out.push(
          Decoration.replace({ widget: new EmbedWidget(embed, resolve) }).range(l.from, l.to),
        )
        continue
      }
      for (const m of mathSpans(l.text)) {
        out.push(
          Decoration.replace({ widget: new MathWidget(m.tex, m.display) }).range(
            l.from + m.from,
            l.from + m.to,
          ),
        )
      }
    }
  }
  return out
}

/** Toggles a task when its checkbox is clicked: `[ ]` ↔ `[x]` in the text. */
const toggleTasks = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target as HTMLElement
    if (!target.classList.contains('cm-task')) return false
    const pos = view.posAtDOM(target)
    const text = view.state.sliceDoc(pos, pos + 3)
    const next = /\[[xX]\]/.test(text) ? '[ ]' : /\[ \]/.test(text) ? '[x]' : null
    if (!next) return false
    view.dispatch({ changes: { from: pos, to: pos + 3, insert: next } })
    event.preventDefault()
    return true
  },
})

export const livePreview = [
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = build(view)
      }
      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          syntaxTree(update.startState) !== syntaxTree(update.state)
        ) {
          this.decorations = build(update.view)
        }
      }
    },
    { decorations: (v) => v.decorations },
  ),
  toggleTasks,
]
