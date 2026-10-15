// PDF export (ARCHITECTURE.md §8): the browser's print dialog ("Save as PDF") on a copy of
// the leaf at the top of the page, so nothing around it prints and nothing clips it.
// print.css hides the app and swaps players for links; theme.ts switches to Paper.

import './print.css'

export function printLeaf(leaf: HTMLElement): void {
  const root = document.createElement('div')
  root.id = 'print-root'
  root.className = 'reading'
  root.append(leaf.cloneNode(true))
  document.body.append(root)
  const done = () => {
    root.remove()
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  window.print()
}
