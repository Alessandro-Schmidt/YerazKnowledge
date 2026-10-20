// Writing on a touch screen keeps the line being written at eye level (owner's request): the
// keyboard covers the lower half, so each new line would otherwise push the caret down to its
// edge, and lists would jump. Here the text moves under the caret instead, as a typewriter's
// paper does: typing scrolls the panel so the caret stays this far down the part of the screen
// the keyboard leaves. Stable and predictable; nothing happens on a mouse.

import { ViewPlugin, type ViewUpdate } from '@codemirror/view'

/** Where the caret sits while writing, as a share of the visible height. */
const EYE_LEVEL = 0.38

const touch = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

/** The nearest ancestor that scrolls: the Peek's panel. */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p)
    if (overflowY === 'auto' || overflowY === 'scroll') return p
  }
  return null
}

export const steadyCaret = ViewPlugin.define((view) => ({
  update(u: ViewUpdate) {
    if (!u.docChanged || !touch()) return
    if (!u.transactions.some((tr) => tr.isUserEvent('input') || tr.isUserEvent('delete'))) return
    // Measured after the change is drawn; the editor's own scrolling, which runs after this,
    // then finds the caret in view and leaves it.
    view.requestMeasure({
      read: () => {
        const scroller = scrollerOf(view.dom)
        const caret = view.coordsAtPos(view.state.selection.main.head)
        if (!scroller || !caret) return null
        const box = scroller.getBoundingClientRect()
        const vv = window.visualViewport
        const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight
        const visible = Math.min(box.bottom, bottom) - box.top
        return { scroller, by: caret.top - (box.top + visible * EYE_LEVEL) }
      },
      write: (m) => {
        if (m && Math.abs(m.by) > 1) m.scroller.scrollTop += m.by
      },
    })
  },
}))
