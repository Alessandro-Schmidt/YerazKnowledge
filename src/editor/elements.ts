// What the live preview draws in place of Markdown (images, tables, links, embeds) never
// shows that Markdown unless the person asks: each has a ⋯ menu to change it, delete it, or
// show its Markdown, which then stays shown until the cursor leaves it. A link's ⋯ appears
// over it on hover, while the cursor is in it, or on a long press on touch screens.

import { syntaxTree } from '@codemirror/language'
import {
  Prec,
  StateEffect,
  StateField,
  type ChangeSpec,
  type EditorState,
  type TransactionSpec,
} from '@codemirror/state'
import {
  EditorView,
  hoverTooltip,
  keymap,
  showTooltip,
  ViewPlugin,
  type Tooltip,
} from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import { linkTarget } from '../model/parse'
import { encodePath } from '../ui/paths'
import { menu } from './menu'
import { mentionSource } from './mentions'

interface Span {
  from: number
  to: number
}

/** Shows an element's Markdown, to edit by hand, until the cursor leaves it. */
export const showSource = StateEffect.define<Span>({
  map: (s, m) => ({ from: m.mapPos(s.from, -1), to: m.mapPos(s.to, 1) }),
})

const touches = (state: EditorState, r: Span) =>
  state.selection.ranges.some((s) => s.from <= r.to && s.to >= r.from)

/** The elements whose Markdown the person asked to see. */
export const shownSource = StateField.define<readonly Span[]>({
  create: () => [],
  update(value, tr) {
    const added = tr.effects.filter((e) => e.is(showSource)).map((e) => e.value as Span)
    if (!value.length && !added.length) return value
    const mapped = tr.docChanged
      ? value.map((r) => ({ from: tr.changes.mapPos(r.from, -1), to: tr.changes.mapPos(r.to, 1) }))
      : value
    const next = [...mapped, ...added].filter((r) => touches(tr.state, r))
    return !added.length && !tr.docChanged && next.length === value.length ? value : next
  },
})

/** Whether the person asked to see the Markdown of what is between `from` and `to`. */
export const sourceShown = (state: EditorState, from: number, to: number) =>
  (state.field(shownSource, false) ?? []).some((r) => r.from <= to && r.to >= from)

/**
 * The line being typed (its start): an embed or a table on it stays text until the cursor
 * leaves it, so a link isn't turned into a card halfway through its address.
 */
export const typingLine = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    const line = tr.state.doc.lineAt(tr.state.selection.main.head)
    if (tr.isUserEvent('input') || tr.isUserEvent('delete')) return line.from
    // A change made for the person (a pasted link made a bookmark) is done: it is drawn.
    if (value === null || tr.docChanged) return null
    return tr.state.doc.lineAt(value).from === line.from ? line.from : null
  },
})

/** Whether a line from `from` to `to` is being typed. */
export const beingTyped = (state: EditorState, from: number, to: number) => {
  const line = state.field(typingLine, false)
  return line != null && line >= state.doc.lineAt(from).from && line <= to
}

/** Shows `from`…`to` as Markdown, with the cursor at `at`, and focuses the text. */
export function revealSource(view: EditorView, from: number, to: number, at = from) {
  view.dispatch({ effects: showSource.of({ from, to }), selection: { anchor: at } })
  view.focus()
}

/**
 * Deletes `from`…`to`. When nothing else is on its lines, the lines go too (and a blank
 * line beside them), so no empty paragraph is left where an image, embed or table was.
 */
export function deletion(state: EditorState, from: number, to: number): ChangeSpec {
  const first = state.doc.lineAt(from)
  const last = state.doc.lineAt(to)
  if ((state.sliceDoc(first.from, from) + state.sliceDoc(to, last.to)).trim()) return { from, to }
  if (last.to >= state.doc.length) return { from: Math.max(0, first.from - 1), to: last.to }
  // Between two blank lines, one of them goes too, so the paragraphs keep one between them.
  const blank = (n: number) => n < 1 || n > state.doc.lines || !state.doc.line(n).text.trim()
  const after = state.doc.line(last.number + 1)
  return blank(first.number - 1) && blank(after.number)
    ? { from: first.from, to: Math.min(after.to + 1, state.doc.length) }
    : { from: first.from, to: last.to + 1 }
}

