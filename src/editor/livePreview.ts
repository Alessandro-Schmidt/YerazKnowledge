// Live preview (ARCHITECTURE.md §7): one decoration extension over the Markdown text.
// Writing shows the result, not the Markdown (issue #68): only the piece of syntax the
// cursor touches shows its marks (a heading's `##`, a span's `**`), so it can be edited.
// Links, images, embeds and tables never show their Markdown unless the person asks, from
// their ⋯ menu (elements.ts, tables.ts); callouts and toggles show theirs on the cursor's line.
// "Show Markdown" turns this extension off: same editor, same text.
// GitHub's alerts, footnote marks, toggles and Mermaid diagrams show as github.com draws them.

import { syntaxTree } from '@codemirror/language'
import {
  Facet,
  RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
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
  calloutOf,
  calloutTitle,
  detailsClose,
  detailsOpen,
  isDiagram,
  type Callout,
} from '../model/blocks'
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
import {
  beingTyped,
  deletion,
  elements,
  moreButton,
  openElementMenu,
  revealSource,
  shownSource,
  sourceShown,
} from './elements'
import { titleShown } from './emptyText'
import { askHost } from './insertMenu'
import { mentionSource } from './mentions'
import { metaLine } from './metaLine'
import { tableEditing } from './tables'

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

/** The image that starts at `from`, if any. */
function imageAt(state: EditorState, from: number): SyntaxNode | null {
  let image: SyntaxNode | null = syntaxTree(state).resolveInner(from, 1)
  while (image && !(image.name === 'Image' && image.from === from)) image = image.parent
  return image
}

