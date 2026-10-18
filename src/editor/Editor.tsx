// The editor (ARCHITECTURE.md §7): CodeMirror 6 editing the leaf's Markdown text directly.
// Nothing is converted; the document in the editor is the file. Loaded on first use.

import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { classHighlighter } from '@lezer/highlight'
import { useEffect, useRef } from 'react'
import { parseLeaf, withIcon, withMeta, type LeafMeta } from '../model/parse'
import { mark, markNow } from '../perf'
import styles from './Editor.module.css'
import { assetSource, fileSizes, livePreview, treeFiles } from './livePreview'
import { emptyHint, hiddenTitle } from './emptyText'
import { insertMenu, type InsertHost } from './insertMenu'
import { mentions, type MentionSource } from './mentions'
import { pasteLink } from './pasteLink'

export interface EditorHandle {
  setIcon(icon: string | null): void
  /** Changes line 2's metadata (cover, colours); other keys are kept. */
  setMeta(update: (meta: LeafMeta) => LeafMeta): void
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
  /** Line 1 hidden: a branch's text, whose name the Peek shows above it. */
  titleHidden?: boolean
  /** The Tree's leaves, for @ mentions and their chips. */
  mentionsFrom?: MentionSource
  /** Insert menu items the page handles: images, new leaves and branches. */
  onInsert?: InsertHost
  /** Files pasted or dropped into the text. */
  onFiles?(files: File[]): void
  /** URLs for the Tree's own files, such as `assets/…` images. */
  assetUrl?(path: string): Promise<string | null>
  /** Every file path in the Tree, for a video's subtitles. */
  files?(): Iterable<string>
  /** Sizes of the Tree's own files, for attachment cards. */
  fileSize?(path: string): number | null
}

export default function Editor({
  initial,
  source,
  onChange,
  handleRef,
  autoFocus,
  titleHidden,
  mentionsFrom,
  onInsert,
  onFiles,
  assetUrl,
  files,
  fileSize,
}: EditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const preview = useRef(new Compartment())
  const changed = useRef(onChange)
  const insertRef = useRef(onInsert)
  const filesRef = useRef(onFiles)
  const assetRef = useRef(assetUrl)
  const filesListRef = useRef(files)
  const sizeRef = useRef(fileSize)
  useEffect(() => {
    changed.current = onChange
    insertRef.current = onInsert
    filesRef.current = onFiles
    assetRef.current = assetUrl
    filesListRef.current = files
    sizeRef.current = fileSize
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
          emptyHint,
          titleHidden ? hiddenTitle : [],
          mentionsFrom ? mentions(mentionsFrom) : [],
          insertMenu((kind, v) => insertRef.current?.(kind, v)),
          pasteLink,
          assetSource.of(async (path) => (await assetRef.current?.(path)) ?? null),
          treeFiles.of(() => filesListRef.current?.() ?? []),
          fileSizes.of((path) => sizeRef.current?.(path) ?? null),
          EditorView.domEventHandlers({
            keydown() {
              markNow('keystroke')
              return false
            },
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
            if (!u.docChanged) return
            changed.current(u.state.doc.toString())
            markNow('keystroke-done')
          }),
        ],
      }),
    })
    view.current = editor
    mark('editor-painted')
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
    /**
     * Rewrites the text as one change covering only what differs (lines 1 and 2 here),
     * unfiltered: metaLine keeps typing out of line 2, not the header's own controls.
     */
    const rewrite = (edit: (text: string) => string) => {
      const v = view.current
      if (!v) return
      const text = v.state.doc.toString()
      const next = edit(text)
      let from = 0
      while (from < text.length && text[from] === next[from]) from++
      let end = 0
      while (
        end < text.length - from &&
        end < next.length - from &&
        text[text.length - 1 - end] === next[next.length - 1 - end]
      )
        end++
      v.dispatch({
        changes: { from, to: text.length - end, insert: next.slice(from, next.length - end) },
        filter: false,
      })
    }
    handleRef.current = {
      setIcon: (icon) => rewrite((text) => withIcon(text, icon)),
      setMeta: (update) => rewrite((text) => withMeta(text, update(parseLeaf(text).meta ?? {}))),
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
