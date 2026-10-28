// The editor's menus (insert, paste, an element's ⋯): buttons in a tooltip.

import type { EditorView } from '@codemirror/view'

/**
 * A tooltip menu of buttons, styled as the insert menu: arrow keys move, Escape or Tab
 * dismisses and returns to the text. With `autofocus` false the text keeps the focus.
 */
export function menu<K extends string>(
  view: EditorView,
  name: string,
  items: readonly { kind: K; label: string; icon?: string }[],
  choose: (kind: K) => void,
  dismiss: () => void,
  autofocus = true,
) {
  const dom = document.createElement('div')
  dom.className = 'cm-insert-menu'
  dom.setAttribute('role', 'menu')
  dom.setAttribute('aria-label', name)
  const buttons = items.map(({ kind, label, icon }) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('role', 'menuitem')
    button.dataset.kind = kind
    button.textContent = label
    if (icon !== undefined) button.prepend(logo(icon))
    button.addEventListener('mousedown', (e) => e.preventDefault())
    button.addEventListener('click', () => choose(kind))
    dom.append(button)
    return button
  })
  dom.addEventListener('keydown', (e) => {
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const go = (i: number) => buttons[(i + buttons.length) % buttons.length]!.focus()
    if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(buttons.length - 1)
    else if (e.key === 'Escape' || e.key === 'Tab') {
      dismiss()
      view.focus()
    } else return
    e.preventDefault()
    e.stopPropagation()
  })
  dom.addEventListener('focusout', (e) => {
    if (!dom.contains(e.relatedTarget as Node | null)) dismiss()
  })
  return { dom, mount: autofocus ? () => buttons[0]!.focus() : undefined }
}

/** A 24×24 one-colour logo from its SVG path, in the text's colour; an empty path draws none. */
export function logo(path: string) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('cm-logo')
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  shape.setAttribute('d', path)
  svg.append(shape)
  return svg
}