/** The change that gives the image starting at `from` this width (§4), or null if none. */
export function imageResize(
  state: EditorState,
  from: number,
  width: number | null,
): ChangeSpec | null {
  const image = imageAt(state, from)
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

const IMAGE_ITEMS = [
  { kind: 'replace', label: 'Replace image' },
  { kind: 'markdown', label: 'Show Markdown' },
  { kind: 'delete', label: 'Delete image' },
] as const

/** An image's ⋯ menu: another picture in its place, its Markdown, or deleting it. */
function imageMenu(view: EditorView, frame: HTMLElement, button: HTMLElement) {
  const from = view.posAtDOM(frame)
  openElementMenu(
    view,
    from,
    'Image',
    IMAGE_ITEMS,
    (kind) => {
      const image = imageAt(view.state, from)
      if (!image) return
      if (kind === 'markdown') return revealSource(view, image.from, image.to, image.to)
      if (kind === 'delete') {
        view.dispatch({ changes: deletion(view.state, image.from, image.to) })
        return view.focus()
      }
      // The new picture takes the selection's place: this image.
      view.dispatch({ selection: { anchor: image.from, head: image.to } })
      askHost(view, 'image')
    },
    button,
  )
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
    frame.append(moreButton('Image', (button) => imageMenu(view, frame, button)))
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
  // Clicks reach the editor: one puts the cursor at the math (toggleTasks below).
  ignoreEvent() {
    return false
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
  toDOM(view: EditorView) {
    const box = this.draw()
    box.append(moreButton('Embed', (button) => embedMenu(view, box, button, this.embed)))
    return box
  }
  private draw() {
    const { embed } = this
    if (embed.kind === 'repo') {
      // As in the read view: a connected Tree opens in the app, any other repository on GitHub.
      const { tree } = this
      const box = document.createElement('div')
      box.className = 'cm-embed cm-embed-repo-box'
      const card = document.createElement('a')
      card.className = 'cm-embed-repo'
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
      box.append(card)
      return box
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
  ignoreEvent(event: Event) {
    return this.embed.kind !== 'bookmark' || !!(event.target as Element).closest?.('.cm-more')
  }
}

/** An embed's ⋯ menu: open a bookmark, show the Markdown, or delete it. */
function embedMenu(view: EditorView, box: HTMLElement, button: HTMLElement, embed: Embed) {
  const from = view.posAtDOM(box)
  const items = [
    ...(embed.kind === 'bookmark' ? [{ kind: 'open' as const, label: 'Open link' }] : []),
    { kind: 'markdown' as const, label: 'Show Markdown' },
    { kind: 'delete' as const, label: 'Delete' },
  ]
  openElementMenu(
    view,
    from,
    'Embed',
    items,
    (kind) => {
      const line = view.state.doc.lineAt(from)
      if (kind === 'open' && embed.kind === 'bookmark')
        window.open(embed.url, '_blank', 'noopener,noreferrer')
      else if (kind === 'markdown') revealSource(view, line.from, line.to, line.to)
      else if (kind === 'delete') {
        view.dispatch({ changes: deletion(view.state, line.from, line.to) })
        view.focus()
      }
    },
    button,
  )
}

/** A list's bullet, in place of its `-`. */
class BulletWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const dot = document.createElement('span')
    dot.className = 'cm-list-mark cm-bullet'
    dot.textContent = '•'
    return dot
  }
}

/** An alert's title in place of its `[!NOTE]` marker. */
class CalloutWidget extends WidgetType {
  constructor(readonly kind: Callout) {
    super()
  }
  eq(other: CalloutWidget) {
    return other.kind === this.kind
  }
  toDOM() {
    const title = document.createElement('span')
    title.className = 'cm-callout-title'
    title.textContent = calloutTitle(this.kind)
    return title
  }
}

/** A Mermaid diagram, drawn the first time one is shown; its source if it can't be. */
class DiagramWidget extends WidgetType {
  constructor(readonly source: string) {
    super()
  }
  eq(other: DiagramWidget) {
    return other.source === this.source
  }
  toDOM(view: EditorView) {
    const box = document.createElement('div')
    box.className = 'cm-diagram'
    box.textContent = this.source
    void import('../read/mermaid')
      .then(({ diagram }) => diagram(this.source))
      .then(
        (svg) => {
          box.classList.add('diagram')
          box.innerHTML = svg
          view.requestMeasure()
        },
        () => undefined,
      )
    return box
  }
  /** A click puts the cursor in the source, which then shows. */
  ignoreEvent() {
    return false
  }
}

/** A toggle's summary in place of its `<details>` and `<summary>` tags; its arrow folds it. */
class SummaryWidget extends WidgetType {
  constructor(
    readonly summary: string,
    readonly folded: boolean,
  ) {
    super()
  }
  eq(other: SummaryWidget) {
    return other.summary === this.summary && other.folded === this.folded
  }
  toDOM(view: EditorView) {
    const box = document.createElement('div')
    box.className = 'cm-details-summary'
    const fold = document.createElement('button')
    fold.type = 'button'
    fold.className = 'cm-details-toggle'
    fold.setAttribute('aria-expanded', String(!this.folded))
    fold.setAttribute('aria-label', `${this.folded ? 'Open' : 'Close'} ${this.summary}`)
    fold.addEventListener('mousedown', (e) => e.preventDefault())
    fold.addEventListener('click', () =>
      view.dispatch({ effects: foldDetails.of(view.posAtDOM(box)) }),
    )
    const title = document.createElement('span')
    title.textContent = this.summary
    box.append(fold, title)
    return box
  }
  /** A click on the summary puts the cursor in it, which shows its source to edit. */
  ignoreEvent(event: Event) {
    return !!(event.target as Element).closest?.('.cm-details-toggle')
  }
}

/** The end of a toggle, in place of `</details>`. */
class DetailsEndWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const end = document.createElement('div')
    end.className = 'cm-details-end'
    return end
  }
  ignoreEvent() {
    return false
  }
}

/** Folds or unfolds the toggle whose `<details>` starts at a position. */
const foldDetails = StateEffect.define<number>()

/** Toggles folded otherwise than they are written (`<details open>` is unfolded). */
const flippedDetails = StateField.define<readonly number[]>({
  create: () => [],
  update(value, tr) {
    let next = tr.docChanged ? value.map((pos) => tr.changes.mapPos(pos)) : value
    for (const e of tr.effects)
      if (e.is(foldDetails))
        next = next.includes(e.value) ? next.filter((p) => p !== e.value) : [...next, e.value]
    return next
  },
})

