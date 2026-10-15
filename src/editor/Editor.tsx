// The editor (ARCHITECTURE.md §7): CodeMirror 6 editing the leaf's Markdown text directly.
// Nothing is converted; the document in the editor is the file. Loaded on first use.

import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { classHighlighter } from '@lezer/highlight'
import { useEffect, useRef } from 'react'
import { withIcon } from '../model/parse'
import styles from './Editor.module.css'
import { assetSource, livePreview } from './livePreview'
import { insertMenu, type InsertHost } from './insertMenu'
import { mentions, type MentionSource } from './mentions'

export interface EditorHandle {
  setIcon(icon: string | null): void
  /** Inserts text at the cursor, on a line of its own when `block`, and focuses. */
  insertText(text: string, block?: boolean): void
  focus(): void
}

export interface EditorProps {
  initial: string
  /** Live preview, or the Markdown as it is. */
  source: boolean
  onChange(text: string): void
  handleRef?: React.RefObject<EditorHandle | null>
  /** Focus with the cursor at the end, as for a leaf that was just created. */
  autoFocus?: boolean
  /** The Tree's leaves, for @ mentions and their chips. */
  mentionsFrom?: MentionSource
  /** Insert menu items the page handles: images, new leaves and branches. */
  onInsert?: InsertHost
  /** Files pasted or dropped into the text (images). */
  onFiles?(files: File[]): void
  /** URLs for the Tree's own files, such as `assets/…` images. */
  assetUrl?(path: string): Promise<string | null>
}

export default function Editor({
  initial,
  source,
  onChange,
  handleRef,
  autoFocus,
  mentionsFrom,
  onInsert,
  onFiles,
  assetUrl,
}: EditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const preview = useRef(new Compartment())
  const changed = useRef(onChange)
  const insertRef = useRef(onInsert)
  const filesRef = useRef(onFiles)
  const assetRef = useRef(assetUrl)
  useEffect(() => {
    changed.current = onChange
    insertRef.current = onInsert
    filesRef.current = onFiles
    assetRef.current = assetUrl
  })

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxHighlighting(classHighlighter),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': 'Leaf text', spellcheck: 'true' }),
          placeholder('Start writing…'),
          mentionsFrom ? mentions(mentionsFrom) : [],
          insertMenu((kind, v) => insertRef.current?.(kind, v)),
          assetSource.of(async (path) => (await assetRef.current?.(path)) ?? null),
          EditorView.domEventHandlers({
            paste(event) {
              const files = [...(event.clipboardData?.files ?? [])]
              if (!files.length || !filesRef.current) return false
              event.preventDefault()
              filesRef.current(files)
              return true
            },
            drop(event, v) {
              const files = [...(event.dataTransfer?.files ?? [])]
              if (!files.length || !filesRef.current) return false
              event.preventDefault()
              const at = v.posAtCoords({ x: event.clientX, y: event.clientY })
              if (at !== null) v.dispatch({ selection: { anchor: at } })
              filesRef.current(files)
              return true
            },
          }),
          preview.current.of(source ? [] : livePreview),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) changed.current(u.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = editor
    if (autoFocus) {
      editor.focus()
      editor.dispatch({ selection: { anchor: editor.state.doc.length } })
    }
    return () => {
      editor.destroy()
      view.current = null
    }
    // The editor is made once per leaf; the parent remounts it for another leaf.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    view.current?.dispatch({ effects: preview.current.reconfigure(source ? [] : livePreview) })
  }, [source])

  useEffect(() => {
    if (!handleRef) return
    handleRef.current = {
      setIcon(icon) {
        const v = view.current
        if (!v) return
        const text = v.state.doc.toString()
        const next = withIcon(text, icon)
        const firstLine = v.state.doc.line(1)
        const newFirst = next.slice(0, next.length - (text.length - firstLine.to))
        v.dispatch({ changes: { from: 0, to: firstLine.to, insert: newFirst } })
      },
      insertText(text, block) {
        const v = view.current
        if (!v) return
        const { head } = v.state.selection.main
        const line = v.state.doc.lineAt(head)
        const insert = block
          ? `${head > line.from ? '\n' : ''}${text}${head < line.to ? '\n' : ''}`
          : text
        v.dispatch({
          changes: { from: head, insert },
          selection: { anchor: head + insert.length },
        })
        v.focus()
      },
      focus: () => view.current?.focus(),
    }
  }, [handleRef])

  return <div ref={host} className={styles.editor} data-source={source || undefined} />
}
