// Live preview (ARCHITECTURE.md §7): one decoration extension over the Markdown text.
// Lines without the cursor hide their syntax and show the result; the line being edited
// shows its Markdown. "Show Markdown" turns this extension off: same editor, same text.

import { syntaxTree } from '@codemirror/language'
import {
  Facet,
  RangeSetBuilder,
  type ChangeSpec,
  type EditorState,
  type Range,
} from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import {
  embedOf,
  imageWidth,
  languageName,
  mathSpans,
  shortUrl,
  subtitleTracks,
  titleWithWidth,
  type Embed,
} from '../model/embeds'
import { leadingIcon, linkTarget, ownPath } from '../model/parse'
import { downloadAsset, fileCardHtml } from '../read/files'
import { encodePath } from '../ui/paths'
import { mentionSource } from './mentions'
import { metaLine } from './metaLine'

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

/** Every file path in the Tree, for a video's subtitle tracks. */
export const treeFiles = Facet.define<() => Iterable<string>, (() => Iterable<string>) | null>({
  combine: (values) => values[0] ?? null,
})

/** Sizes of the Tree's files, for attachment cards. */
export const fileSizes = Facet.define<
  (path: string) => number | null,
  (path: string) => number | null
>({
  combine: (values) => values[0] ?? (() => null),
})

/** The smallest width an image is dragged to, in percent of the column. */
const MIN_IMAGE_WIDTH = 10
const clampWidth = (width: number) => Math.min(100, Math.max(MIN_IMAGE_WIDTH, Math.round(width)))

/** The change that gives the image starting at `from` this width (§4), or null if none. */
export function imageResize(
  state: EditorState,
  from: number,
  width: number | null,
): ChangeSpec | null {
  let image: SyntaxNode | null = syntaxTree(state).resolveInner(from, 1)
  while (image && !(image.name === 'Image' && image.from === from)) image = image.parent
  const url = image?.getChild('URL')
  if (!image || !url) return null
  const title = image.getChild('LinkTitle')
  const before = title ? state.sliceDoc(title.from + 1, title.to - 1).replace(/\\(.)/g, '$1') : ''
  const after = titleWithWidth(before, width)
  if (imageWidth(before).width === imageWidth(after).width) return null
  const insert = after ? ` "${after.replace(/["\\]/g, '\\$&')}"` : ''
  return { from: url.to, to: title?.to ?? url.to, insert }
}

/** Shows an image's width on its frame and on the handle that announces it. */
function showWidth(frame: HTMLElement, width: number | null) {
  frame.style.width = width === null ? '' : `${width}%`
  if (width === null) delete frame.dataset.width
  else frame.dataset.width = String(width)
  const slider = frame.querySelector('[role="slider"]')
  slider?.setAttribute('aria-valuenow', String(width ?? 100))
  slider?.setAttribute('aria-valuetext', `${width ?? 100}% of the column`)
}

/** The image's width now, in percent of its line. */
function widthNow(frame: HTMLElement): number {
  const line = frame.closest<HTMLElement>('.cm-line') ?? frame.parentElement!
  const style = getComputedStyle(line)
  const column = line.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  return (frame.offsetWidth / column) * 100
}

function commitWidth(view: EditorView, frame: HTMLElement, width: number) {
  const change = imageResize(view.state, view.posAtDOM(frame), width)
  if (change) view.dispatch({ changes: change })
}

/**
 * Dragging either side resizes the image around its centre: towards the inside it gets
 * smaller, towards the outside bigger, up to the column. The text changes once, on release.
 */