/**
 * Blocks spanning lines, from a state field (a view plugin can't replace line breaks):
 * closed ```mermaid blocks at the top level, away from the cursor, as their diagrams, and
 * `<details>` toggles as on github.com, folded as written until their arrow is clicked.
 */
export function diagramBlocks(state: EditorState): DecorationSet {
  const blocks: Range<Decoration>[] = []
  const touched = (from: number, to: number) =>
    state.selection.ranges.some((r) => r.from <= to && r.to >= from)
  const flipped = state.field(flippedDetails, false) ?? []
  const opens: { from: number; to: number; open: boolean; summary: string }[] = []
  /** Folded toggles' bodies: nothing in them is drawn. */
  const folded: [number, number][] = []
  const lines = (from: number, to: number): [number, number] => [
    state.doc.lineAt(from).from,
    state.doc.lineAt(to).to,
  ]
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === 'Document') return true
      if (node.name === 'HTMLBlock' || node.name === 'Paragraph') {
        const [from, to] = lines(node.from, node.to)
        const text = state.sliceDoc(node.from, node.to)
        const open = detailsOpen(text)
        if (open) opens.push({ from, to, ...open })
        else if (detailsClose(text) && opens.length) {
          const start = opens.pop()!
          const fold = start.open === flipped.includes(start.from)
          if (!touched(start.from, start.to))
            blocks.push(
              Decoration.replace({
                widget: new SummaryWidget(start.summary, fold),
                block: true,
              }).range(start.from, start.to),
            )
          if (!touched(from, to))
            blocks.push(
              Decoration.replace({ widget: new DetailsEndWidget(), block: true }).range(from, to),
            )
          const body = [start.to + 1, from - 1] as const
          if (body[0] <= body[1]) {
            if (fold && body[0] < body[1] && !touched(body[0], body[1])) {
              folded.push([body[0], body[1]])
              blocks.push(Decoration.replace({ block: true }).range(body[0], body[1]))
            } else
              for (let pos = body[0]; pos <= body[1];) {
                const l = state.doc.lineAt(pos)
                blocks.push(line('cm-details-body').range(l.from))
                pos = l.to + 1
              }
          }
        }
        return false
      }
      if (node.name !== 'FencedCode') return false
      const info = node.node.getChild('CodeInfo')
      const code = node.node.getChild('CodeText')
      const from = state.doc.lineAt(node.from).from
      const to = state.doc.lineAt(node.to).to
      if (
        info &&
        isDiagram(state.sliceDoc(info.from, info.to)) &&
        node.node.getChildren('CodeMark').length === 2 &&
        !touched(from, to)
      ) {
        const source = code ? state.sliceDoc(code.from, code.to) : ''
        blocks.push(
          Decoration.replace({ widget: new DiagramWidget(source), block: true }).range(from, to),
        )
      }
      return false
    },
  })
  const hidden = (d: Range<Decoration>) =>
    d.value.spec.widget && folded.some(([from, to]) => d.from >= from && d.to <= to)
  return Decoration.set(
    blocks.filter((d) => !hidden(d)),
    true,
  )
}

const diagrams = StateField.define<DecorationSet>({
  create: diagramBlocks,
  update: (blocks, tr) =>
    tr.docChanged ||
    tr.selection ||
    tr.effects.some((e) => e.is(foldDetails)) ||
    syntaxTree(tr.startState) !== syntaxTree(tr.state)
      ? diagramBlocks(tr.state)
      : blocks,
  provide: (field) => EditorView.decorations.from(field),
})

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

/** The live preview's decorations, and the drawn pieces the cursor steps over whole. */
interface Built {
  decorations: DecorationSet
  atomic: RangeSet<Decoration>
  /** Embeds drawn in place of their lines. */
  embeds: { from: number; to: number }[]
}

