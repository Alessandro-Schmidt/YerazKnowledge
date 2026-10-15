// @ mentions (ARCHITECTURE.md §7): typing @ offers the Tree's leaves; picking one inserts a
// thread, `[Title](/path.md)`, which live preview shows as a chip with the target's icon.
// Clicking a chip opens its leaf.

import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { Facet } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { destination } from '../model/links'

export interface MentionLeaf {
  path: string
  title: string
  icon: string | null
}

/** The Tree as the editor sees it; read on use, so it follows the latest graph. */
export interface MentionSource {
  leaves(): MentionLeaf[]
  leaf(path: string): MentionLeaf | null
  open(path: string): void
}

export const mentionSource = Facet.define<MentionSource, MentionSource | null>({
  combine: (values) => values[0] ?? null,
})

/** `[Title](/path.md)`, the repository format's thread (ARCHITECTURE.md §4). */
export function mentionLink(title: string, path: string): string {
  return `[${title.replace(/[[\]\\]/g, '\\$&')}](${destination(path)})`
}

export function completeMention(context: CompletionContext): CompletionResult | null {
  const source = context.state.facet(mentionSource)
  const match = context.matchBefore(/@[^\s@[\]()]*/)
  if (!source || !match) return null
  const before = match.from > 0 ? context.state.sliceDoc(match.from - 1, match.from) : ''
  if (before && !/[\s([]/.test(before)) return null
  const options: Completion[] = source.leaves().map((leaf) => ({
    label: leaf.title,
    displayLabel: leaf.icon ? `${leaf.icon} ${leaf.title}` : leaf.title,
    detail: leaf.path.includes('/') ? leaf.path.replace(/\/[^/]*$/, '') : undefined,
    // Replaces the @ too, not just the query after it.
    apply: (view, _completion, from, to) => {
      const link = mentionLink(leaf.title, leaf.path)
      view.dispatch({
        changes: { from: from - 1, to, insert: link },
        selection: { anchor: from - 1 + link.length },
      })
    },
  }))
  return { from: match.from + 1, options, validFor: /^[^\s@[\]()]*$/ }
}

/** A click on a chip (outside the line being edited) opens the leaf it names. */
const openChips = EditorView.domEventHandlers({
  mousedown(event, view) {
    const chip = (event.target as HTMLElement).closest?.<HTMLElement>('.cm-mention[data-path]')
    const source = view.state.facet(mentionSource)
    if (!chip || !source) return false
    event.preventDefault()
    source.open(chip.dataset.path!)
    return true
  },
})

export const mentions = (source: MentionSource) => [
  mentionSource.of(source),
  autocompletion({ override: [completeMention], icons: false }),
  openChips,
]