export interface Action<K extends string = string> {
  kind: K
  label: string
}

interface OpenMenu {
  pos: number
  name: string
  items: readonly Action[]
  choose(kind: string): void
  /** The ⋯ button: the menu opens below it. */
  anchor: HTMLElement | null
}

const openMenu = StateEffect.define<OpenMenu | null>()

const menuField = StateField.define<OpenMenu | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(openMenu)) return e.value
    return value && tr.docChanged ? null : value
  },
  provide: (field) =>
    showTooltip.from(field, (open): Tooltip | null => {
      if (!open) return null
      const anchor = open.anchor
      return {
        pos: open.pos,
        above: false,
        create: (view) => {
          const close = () => {
            if (view.state.field(menuField, false)) view.dispatch({ effects: openMenu.of(null) })
          }
          const shown = menu(
            view,
            open.name,
            open.items,
            (kind) => {
              close()
              open.choose(kind)
            },
            close,
          )
          // Below the ⋯ that opened it, while that is on screen.
          if (!anchor) return shown
          return {
            ...shown,
            getCoords: (pos: number) =>
              anchor.isConnected
                ? anchor.getBoundingClientRect()
                : (view.coordsAtPos(pos) ?? anchor.getBoundingClientRect()),
          }
        },
      }
    }),
})

/** Opens an element's ⋯ menu at `pos` (below `anchor`, when given). */
export function openElementMenu<K extends string>(
  view: EditorView,
  pos: number,
  name: string,
  items: readonly Action<K>[],
  choose: (kind: K) => void,
  anchor: HTMLElement | null = null,
) {
  view.dispatch({
    effects: openMenu.of({ pos, name, items, choose: choose as (k: string) => void, anchor }),
  })
}

/** The ⋯ button of a drawn element. `open` is called with the button when it is pressed. */
export function moreButton(name: string, open: (button: HTMLElement) => void): HTMLElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'cm-more'
  button.textContent = '⋯'
  button.title = 'More'
  button.setAttribute('aria-label', `${name} actions`)
  button.setAttribute('aria-haspopup', 'menu')
  // The text (or a table's cell) keeps its focus until the menu takes it.
  button.addEventListener('mousedown', (e) => e.preventDefault())
  button.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    open(button)
  })
  return button
}

/** The plain link (not an image, a footnote mark or an alert's marker) at `pos`, if any. */
export function linkAt(state: EditorState, pos: number, side: -1 | 0 | 1 = 0): SyntaxNode | null {
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, side); n; n = n.parent) {
    if (n.name === 'Image') return null
    if (n.name !== 'Link') continue
    const text = state.sliceDoc(n.from, n.to)
    if (/^\[\^[^\]\s]+\]$/.test(text) || /^\[!\w+\]$/.test(text)) return null
    return n.getChild('URL') ? n : null
  }
  return null
}

/** A link's parts: its text's span and its address. */
export function linkParts(state: EditorState, link: SyntaxNode) {
  const marks = link.getChildren('LinkMark')
  const textFrom = marks[0]?.to ?? link.from + 1
  const textTo = marks[1]?.from ?? textFrom
  const url = link.getChild('URL')
  const title = link.getChild('LinkTitle')
  return {
    textFrom,
    textTo,
    text: state.sliceDoc(textFrom, textTo),
    url: url ? state.sliceDoc(url.from, url.to).replace(/^<|>$/g, '') : '',
    title: title ? state.sliceDoc(title.from, title.to) : '',
  }
}