function build(view: EditorView): Built {
  const { state } = view
  const active = activeLines(state)
  const isActive = (pos: number) => active.has(state.doc.lineAt(pos).number)
  /** The cursor or a selection touches `from`…`to`: that piece shows its Markdown. */
  const touched = (from: number, to: number) =>
    state.selection.ranges.some((r) => r.from <= to && r.to >= from)
  const decorations: Range<Decoration>[] = []
  const atomic: Range<Decoration>[] = []
  /** Where alerts' `[!NOTE]` markers start: they aren't links. */
  const markers = new Set<number>()

  // Line 1 is the title, the leaf's heading; line 2's metadata is hidden by metaLine.
  // A branch's text hides its heading instead (emptyText.ts): nothing of it is drawn.
  const titled = state.facet(titleShown)
  if (titled) decorations.push(title.range(0))

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name
        const heading = /^ATXHeading(\d)$/.exec(name)
        if (heading) {
          if (!titled && node.from === 0) return false
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
            } else if (after > node.to && !touched(node.from, after - 1)) {
              // Shown while the cursor is in the marks, or before the space that makes it one.
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
            const parent = node.node.parent
            if (
              parent?.name !== 'FencedCode' &&
              !touched(parent?.from ?? node.from, parent?.to ?? node.to)
            )
              decorations.push(hide.range(node.from, node.to))
            if (parent?.name === 'FencedCode')
              decorations.push(mark('cm-fence').range(node.from, node.to))
            return
          }
          case 'Link': {
            if (markers.has(node.from)) return false
            // A footnote's mark, `[^1]`, raised like GitHub's (its definition's too).
            if (/^\[\^[^\]\s]+\]$/.test(state.sliceDoc(node.from, node.to))) {
              decorations.push(mark('cm-footnote').range(node.from, node.to))
              if (!touched(node.from, node.to))
                decorations.push(
                  hide.range(node.from, node.from + 2),
                  hide.range(node.to - 1, node.to),
                )
              return false
            }
            const url = node.node.getChild('URL')
            const dest = url ? state.sliceDoc(url.from, url.to) : ''
            const target = linkTarget(dest)
            const active = touched(node.from, node.to)
            const shown = sourceShown(state, node.from, node.to)
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
            // The marks stay hidden while the link is written in, unless asked for (elements.ts).
            if (!shown && url) {
              const marks = node.node.getChildren('LinkMark')
              const textEnd = marks[1]?.from ?? url.from
              for (const [from, to] of [
                [node.from, marks[0]?.to ?? node.from + 1],
                [textEnd, node.to],
              ] as const) {
                decorations.push(hide.range(from, to))
                atomic.push(hide.range(from, to))
              }
            }
            return false
          }
          case 'Image': {
            if (sourceShown(state, node.from, node.to)) return false
            const url = node.node.getChild('URL')
            const text = state.sliceDoc(node.from, node.to)
            const alt = /^!\[([^\]]*)\]/.exec(text)?.[1] ?? ''
            const title = node.node.getChild('LinkTitle')
            const { width } = imageWidth(title ? state.sliceDoc(title.from + 1, title.to - 1) : '')
            if (url) {
              const image = Decoration.replace({
                widget: new ImageWidget(
                  state.sliceDoc(url.from, url.to),
                  alt,
                  width,
                  state.facet(assetSource),
                ),
              }).range(node.from, node.to)
              decorations.push(image)
              atomic.push(image)
            }
            return false
          }
          case 'Blockquote': {
            // An alert: its first line is only `[!NOTE]` (or TIP, IMPORTANT, WARNING, CAUTION).
            const end = state.doc.lineAt(node.from).to
            const from =
              node.from + (/^>[ \t]?/.exec(state.sliceDoc(node.from, end))?.[0].length ?? 0)
            const kind = calloutOf(state.sliceDoc(from, end))
            const cls = kind ? `cm-quote cm-callout cm-callout-${kind}` : 'cm-quote'
            for (let pos = node.from; pos <= node.to;) {
              const l = state.doc.lineAt(pos)
              decorations.push(line(cls).range(l.from))
              pos = l.to + 1
            }
            if (kind) {
              markers.add(from + state.sliceDoc(from, end).indexOf('['))
              if (!isActive(from))
                decorations.push(
                  Decoration.replace({ widget: new CalloutWidget(kind) }).range(from, end),
                )
            }
            return
          }
          case 'QuoteMark':
            if (!touched(node.from, node.to)) decorations.push(hide.range(node.from, node.to))
            return
          case 'ListMark': {
            // A bullet is drawn as one (`-`, `*`, `+` all alike); a task's goes with its box.
            const bullet = /^[-*+]$/.test(state.sliceDoc(node.from, node.to))
            const task = node.node.parent?.getChild('Task')
            if (bullet && !task && !touched(node.from, node.to))
              decorations.push(
                Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to),
              )
            else decorations.push(mark('cm-list-mark').range(node.from, node.to))
            return
          }
          case 'TaskMarker': {
            const checked = /x/i.test(state.sliceDoc(node.from, node.to))
            const bullet = node.node.parent?.parent?.getChild('ListMark')
            if (!touched(bullet?.from ?? node.from, node.to)) {
              // The checkbox replaces the bullet too.
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
  const replaced = richRanges(view, touched)
  const inside = (d: Range<Decoration>) =>
    d.from !== d.to && replaced.some((r) => d.from < r.to && d.to > r.from)
  const embeds = replaced.filter((r) => r.value.spec.widget instanceof EmbedWidget)
  const sorted = (list: Range<Decoration>[]) => {
    const builder = new RangeSetBuilder<Decoration>()
    list
      .sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide)
      .forEach((d) => builder.add(d.from, d.to, d.value))
    return builder.finish()
  }
  return {
    decorations: sorted([...decorations.filter((d) => !inside(d)), ...replaced]),
    atomic: sorted([...atomic.filter((d) => !inside(d)), ...embeds]),
    embeds: embeds.map(({ from, to }) => ({ from, to })),
  }
}

