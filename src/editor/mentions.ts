// @ mentions (ARCHITECTURE.md §7): typing @ offers the Tree's leaves; picking one inserts a
// thread, `[Title](/path.md)`, which live preview shows as a chip with the target's icon.
// Clicking a chip opens its leaf; clicking a link opens it (another Tree in the app, the web
// in a new tab).

import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { Facet } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { mentionLink } from '../model/links'

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
  /** Another connected Tree by `owner/name`: its title and in-app href (`#/tree/…`). */
  tree?(repo: string): { title: string; href: string } | null
}

export const mentionSource = Facet.define<MentionSource, MentionSource | null>({
  combine: (values) => values[0] ?? null,
})

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

/**
 * A click on a chip or a link (outside the line being edited, where they carry their
 * target) opens it: a leaf of this Tree, another Tree in the app, or the web in a new tab.
 */
const openChips = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0) return false
    const link = (event.target as HTMLElement).closest?.<HTMLElement>('[data-path], [data-href]')
    const source = view.state.facet(mentionSource)
    if (!link || !source || !view.contentDOM.contains(link)) return false
    event.preventDefault()
    const { path, href } = link.dataset
    if (path) source.open(path)
    else if (href?.startsWith('#')) location.assign(href)
    else if (href) window.open(href, '_blank', 'noopener,noreferrer')
    return true
  },
})

export const mentions = (source: MentionSource) => [
  mentionSource.of(source),
  autocompletion({ override: [completeMention], icons: false }),
  openChips,
]