/** Opens a link's target: a leaf or another Tree in the app, or the web in a new tab. */
function openLink(view: EditorView, url: string) {
  const source = view.state.facet(mentionSource)
  const target = linkTarget(url)
  if (target && target.repo === null) {
    const leaf = source?.leaf(target.path)
    if (leaf) return source!.open(leaf.path)
  }
  if (target?.repo) {
    const other = source?.tree?.(target.repo)
    if (other) return location.assign(`${other.href}/${encodePath(target.path)}`)
  }
  if (/^https?:\/\//.test(url)) window.open(url, '_blank', 'noopener,noreferrer')
}

type LinkAction = 'open' | 'edit' | 'unlink' | 'markdown' | 'delete'

const LINK_ITEMS: readonly Action<LinkAction>[] = [
  { kind: 'open', label: 'Open link' },
  { kind: 'edit', label: 'Edit link' },
  { kind: 'unlink', label: 'Remove link' },
  { kind: 'markdown', label: 'Show Markdown' },
  { kind: 'delete', label: 'Delete' },
]

/** The link that starts at `from` now, or null when it has gone. */
const linkFrom = (state: EditorState, from: number) => {
  const link = linkAt(state, from, 1)
  return link?.from === from ? link : null
}

function linkAction(view: EditorView, from: number, kind: LinkAction) {
  const { state } = view
  const link = linkFrom(state, from)
  if (!link) return
  const parts = linkParts(state, link)
  if (kind === 'open') openLink(view, parts.url)
  else if (kind === 'edit') view.dispatch({ effects: editLink.of(from) })
  else if (kind === 'unlink')
    view.dispatch({
      changes: { from: link.from, to: link.to, insert: parts.text },
      selection: { anchor: link.from + parts.text.length },
    })
  else if (kind === 'markdown') revealSource(view, link.from, link.to, parts.textTo)
  else view.dispatch({ changes: deletion(state, link.from, link.to) })
  if (kind !== 'open' && kind !== 'edit') view.focus()
}

/** The link whose text and address are being edited, by where it starts. */
const editLink = StateEffect.define<number | null>()

const editField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(editLink)) return e.value
    return value === null || !tr.docChanged ? value : tr.changes.mapPos(value, 1)
  },
  provide: (field) =>
    showTooltip.from(field, (from): Tooltip | null =>
      from === null ? null : { pos: from, above: true, create: (view) => linkForm(view, from) },
    ),
})

/** Text and address of a link, in two fields; Enter saves, Escape leaves it as it was. */
function linkForm(view: EditorView, from: number) {
  const link = linkFrom(view.state, from)
  const parts = link ? linkParts(view.state, link) : { text: '', url: '', title: '' }
  const form = document.createElement('form')
  form.className = 'cm-link-form'
  form.setAttribute('aria-label', 'Edit link')
  const field = (label: string, name: string, value: string) => {
    const wrap = document.createElement('label')
    const input = document.createElement('input')
    wrap.textContent = label
    input.name = name
    input.autocomplete = 'off'
    input.value = value
    input.spellcheck = false
    wrap.append(input)
    form.append(wrap)
    return input
  }
  const text = field('Text', 'text', parts.text)
  const url = field('Address', 'href', parts.url)
  url.inputMode = 'url'
  const buttons = document.createElement('div')
  const save = document.createElement('button')
  const cancel = document.createElement('button')
  save.type = 'submit'
  save.textContent = 'Save'
  cancel.type = 'button'
  cancel.textContent = 'Cancel'
  buttons.append(cancel, save)
  form.append(buttons)
  const close = () => {
    if (view.state.field(editField, false) !== null) view.dispatch({ effects: editLink.of(null) })
    view.focus()
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const now = linkFrom(view.state, from)
    const address = url.value.trim()
    if (now && address) {
      const label = text.value.replace(/[\r\n]+/g, ' ') || address
      const dest = /[\s()<>]/.test(address) ? `<${address}>` : address
      const insert = `[${label.replace(/([[\]\\])/g, '\\$1')}](${dest}${parts.title ? ` ${parts.title}` : ''})`
      view.dispatch({
        changes: { from: now.from, to: now.to, insert },
        selection: { anchor: now.from + insert.length },
        effects: editLink.of(null),
      })
    }
    close()
  })
  cancel.addEventListener('click', close)
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    close()
  })
  return { dom: form, mount: () => text.focus() }
}

/** A link's menu opens below its start: its ⋯ is in a tooltip that may close meanwhile. */
const linkMenu = (view: EditorView, from: number) =>
  openElementMenu(view, from, 'Link', LINK_ITEMS, (kind) => linkAction(view, from, kind))

/** A ⋯ over a link: its menu. */
const linkButton = (view: EditorView, from: number) => ({
  dom: moreButton('Link', () => linkMenu(view, from)),
})

const linkHover = hoverTooltip(
  (view, pos, side) => {
    if (view.state.field(menuField, false) || view.state.field(editField, false) !== null)
      return null
    const link = linkAt(view.state, pos, side)
    if (!link || sourceShown(view.state, link.from, link.to)) return null
    return {
      pos: link.from,
      end: link.to,
      above: true,
      create: (v) => linkButton(v, link.from),
    }
  },
  { hoverTime: 250 },
)

