// Live preview (ARCHITECTURE.md §7): one decoration extension over the Markdown text.
// Lines without the cursor hide their syntax and show the result; the line being edited
// shows its Markdown. "Show Markdown" turns this extension off: same editor, same text.

import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder, type EditorState, type Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { leadingIcon, linkTarget, META } from '../model/parse'

/** The title's icon with the space after it, so both can be hidden. */
const titleIcon = (rest: string) => {
  const icon = leadingIcon(rest)
  return icon && rest.slice(icon.length).startsWith(' ') ? `${icon} ` : icon
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked
  }
  toDOM() {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = this.checked
    box.className = 'cm-task'
    box.setAttribute('aria-label', this.checked ? 'Done' : 'To do')
    return box
  }
  ignoreEvent() {
    return false
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super()
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt
  }
  toDOM() {
    const img = document.createElement('img')
    img.src = this.src
    img.alt = this.alt
    img.className = 'cm-image'
    img.loading = 'lazy'
    img.decoding = 'async'
    return img
  }
}

const hide = Decoration.replace({})
const line = (cls: string) => Decoration.line({ class: cls })
const mark = (cls: string) => Decoration.mark({ class: cls })

/** Lines holding the cursor or a selection: they show their Markdown. */
function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>()
  for (const r of state.selection.ranges) {
    const from = state.doc.lineAt(r.from).number
    const to = state.doc.lineAt(r.to).number
    for (let n = from; n <= to; n++) lines.add(n)
  }
  return lines
}

function build(view: EditorView): DecorationSet {
  const { state } = view
  const active = activeLines(state)
  const isActive = (pos: number) => active.has(state.doc.lineAt(pos).number)
  const decorations: Range<Decoration>[] = []

  // Line 1 is the title; line 2 may hold the metadata comment (ARCHITECTURE.md §4).
  decorations.push(line('cm-title').range(0))
  if (state.doc.lines >= 2) {
    const second = state.doc.line(2)
    if (META.test(second.text)) decorations.push(line('cm-meta').range(second.from))
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name
        const heading = /^ATXHeading(\d)$/.exec(name)
        if (heading) {
          decorations.push(line(`cm-h${heading[1]}`).range(state.doc.lineAt(node.from).from))
          return
        }
        switch (name) {
          case 'HeaderMark': {
            const after = state.sliceDoc(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to
            // Line 1 is the title: its "# " and icon stay hidden even while editing it,
            // since the icon picker above shows and changes the icon.
            if (node.from === 0) {
              const icon = titleIcon(state.doc.line(1).text.slice(after))
              decorations.push(hide.range(node.from, after + icon.length))
            } else if (!isActive(node.from)) {
              decorations.push(hide.range(node.from, after))
            }
            return
          }
          case 'Emphasis':
            decorations.push(mark('cm-em').range(node.from, node.to))
            return
          case 'StrongEmphasis':
            decorations.push(mark('cm-strong').range(node.from, node.to))
            return
          case 'Strikethrough':
            decorations.push(mark('cm-strike').range(node.from, node.to))
            return
          case 'InlineCode':
            decorations.push(mark('cm-inline-code').range(node.from, node.to))
            return
          case 'EmphasisMark':
          case 'CodeMark':
          case 'StrikethroughMark': {
            const parent = node.node.parent?.name
            if (parent !== 'FencedCode' && !isActive(node.from))
              decorations.push(hide.range(node.from, node.to))
            if (parent === 'FencedCode')
              decorations.push(mark('cm-fence').range(node.from, node.to))
            return
          }
          case 'Link': {
            const url = node.node.getChild('URL')
            const dest = url ? state.sliceDoc(url.from, url.to) : ''
            const target = linkTarget(dest)
            decorations.push(
              mark(target && target.repo === null ? 'cm-mention' : 'cm-link').range(
                node.from,
                node.to,
              ),
            )
            if (!isActive(node.from)) {
              for (const child of [...node.node.getChildren('LinkMark'), ...(url ? [url] : [])]) {
                decorations.push(hide.range(child.from, child.to))
              }
              const title = node.node.getChild('LinkTitle')
              if (title) decorations.push(hide.range(title.from, title.to))
            }
            return false
          }
          case 'Image': {
            if (isActive(node.from)) return false
            const url = node.node.getChild('URL')
            const text = state.sliceDoc(node.from, node.to)
            const alt = /^!\[([^\]]*)\]/.exec(text)?.[1] ?? ''
            if (url) {
              decorations.push(
                Decoration.replace({
                  widget: new ImageWidget(state.sliceDoc(url.from, url.to), alt),
                }).range(node.from, node.to),
              )
            }
            return false
          }
          case 'Blockquote': {
            for (let pos = node.from; pos <= node.to;) {
              const l = state.doc.lineAt(pos)
              decorations.push(line('cm-quote').range(l.from))
              pos = l.to + 1
            }
            return
          }
          case 'QuoteMark':
            if (!isActive(node.from)) decorations.push(hide.range(node.from, node.to))
            return
          case 'ListMark':
            decorations.push(mark('cm-list-mark').range(node.from, node.to))
            return
          case 'TaskMarker': {
            const checked = /x/i.test(state.sliceDoc(node.from, node.to))
            if (!isActive(node.from)) {
              // The checkbox replaces the bullet too.
              const bullet = node.node.parent?.parent?.getChild('ListMark')
              if (bullet) decorations.push(hide.range(bullet.from, node.from))
              decorations.push(
                Decoration.replace({ widget: new CheckboxWidget(checked) }).range(
                  node.from,
                  node.to,
                ),
              )
            }
            if (checked)
              decorations.push(mark('cm-done').range(node.to, state.doc.lineAt(node.to).to))
            return
          }
          case 'FencedCode': {
            for (let pos = node.from; pos <= node.to;) {
              const l = state.doc.lineAt(pos)
              decorations.push(line('cm-code-block').range(l.from))
              pos = l.to + 1
            }
            return
          }
          case 'HorizontalRule':
            decorations.push(line('cm-rule').range(state.doc.lineAt(node.from).from))
            if (!isActive(node.from))
              decorations.push(mark('cm-rule-mark').range(node.from, node.to))
            return
        }
        return
      },
    })
  }

  const builder = new RangeSetBuilder<Decoration>()
  decorations
    .sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide)
    .forEach((d) => builder.add(d.from, d.to, d.value))
  return builder.finish()
}

/** Toggles a task when its checkbox is clicked: `[ ]` ↔ `[x]` in the text. */
const toggleTasks = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target as HTMLElement
    if (!target.classList.contains('cm-task')) return false
    const pos = view.posAtDOM(target)
    const text = view.state.sliceDoc(pos, pos + 3)
    const next = /\[[xX]\]/.test(text) ? '[ ]' : /\[ \]/.test(text) ? '[x]' : null
    if (!next) return false
    view.dispatch({ changes: { from: pos, to: pos + 3, insert: next } })
    event.preventDefault()
    return true
  },
})

export const livePreview = [
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = build(view)
      }
      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          syntaxTree(update.startState) !== syntaxTree(update.state)
        ) {
          this.decorations = build(update.view)
        }
      }
    },
    { decorations: (v) => v.decorations },
  ),
  toggleTasks,
]
