// The insert menu (ARCHITECTURE.md §7): hold Ctrl/Cmd for one second while writing. The
// timer starts when the modifier is pressed on its own; any other key, or releasing it,
// cancels, so shortcuts like Ctrl+C never open the menu. Touch screens have no Ctrl key:
// typing / (after a space or at the start of a line) or a long press opens the same menu.

import { startCompletion } from '@codemirror/autocomplete'
import {
  Facet,
  StateEffect,
  StateField,
  type EditorState,
  type TransactionSpec,
} from '@codemirror/state'
import { EditorView, showTooltip, ViewPlugin, type Tooltip } from '@codemirror/view'
import { menu } from './menu'
import { insertTable } from './tables'
import { META } from '../model/parse'
import { setupStore, shown, type InsertKind, type ListKind } from './menuSetup'

export type { InsertKind, ListKind } from './menuSetup'

export const HOLD_MS = 1000
const LONG_PRESS_MS = 600

/** Ctrl/Cmd pressed alone and held: `fire` after HOLD_MS, unless anything else happens. */
export function createHold(fire: () => void) {
  let timer: ReturnType<typeof setTimeout> | null = null
  const cancel = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  return {
    down(e: { key: string; repeat: boolean }) {
      if (e.key === 'Control' || e.key === 'Meta') {
        if (e.repeat && timer !== null) return
        cancel()
        timer = setTimeout(() => {
          timer = null
          fire()
        }, HOLD_MS)
      } else cancel()
    },
    up: cancel,
  }
}

const MARKER = /^(\s*)(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)?/

/** Makes the cursor's line a list item of `kind`, replacing any marker it had. */
export function listChange(state: EditorState, kind: ListKind): TransactionSpec {
  const prefix = kind === 'todo' ? '- [ ] ' : kind === 'ordered' ? '1. ' : '- '
  const line = state.doc.lineAt(state.selection.main.head)
  // Line 1 is the title: the list starts on a new line below it.
  if (line.number === 1) {
    return {
      changes: { from: line.to, insert: `\n${prefix}` },
      selection: { anchor: line.to + 1 + prefix.length },
    }
  }
  const [marker, indent] = MARKER.exec(line.text)!
  const from = line.from + indent!.length
  const to = line.from + marker.length
  const head = state.selection.main.head
  return {
    changes: { from, to, insert: prefix },
    selection: { anchor: Math.max(from + prefix.length, head + prefix.length - (to - from)) },
  }
}

/** A code block on the cursor's empty line, or below its line (and below the title's metadata). */
export function codeChange(state: EditorState): TransactionSpec {
  let line = state.doc.lineAt(state.selection.main.head)
  if (line.number === 1 && state.doc.lines > 1 && META.test(state.doc.line(2).text))
    line = state.doc.line(2)
  const empty = line.number > 2 && !line.text.trim()
  const from = empty ? line.from : line.to
  const open = empty ? '```\n' : '\n```\n'
  return {
    changes: { from, to: line.to, insert: `${open}\n${'```'}` },
    selection: { anchor: from + open.length },
    scrollIntoView: true,
  }
}

/**
 * A block of the person's own Markdown (Settings › Insert menu): in place of the cursor's empty
 * line, or on the lines below its line (and below the title's metadata); the cursor after it.
 */
export function blockChange(state: EditorState, text: string): TransactionSpec {
  let line = state.doc.lineAt(state.selection.main.head)
  if (line.number === 1 && state.doc.lines > 1 && META.test(state.doc.line(2).text))
    line = state.doc.line(2)
  const empty = line.number > 2 && !line.text.trim()
  const insert = empty ? text : `\n${text}`
  const from = empty ? line.from : line.to
  return {
    changes: { from, to: line.to, insert },
    selection: { anchor: from + insert.length },
    scrollIntoView: true,
  }
}

/** Where the menu is open, and the trigger text (a typed /) to remove when an item is picked. */
interface Open {
  pos: number
  from: number
}

const openMenu = StateEffect.define<Open>()
const closeMenu = StateEffect.define<null>()

const menuState = StateField.define<Open | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(openMenu)) return e.value
      if (e.is(closeMenu)) return null
    }
    if (!value || !tr.docChanged) return value
    return { pos: tr.changes.mapPos(value.pos), from: tr.changes.mapPos(value.from, -1) }
  },
  provide: (field) =>
    showTooltip.from(field, (open): Tooltip | null =>
      open ? { pos: open.pos, above: false, create: (view) => menuDom(view, open) } : null,
    ),
})