/** While the cursor is in a link (not in a menu or form), its ⋯ shows above it. */
const cursorLink = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    const { main } = tr.state.selection
    if (!main.empty) return null
    const link = linkAt(tr.state, main.head)
    const from =
      link &&
      main.head > link.from &&
      main.head < link.to &&
      !sourceShown(tr.state, link.from, link.to)
        ? link.from
        : null
    return from === value ? value : from
  },
  provide: (field) =>
    showTooltip.computeN([field, menuField, editField], (state) => {
      const from = state.field(field)
      if (from === null || state.field(menuField) || state.field(editField) !== null) return []
      return [{ pos: from, above: true, create: (view) => linkButton(view, from) }]
    }),
})

/**
 * Backspace and Delete next to a link's hidden marks take a character of its text (or the
 * character beside it), never a mark: a link can't be broken into half-shown Markdown.
 */
function deleteBeside(view: EditorView, forward: boolean): boolean {
  const { state } = view
  const { main } = state.selection
  if (!main.empty) return false
  const pos = main.head
  const link = linkAt(state, pos, forward ? 1 : -1) ?? linkAt(state, pos)
  if (!link || sourceShown(state, link.from, link.to)) return false
  const { textFrom, textTo } = linkParts(state, link)
  const atStart = pos === link.from || pos === textFrom
  const atEnd = pos === textTo || pos === link.to
  let change: TransactionSpec | null = null
  if (forward ? atEnd : atStart) {
    // Past the link's edge: the character on the other side of it.
    const at = forward ? link.to : link.from
    if (forward ? at >= state.doc.length : at <= 0) return true
    change = { changes: { from: forward ? at : at - 1, to: forward ? at + 1 : at } }
  } else if (forward ? atStart : atEnd) {
    if (textTo === textFrom) {
      change = { changes: { from: link.from, to: link.to } }
    } else {
      const from = forward ? textFrom : textTo - 1
      change = {
        changes: { from, to: from + 1 },
        selection: { anchor: forward ? link.from : textTo - 1 },
      }
    }
  }
  if (!change) return false
  view.dispatch(change)
  return true
}

/** On touch screens a long press on a link opens its menu (instead of the insert menu). */
const LONG_PRESS_MS = 500

const longPress = ViewPlugin.define((view) => {
  let timer: ReturnType<typeof setTimeout> | null = null
  const cancel = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const start = (event: TouchEvent) => {
    cancel()
    const target = event.target as HTMLElement
    const chip = target.closest?.('.cm-link, .cm-mention')
    const touch = event.touches[0]
    if (!chip || !touch) return
    const pos = view.posAtCoords({ x: touch.clientX, y: touch.clientY })
    const link = pos === null ? null : linkAt(view.state, pos)
    if (!link) return
    timer = setTimeout(() => linkMenu(view, link.from), LONG_PRESS_MS)
  }
  const block = (event: Event) => {
    if ((event.target as HTMLElement).closest?.('.cm-link, .cm-mention')) event.preventDefault()
  }
  view.contentDOM.addEventListener('touchstart', start, { passive: true })
  view.contentDOM.addEventListener('touchmove', cancel)
  view.contentDOM.addEventListener('touchend', cancel)
  view.contentDOM.addEventListener('touchcancel', cancel)
  view.contentDOM.addEventListener('contextmenu', block)
  return {
    destroy() {
      cancel()
      view.contentDOM.removeEventListener('touchstart', start)
      view.contentDOM.removeEventListener('touchmove', cancel)
      view.contentDOM.removeEventListener('touchend', cancel)
      view.contentDOM.removeEventListener('touchcancel', cancel)
      view.contentDOM.removeEventListener('contextmenu', block)
    },
  }
})

export const elements = [
  shownSource,
  typingLine,
  menuField,
  editField,
  cursorLink,
  linkHover,
  longPress,
  Prec.high(
    keymap.of([
      { key: 'Backspace', run: (v) => deleteBeside(v, false) },
      { key: 'Delete', run: (v) => deleteBeside(v, true) },
    ]),
  ),
]
