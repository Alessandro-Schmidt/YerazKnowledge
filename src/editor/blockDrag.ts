// Blocks moved by dragging (owner's request): a handle beside the block under the pointer
// (a paragraph, heading, list item, code block, table, image…) drags it, whole, between
// two other blocks, or onto a leaf's chip, which adds it at the end of that leaf
// (mentions.ts). Selected text drags as before, CodeMirror's own.

import { syntaxTree } from '@codemirror/language'
import type { ChangeSpec, EditorState, TransactionSpec } from '@codemirror/state'
import { EditorView, ViewPlugin } from '@codemirror/view'
import { META } from '../model/parse'

export interface Block {
  from: number
  to: number
  /** A list item: it moves line by line among others, no blank line between. */
  item: boolean
}

const LISTS = new Set(['BulletList', 'OrderedList'])

/** The block `pos` is in, as whole lines; null between blocks, in the title or its metadata. */
export function blockAt(state: EditorState, pos: number): Block | null {
  const top = syntaxTree(state).topNode
  let node = top.firstChild
  while (node && !(node.from <= pos && pos <= node.to)) node = node.nextSibling
  if (!node) return null
  let item = false
  if (LISTS.has(node.name)) {
    let child = node.firstChild
    while (child && !(child.from <= pos && pos <= child.to)) child = child.nextSibling
    if (child?.name === 'ListItem') [node, item] = [child, true]
  }
  const first = state.doc.lineAt(node.from)
  if (first.number === 1 || (first.number === 2 && META.test(first.text))) return null
  return { from: first.from, to: state.doc.lineAt(node.to).to, item }
}

/** Removes a block's lines, and one blank line beside them so the rest keep one between. */
function removal(state: EditorState, block: Block): ChangeSpec {
  const { doc } = state
  const first = doc.lineAt(block.from)
  const last = doc.lineAt(block.to)
  const blank = (n: number) => n < 1 || n > doc.lines || !doc.line(n).text.trim()
  let from = first.from
  let to = Math.min(last.to + 1, doc.length)
  if (blank(first.number - 1) && blank(last.number + 1)) {
    if (last.number + 1 < doc.lines) to = doc.line(last.number + 1).to + 1
    else from = Math.max(0, first.from - 1)
  }
  return { from, to }
}

/**
 * Moves `block` before (or `after`) the block at `pos`, in one change; null when that is
 * the block itself or there is none.
 */
export function moveBlock(
  state: EditorState,
  block: Block,
  pos: number,
  after: boolean,
): TransactionSpec | null {
  const target = blockAt(state, pos)
  if (!target || (target.from <= block.to && target.to >= block.from)) return null
  const text = state.sliceDoc(block.from, block.to)
  const gap = block.item && target.item ? '\n' : '\n\n'
  const insert = after
    ? { from: target.to, insert: gap + text }
    : { from: target.from, insert: text + gap }
  return { changes: [removal(state, block), insert], userEvent: 'move.drop', scrollIntoView: true }
}

/** What a handle's drag carries, besides the block's text. */
const TYPE = 'application/x-yeraz-block'
/** The block being dragged from this editor, by its handle. */
let dragged: { view: EditorView; block: Block } | null = null

/** Whether the pointer is in the lower half of the block at `pos`: the drop goes after it. */
function below(view: EditorView, block: Block, y: number) {
  const top = view.coordsAtPos(block.from)?.top ?? y
  const bottom = view.coordsAtPos(block.to)?.bottom ?? y
  return y > (top + bottom) / 2
}

/** How far beside the text a dragged block may still be dropped: the handle's column, and as much on the right. */
const REACH = 40