/** What the host does for items the editor can't do alone: files, new leaves and branches. */
export type InsertHost = (kind: 'image' | 'file' | 'leaf' | 'branch', view: EditorView) => void

const insertHost = Facet.define<InsertHost, InsertHost>({
  combine: (values) => values[0] ?? (() => undefined),
})

/** Asks the page for what the editor can't do alone, such as picking an image. */
export const askHost = (view: EditorView, kind: Parameters<InsertHost>[0]) =>
  view.state.facet(insertHost)(kind, view)

function pick(view: EditorView, open: Open, kind: InsertKind, text?: string) {
  view.dispatch({ effects: closeMenu.of(null), changes: { from: open.from, to: open.pos } })
  view.focus()
  if (text !== undefined) view.dispatch(blockChange(view.state, text))
  else if (kind === 'todo' || kind === 'ordered' || kind === 'bullet') {
    view.dispatch(listChange(view.state, kind))
  } else if (kind === 'mention') {
    const at = view.state.selection.main.head
    const before = at > 0 ? view.state.sliceDoc(at - 1, at) : '\n'
    const insert = /\s/.test(before) ? '@' : ' @'
    view.dispatch({ changes: { from: at, insert }, selection: { anchor: at + insert.length } })
    startCompletion(view)
  } else if (kind === 'table') insertTable(view)
  else if (kind === 'code') view.dispatch(codeChange(view.state))
  else askHost(view, kind)
}

function menuDom(view: EditorView, open: Open) {
  const dismiss = () => {
    if (view.state.field(menuState, false)) view.dispatch({ effects: closeMenu.of(null) })
  }
  // Read as it opens: a change in Settings shows the next time, with no editor to reload.
  const items = shown(setupStore.get()).map((e) => ({ ...e, kind: e.key }))
  const choose = (key: string) => {
    const item = items.find((i) => i.key === key)
    if (item) pick(view, open, item.key as InsertKind, item.text)
  }
  return menu(view, 'Insert', items, choose, dismiss)
}

const openAt = (view: EditorView, from = view.state.selection.main.head) =>
  view.dispatch({ effects: openMenu.of({ pos: view.state.selection.main.head, from }) })

const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

const triggers = ViewPlugin.define((view) => {
  const hold = createHold(() => openAt(view))
  let press: ReturnType<typeof setTimeout> | null = null
  const cancelPress = () => {
    if (press !== null) clearTimeout(press)
    press = null
  }
  const listeners: [EventTarget, string, EventListener][] = [
    [view.contentDOM, 'keydown', (e) => hold.down(e as KeyboardEvent)],
    [view.contentDOM, 'keyup', () => hold.up()],
    [view.contentDOM, 'blur', () => hold.up()],
    [
      view.contentDOM,
      'touchstart',
      (e) => {
        cancelPress()
        // A long press on a link opens the link's own menu (elements.ts).
        if ((e.target as Element).closest?.('.cm-link, .cm-mention')) return
        press = setTimeout(() => openAt(view), LONG_PRESS_MS)
      },
    ],
    [view.contentDOM, 'touchmove', cancelPress],
    [view.contentDOM, 'touchend', cancelPress],
    [view.contentDOM, 'touchcancel', cancelPress],
  ]
  for (const [target, type, fn] of listeners) target.addEventListener(type, fn)
  return {
    destroy() {
      hold.up()
      cancelPress()
      for (const [target, type, fn] of listeners) target.removeEventListener(type, fn)
    },
  }
})

/** On touch screens, a / typed at the start of a word opens the menu; picking removes it. */
const slash = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== '/' || !coarse()) return false
  const before = from > 0 ? view.state.sliceDoc(from - 1, from) : '\n'
  if (!/\s/.test(before)) return false
  view.dispatch({ changes: { from, to, insert: '/' }, selection: { anchor: from + 1 } })
  openAt(view, from)
  return true
})

export const insertMenu = (host: InsertHost) => [insertHost.of(host), menuState, triggers, slash]