/**
 * Embed lines (unless being typed, or shown as Markdown on request), and math the cursor
 * doesn't touch, outside code.
 */
function richRanges(
  view: EditorView,
  touched: (from: number, to: number) => boolean,
): Range<Decoration>[] {
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
      if (l.number === 1 || !l.text.trim() || inCode(l.from)) continue
      const alone =
        state.doc.line(l.number - 1).text.trim() === '' &&
        (l.number === state.doc.lines || state.doc.line(l.number + 1).text.trim() === '')
      const embed =
        alone && !beingTyped(state, l.from, l.to) && !sourceShown(state, l.from, l.to)
          ? embedOf(l.text)
          : null
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
        if (touched(l.from + m.from, l.from + m.to)) continue
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

/**
 * Toggles a task when its checkbox is clicked: `[ ]` ↔ `[x]` in the text. A click on drawn
 * math puts the cursor at its start, which shows its source to edit.
 */
const toggleTasks = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target as HTMLElement
    const math = target.closest('.cm-math')
    if (math) {
      view.dispatch({ selection: { anchor: view.posAtDOM(math) } })
      view.focus()
      event.preventDefault()
      return true
    }
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

const preview = ViewPlugin.fromClass(
  class {
    built: Built
    constructor(view: EditorView) {
      this.built = build(view)
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        syntaxTree(update.startState) !== syntaxTree(update.state) ||
        update.startState.field(shownSource, false) !== update.state.field(shownSource, false)
      ) {
        this.built = build(update.view)
      }
    }
  },
  {
    decorations: (v) => v.built.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.built.atomic ?? RangeSet.empty),
  },
)

/** Typing right before or after a drawn embed goes on a line of its own, not into its link. */
const typeBesideEmbeds = EditorView.inputHandler.of((view, from, to, text) => {
  const embed =
    from === to
      ? view.plugin(preview)?.built.embeds.find((e) => e.from === from || e.to === from)
      : undefined
  if (!embed) return false
  const after = embed.to === from
  view.dispatch({
    changes: { from, insert: after ? `\n${text}` : `${text}\n` },
    selection: { anchor: from + text.length + (after ? 1 : 0) },
  })
  return true
})

export const livePreview = [
  elements,
  preview,
  flippedDetails,
  diagrams,
  tableEditing,
  typeBesideEmbeds,
  toggleTasks,
  metaLine,
]