const handles = ViewPlugin.fromClass(
  class {
    grip = document.createElement('div')
    line = document.createElement('div')
    block: Block | null = null

    constructor(readonly view: EditorView) {
      this.grip.className = 'cm-block-grip'
      this.grip.draggable = true
      this.grip.setAttribute('aria-hidden', 'true')
      this.grip.title = 'Drag to move this block'
      // Six dots, two columns: a handle to hold.
      this.grip.innerHTML =
        '<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">' +
        [3, 8, 13]
          .map((y) => `<circle cx="2" cy="${y}" r="1.4"/><circle cx="8" cy="${y}" r="1.4"/>`)
          .join('') +
        '</svg>'
      this.grip.hidden = true
      this.line.className = 'cm-block-drop'
      this.line.hidden = true
      view.dom.append(this.grip, this.line)
      this.grip.addEventListener('dragstart', (e) => {
        if (!this.block || !e.dataTransfer) return
        const text = view.state.sliceDoc(this.block.from, this.block.to)
        dragged = { view, block: this.block }
        // Selected, so a drop on a chip takes it out of this text (mentions.ts).
        view.dispatch({ selection: { anchor: this.block.from, head: this.block.to } })
        e.dataTransfer.setData('text/plain', text)
        e.dataTransfer.setData(TYPE, '')
        e.dataTransfer.effectAllowed = 'move'
        // The whole page listens while it is dragged: a drop beside the text counts too.
        document.addEventListener('dragover', this.dragover, true)
        document.addEventListener('drop', this.drop, true)
      })
      this.grip.addEventListener('dragend', () => this.end())
    }

    end() {
      dragged = null
      this.line.hidden = true
      document.removeEventListener('dragover', this.dragover, true)
      document.removeEventListener('drop', this.drop, true)
    }

    /** The text's column, as wide as a drop may land; null when `x`, `y` are outside it. */
    aim(e: DragEvent): { x: number; y: number } | null {
      // Over a chip: mentions.ts takes it.
      if ((e.target as HTMLElement).closest?.('.cm-mention[data-path]')) return null
      const content = this.view.contentDOM.getBoundingClientRect()
      const { clientX: x, clientY: y } = e
      if (y < content.top || y > content.bottom) return null
      if (x < content.left - REACH || x > content.right + REACH) return null
      return { x: Math.min(Math.max(x, content.left + 1), content.right - 1), y }
    }

    dragover = (e: DragEvent) => {
      const at = this.aim(e)
      if (!at) return void (this.line.hidden = true)
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
      this.over(at.x, at.y)
    }

    drop = (e: DragEvent) => {
      const at = this.aim(e)
      const block = dragged?.block
      if (!at || !block) return this.end()
      e.preventDefault()
      // CodeMirror's own drop would insert the text a second time.
      e.stopPropagation()
      const target = this.over(at.x, at.y)
      this.end()
      const spec = target && moveBlock(this.view.state, block, target.pos, target.after)
      if (spec) this.view.dispatch(spec)
    }

    /** Puts the handle beside the block under the pointer, in the margin before the text. */
    point(x: number, y: number) {
      const pos = this.view.posAtCoords({ x, y }, false)
      const block = blockAt(this.view.state, pos)
      this.block = block
      if (!block) return void (this.grip.hidden = true)
      const at = this.view.coordsAtPos(block.from)
      if (!at) return
      const frame = this.view.dom.getBoundingClientRect()
      const content = this.view.contentDOM.getBoundingClientRect()
      this.grip.hidden = false
      this.grip.style.top = `${at.top - frame.top}px`
      this.grip.style.left = `${content.left - frame.left - 21}px`
    }

    /** Shows where a dragged block would land. */
    over(x: number, y: number): { pos: number; after: boolean } | null {
      const pos = this.view.posAtCoords({ x, y }, false)
      const target = blockAt(this.view.state, pos)
      if (!target) {
        this.line.hidden = true
        return null
      }
      const after = below(this.view, target, y)
      const edge = this.view.coordsAtPos(after ? target.to : target.from)
      if (!edge) return null
      const frame = this.view.dom.getBoundingClientRect()
      const content = this.view.contentDOM.getBoundingClientRect()
      this.line.hidden = false
      this.line.style.top = `${(after ? edge.bottom : edge.top) - frame.top}px`
      this.line.style.left = `${content.left - frame.left}px`
      this.line.style.width = `${content.width}px`
      return { pos, after }
    }

    destroy() {
      this.end()
      this.grip.remove()
      this.line.remove()
    }
  },
  {
    eventHandlers: {
      mousemove(e) {
        if (!(e.target as HTMLElement).closest?.('.cm-block-grip')) this.point(e.clientX, e.clientY)
      },
    },
  },
)

/** Block handles, where there is a pointer to hover with. */
export const blockDrag =
  typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
    ? handles
    : []
