// @ mentions (ARCHITECTURE.md §7): typing @ offers the Tree's leaves; picking one inserts a
// thread, `[Title](/path.md)`, which live preview shows as a chip with the target's icon.
// A name no leaf has yet can be picked too (owner's request): the link then names the leaf
// beside this one, a ghost on the map until it is written. Clicking a chip opens its leaf;
// clicking a link opens it (another Tree in the app, the web in a new tab).

import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { Facet } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { mentionLink } from '../model/links'
import { deletion } from './elements'

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
  /** The file being written (a leaf, or a branch's README.md): a new leaf goes beside it. */
  here?(): string
  /** Adds `text` at the end of the leaf at `path`: dragged text dropped on its chip. */
  append?(path: string, text: string): Promise<void>
}

/** Where a leaf named `title`, mentioned from `file`, would be written: beside it. */
export function newLeafPath(title: string, file: string): string {
  const folder = file.slice(0, Math.max(0, file.lastIndexOf('/')))
  const name = title.replace(/[/\\]+/g, ' ').trim()
  return `${folder ? `${folder}/` : ''}${name}.md`
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
  // Replaces the @ too, not just the query after it.
  const insert =
    (title: string, path: string) =>
    (view: EditorView, _c: Completion, from: number, to: number) => {
      const link = mentionLink(title, path)
      view.dispatch({
        changes: { from: from - 1, to, insert: link },
        selection: { anchor: from - 1 + link.length },
      })
    }
  const options: Completion[] = source.leaves().map((leaf) => ({
    label: leaf.title,
    displayLabel: leaf.icon ? `${leaf.icon} ${leaf.title}` : leaf.title,
    detail: leaf.path.includes('/') ? leaf.path.replace(/\/[^/]*$/, '') : undefined,
    apply: insert(leaf.title, leaf.path),
  }))
  // A name no leaf has: the last option writes a link to it, beside this leaf.
  const query = match.text.slice(1).trim()
  const here = source.here?.()
  const taken = (title: string) => title.toLowerCase() === query.toLowerCase()
  if (query && here && !source.leaves().some((l) => taken(l.title)) && !/^[/\\]+$/.test(query))
    options.push({
      label: query,
      displayLabel: `New leaf “${query}”`,
      detail: 'not written yet',
      boost: -99,
      apply: insert(query, newLeafPath(query, here)),
    })
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

/** A chip under dragged text. */
const OVER = 'data-drop'
const chipAt = (view: EditorView, target: EventTarget | null) => {
  const chip = (target as HTMLElement).closest?.<HTMLElement>('.cm-mention[data-path]')
  return chip && view.contentDOM.contains(chip) ? chip : null
}
const clearOver = (view: EditorView) =>
  view.contentDOM.querySelectorAll(`[${OVER}]`).forEach((el) => el.removeAttribute(OVER))

/**
 * Text selected and dragged onto a chip goes to the end of that leaf (owner's request):
 * dropped anywhere else, it moves within the text as usual. Dragged from this text, its
 * lines leave with it, as a block, so nothing empty is left where it was.
 */
const dropOnChips = EditorView.domEventHandlers({
  dragover(event, view) {
    const chip = chipAt(view, event.target)
    clearOver(view)
    if (!chip || !view.state.facet(mentionSource)?.append) return false
    chip.setAttribute(OVER, '')
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    return true
  },
  dragleave(_event, view) {
    clearOver(view)
    return false
  },
  dragend(_event, view) {
    clearOver(view)
    return false
  },
  drop(event, view) {
    clearOver(view)
    const chip = chipAt(view, event.target)
    const source = view.state.facet(mentionSource)
    const text = event.dataTransfer?.getData('text/plain') ?? ''
    if (!chip || !source?.append || !text.trim() || event.dataTransfer?.files.length) return false
    event.preventDefault()
    // Dragged from this text: the selection is what left (CodeMirror's own move does the same).
    const { from, to } = view.state.selection.main
    const own = from !== to && view.state.sliceDoc(from, to) === text
    if (own) view.dispatch({ changes: deletion(view.state, from, to), userEvent: 'move.drop' })
    void source.append(chip.dataset.path!, text)
    return true
  },
})

export const mentions = (source: MentionSource) => [
  mentionSource.of(source),
  autocompletion({ override: [completeMention], icons: false }),
  openChips,
  dropOnChips,
]
