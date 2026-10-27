// Keyboard for a `role="menu"`: arrows move among its items, wrapping; Home and End go to
// the ends. `focusFirst` is for an effect when the menu opens.

import type { KeyboardEvent } from 'react'

const items = (menu: Element | null) =>
  [...(menu?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])].filter(
    (el) => !el.hasAttribute('disabled'),
  )

export const focusFirst = (menu: Element | null) => items(menu)[0]?.focus()

export function menuKeys(e: KeyboardEvent) {
  const all = items(e.currentTarget)
  const last = all.length - 1
  if (last < 0) return
  const i = all.indexOf(document.activeElement as HTMLElement)
  const to = { ArrowDown: i < last ? i + 1 : 0, ArrowUp: i > 0 ? i - 1 : last, Home: 0, End: last }[
    e.key
  ]
  if (to === undefined) return
  e.preventDefault()
  all[to]!.focus()
}