function dragWidth(view: EditorView, frame: HTMLElement, side: -1 | 1, down: PointerEvent) {
  if (down.button !== 0) return
  down.preventDefault()
  const handle = down.currentTarget as HTMLElement
  handle.setPointerCapture(down.pointerId)
  const start = widthNow(frame)
  const perPixel = start / frame.offsetWidth
  let width: number | null = null
  const move = (event: PointerEvent) => {
    // Both sides move, so the image grows by twice the pointer's travel.
    width = clampWidth(start + side * 2 * (event.clientX - down.clientX) * perPixel)
    showWidth(frame, width)
  }
  const end = () => {
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', end)
    handle.removeEventListener('pointercancel', end)
    if (width !== null) commitWidth(view, frame, width)
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', end)
  handle.addEventListener('pointercancel', end)
}

/** The same from the keyboard: arrows by 5%, Home and End to the smallest and full width. */
function keyWidth(view: EditorView, frame: HTMLElement, event: KeyboardEvent) {
  const now = clampWidth(widthNow(frame))
  const width =
    event.key === 'ArrowLeft' || event.key === 'ArrowDown'
      ? now - 5
      : event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? now + 5
        : event.key === 'Home'
          ? MIN_IMAGE_WIDTH
          : event.key === 'End'
            ? 100
            : null
  if (width === null) return
  event.preventDefault()
  commitWidth(view, frame, clampWidth(width))
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly width: number | null,
    readonly resolve: ((path: string) => Promise<string | null>) | null,
  ) {
    super()
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt && other.width === this.width
  }
  toDOM(view: EditorView) {
    const frame = document.createElement('span')
    frame.className = 'cm-image'
    frame.dataset.src = this.src
    const img = document.createElement('img')
    const own = ownPath(this.src)
    if (own === null) img.src = this.src
    else void this.resolve?.(own).then((url) => url && (img.src = url))
    img.alt = this.alt
    img.loading = 'lazy'
    img.decoding = 'async'
    frame.append(img)
    for (const side of [-1, 1] as const) {
      const handle = document.createElement('span')
      handle.className = 'cm-image-handle'
      handle.dataset.side = side < 0 ? 'start' : 'end'
      handle.addEventListener('pointerdown', (event) => dragWidth(view, frame, side, event))
      if (side < 0) handle.setAttribute('aria-hidden', 'true')
      else {
        // One handle is the keyboard's: a slider over the width.
        handle.tabIndex = 0
        handle.setAttribute('role', 'slider')
        handle.setAttribute('aria-label', `Width of ${this.alt || 'the image'}`)
        handle.setAttribute('aria-valuemin', String(MIN_IMAGE_WIDTH))
        handle.setAttribute('aria-valuemax', '100')
        handle.addEventListener('keydown', (event) => keyWidth(view, frame, event))
      }
      frame.append(handle)
    }
    showWidth(frame, this.width)
    return frame
  }
  /** A new width for the same image keeps its element: the picture and the focus stay. */
  updateDOM(dom: HTMLElement) {
    if (dom.dataset.src !== this.src || dom.querySelector('img')?.alt !== this.alt) return false
    showWidth(dom, this.width)
    return true
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

/**
 * A YouTube video, a PDF or video kept in the Tree, a repository, a bookmark or a card for
 * any other file, in place of its link. A click on a bookmark's title edits its line; its
 * address opens the page, as in the read view. A click on a file card downloads it.
 */
class EmbedWidget extends WidgetType {
  constructor(
    readonly embed: Embed,
    readonly resolve: ((path: string) => Promise<string | null>) | null,
    /** A file's size, for its card. */
    readonly size: number | null = null,
    /** A connected Tree, for a repository card. */
    readonly tree: { title: string; href: string } | null = null,
    /** A video's subtitle files. */
    readonly tracks: { path: string; lang: string }[] = [],
  ) {
    super()
  }
  eq(other: EmbedWidget) {
    return (
      JSON.stringify([other.embed, other.size, other.tree, other.tracks]) ===
      JSON.stringify([this.embed, this.size, this.tree, this.tracks])
    )
  }
  toDOM() {
    const { embed } = this
    if (embed.kind === 'repo') {
      // As in the read view: a connected Tree opens in the app, any other repository on GitHub.
      const { tree } = this
      const card = document.createElement('a')
      card.className = 'cm-embed cm-embed-repo'
      card.href = tree?.href ?? `https://github.com/${embed.repo}`
      if (!tree) {
        card.target = '_blank'
        card.rel = 'noopener noreferrer'
      }
      const name = document.createElement('strong')
      name.textContent = embed.title || tree?.title || embed.repo.replace(/^.*\//, '')
      const repo = document.createElement('span')
      repo.textContent = embed.repo
      const kind = document.createElement('em')
      kind.textContent = tree ? 'Family' : 'GitHub repository'
      card.append(name, repo, kind)
      return card
    }
    const box = document.createElement('div')
    box.className = `cm-embed cm-embed-${embed.kind}`
    if (embed.kind === 'file') {
      box.innerHTML = fileCardHtml(embed, this.size)
      const resolve = this.resolve
      if (resolve) box.addEventListener('click', () => void downloadAsset(embed.path, resolve))
      return box
    }
    if (embed.kind === 'bookmark') {
      const title = document.createElement('strong')
      const url = document.createElement('span')
      title.textContent = embed.title
      url.textContent = shortUrl(embed.url)
      url.dataset.href = embed.url
      box.title = embed.url
      box.append(title, url)
      return box
    }
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
      this.tracks.forEach((t, n) => {
        const track = document.createElement('track')
        track.kind = 'subtitles'
        if (t.lang) track.srclang = t.lang
        track.label = t.lang ? languageName(t.lang) : 'Subtitles'
        track.default = n === 0
        void this.resolve?.(t.path).then((url) => url && (track.src = url))
        el.append(track)
      })
    }
    box.append(el)
    if (embed.kind === 'pdf') {
      const download = document.createElement('a')
      const name = embed.path.replace(/^.*\//, '')
      download.download = name
      download.textContent = `Download ${embed.title || name}`
      void this.resolve?.(embed.path).then((url) => url && (download.href = url))
      box.append(download)
    }
    return box
  }
  ignoreEvent() {
    return this.embed.kind !== 'bookmark'
  }
}

const hide = Decoration.replace({})
const line = (cls: string) => Decoration.line({ class: cls })
const title = Decoration.line({
  class: 'cm-title',
  attributes: { role: 'heading', 'aria-level': '2' },
})
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

  // Line 1 is the title, the leaf's heading; line 2's metadata is hidden by metaLine.
  decorations.push(title.range(0))

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
            const source = state.facet(mentionSource)
            const leaf = target && target.repo === null ? source?.leaf(target.path) : undefined
            const other = target?.repo ? source?.tree?.(target.repo) : null
            // Away from the cursor, chips and links carry their target, and a click opens it.
            const web = /^<?https?:\/\//.test(dest) ? dest.replace(/^<|>$/g, '') : null
            decorations.push(
              (active
                ? mark(target && target.repo === null ? 'cm-mention' : 'cm-link')
                : leaf
                  ? Decoration.mark({
                      class: 'cm-mention',
                      attributes: {
                        'data-path': leaf.path,
                        'data-before': `@ ${leaf.icon ? `${leaf.icon} ` : ''}`,
                      },
                    })
                  : other && target
                    ? Decoration.mark({
                        class: 'cm-mention',
                        attributes: {
                          'data-href': `${other.href}/${encodePath(target.path)}`,
                          'data-before': '@ ',
                        },
                      })
                    : web
                      ? Decoration.mark({ class: 'cm-link', attributes: { 'data-href': web } })
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
            const title = node.node.getChild('LinkTitle')
            const { width } = imageWidth(title ? state.sliceDoc(title.from + 1, title.to - 1) : '')
            if (url) {
              decorations.push(
                Decoration.replace({
                  widget: new ImageWidget(
                    state.sliceDoc(url.from, url.to),
                    alt,
                    width,
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
        const tree =
          embed.kind === 'repo' ? (state.facet(mentionSource)?.tree?.(embed.repo) ?? null) : null
        const tracks =
          embed.kind === 'video' ? subtitleTracks(embed.path, state.facet(treeFiles)?.() ?? []) : []
        out.push(
          Decoration.replace({
            widget: new EmbedWidget(
              embed,
              resolve,
              embed.kind === 'file' ? state.facet(fileSizes)(embed.path) : null,
              tree,
              tracks,
            ),
          }).range(l.from, l.to),
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
  metaLine,
]
