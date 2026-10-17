// A leaf, editable wherever it is shown: the Peek over the map, its full page, the phone's
// sheet (ARCHITECTURE.md §7). Cover, icon and colours above the text; the text is the file.

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GraphNode } from '../model/graph'
import type { LeafMeta } from '../model/parse'
import { leafColors } from '../read/colors'
import { mentionLink } from '../model/links'
import { session, useSession } from '../store/session'
import controls from '../ui/controls.module.css'
import { treeHref } from '../ui/paths'
import { parentFor, StructureDialog, type StructureAction } from '../ui/StructureDialogs'
import { ACCENT_IDS } from '../ui/theme'
import { attach, attachmentMarkdown } from './attach'
import type { EditorHandle } from './Editor'
import styles from './LeafEditor.module.css'
import { EditableCover } from './EditableCover'
import { IconPicker } from './IconPicker'
import type { InsertHost } from './insertMenu'
import type { MentionLeaf, MentionSource } from './mentions'

// CodeMirror is its own chunk: it loads the first time a leaf is shown (ARCHITECTURE.md §11).
const loadEditor = () => import('./Editor')
const Editor = lazy(loadEditor)
/** Starts loading the editor before a leaf is shown, so showing one doesn't wait for it. */
export const preloadEditor = () => void loadEditor()

/** Edits reach this device's storage after this much quiet; commits follow the autosave. */
const LOCAL_SAVE_MS = 500

export function LeafEditor({
  repo,
  path,
  source,
  onOpen,
}: {
  repo: string
  path: string
  /** Show the Markdown as it is, instead of the live preview. */
  source: boolean
  /** Opens another leaf: an @ mention was clicked. */
  onOpen(id: string): void
}) {
  const key = repo.toLowerCase()
  const tree = useSession((s) => s.trees.find((t) => t.repo.toLowerCase() === key))
  const data = useSession((s) => s.data[key])
  const node = data?.graph?.nodes.get(path)
  const [text, setText] = useState<{ path: string; text: string } | null>(null)
  const handle = useRef<EditorHandle | null>(null)

  // @ mentions read the newest graph on use, so the editor is never rebuilt for it.
  const graphRef = useRef(data?.graph)
  const openRef = useRef(onOpen)
  useEffect(() => {
    graphRef.current = data?.graph
    openRef.current = onOpen
  })
  const mentionsFrom = useMemo<MentionSource>(() => {
    const asLeaf = (n: GraphNode): MentionLeaf => ({ path: n.id, title: n.title, icon: n.icon })
    return {
      leaves: () =>
        [...(graphRef.current?.nodes.values() ?? [])]
          .filter((n) => n.kind === 'leaf' && n.id !== path)
          .map(asLeaf),
      leaf: (id) => {
        const n = graphRef.current?.nodes.get(id)
        return n?.kind === 'leaf' ? asLeaf(n) : null
      },
      open: (id) => openRef.current(id),
      tree: (other) => {
        const t = session.getState().trees.find((t) => t.repo.toLowerCase() === other.toLowerCase())
        return t ? { title: t.title, href: `#${treeHref(t.repo)}` } : null
      },
    }
  }, [path])

  // Insert menu items handled here. A new leaf or branch also gets a mention.
  const [action, setAction] = useState<StructureAction | null>(null)
  const filePicker = useRef<HTMLInputElement>(null)
  const onInsert: InsertHost = (kind) => {
    const graph = graphRef.current
    if ((kind === 'image' || kind === 'file') && filePicker.current) {
      filePicker.current.accept = kind === 'image' ? 'image/*' : ''
      filePicker.current.click()
    } else if (kind === 'leaf') setAction({ kind: 'new-leaf', parent: path })
    else if (kind === 'branch' && graph)
      setAction({ kind: 'new-branch', parent: parentFor(graph, path) })
  }

  // Files, picked, pasted or dropped: saved in assets/ and linked where the cursor is.
  const saveFile = (file: File) =>
    attach(file, {
      taken: (p) => session.getState().files(repo).includes(p),
      save: (p, bytes) => session.getState().apply(repo, [{ path: p, text: bytes }]),
      ask: (message) => window.confirm(message),
      tell: (message) => window.alert(message),
    })
  const addFiles = async (files: File[]) => {
    for (const file of files) {
      const added = await saveFile(file)
      if (added)
        handle.current?.insertText(attachmentMarkdown(file.name, added.path, added.image), true)
    }
  }

  // The leaf's look (line 2): cover and colours. Shown at once, written to the text.
  const [look, setLook] = useState<LeafMeta | null>(null)
  const meta = look ?? node?.meta ?? null
  const changeLook = (update: (meta: LeafMeta) => LeafMeta) => {
    const next = update(meta ?? {})
    setLook(next)
    handle.current?.setMeta(() => next)
  }
  const coverPicker = useRef<HTMLInputElement>(null)
  const [repositioning, setRepositioning] = useState(false)
  const [picking, setPicking] = useState(false)
  const closePicker = useCallback(() => setPicking(false), [])
  const assetUrl = useCallback((p: string) => session.getState().assetUrl(repo, p), [repo])
  const mentionCreated = (id: string | undefined) => {
    setAction(null)
    const created = id && session.getState().data[key]?.graph?.nodes.get(id)
    if (created) handle.current?.insertText(mentionLink(created.title, created.id))
    else handle.current?.focus()
  }

  useEffect(() => {
    let live = true
    void session
      .getState()
      .textOf(repo, path)
      .then((t) => live && setText({ path, text: t }))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [repo, path])

  // Typing: the text goes to this device after a short pause; leaving the leaf commits it.
  const pending = useRef<{ text: string; timer: number } | null>(null)
  const saveLocally = () => {
    const p = pending.current
    if (!p) return Promise.resolve()
    window.clearTimeout(p.timer)
    pending.current = null
    return session.getState().apply(repo, [{ path, text: p.text }])
  }
  const saveRef = useRef(saveLocally)
  useEffect(() => {
    saveRef.current = saveLocally
  })
  useEffect(
    () => () => {
      void saveRef.current().then(() => session.getState().flush(repo))
    },
    [repo, path],
  )

  // Ctrl/Cmd+S and hiding the app commit everything on screen, including the last
  // keystrokes not yet written locally. Handled here first; App's listener covers the rest.
  useEffect(() => {
    const commitNow = () => void saveRef.current().then(() => session.getState().flush(repo))
    const onKey = (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's')) return
      e.preventDefault()
      e.stopPropagation()
      commitNow()
    }
    const onHidden = () => document.visibilityState === 'hidden' && commitNow()
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [repo])

  const onChange = (next: string) => {
    if (pending.current) window.clearTimeout(pending.current.timer)
    pending.current = {
      text: next,
      timer: window.setTimeout(() => void saveRef.current(), LOCAL_SAVE_MS),
    }
  }

  if (text?.path !== path) return <div className={styles.loading} aria-busy="true" />
  return (
    <div className={styles.leaf} style={leafColors(meta)} data-leaf="">
      <EditableCover
        key={`${path} ${repositioning}`}
        repo={repo}
        meta={meta}
        moving={repositioning}
        onSave={(coverPosition) => {
          changeLook((m) => ({ ...m, coverPosition }))
          setRepositioning(false)
        }}
        onCancel={() => setRepositioning(false)}
      />
      {/* The header's controls change the editor's text, so they appear with it. */}
      <Suspense fallback={<div className={styles.loading} aria-busy="true" />}>
        <div className={styles.header}>
          {node?.icon && (
            <button
              type="button"
              className={styles.iconButton}
              data-icon-trigger=""
              aria-haspopup="true"
              aria-expanded={picking}
              aria-label={`Change icon ${node.icon}`}
              onClick={() => setPicking((p) => !p)}
            >
              <span className={styles.icon}>{node.icon}</span>
            </button>
          )}
          <LeafStyle
            meta={meta}
            onChange={changeLook}
            onCover={() => coverPicker.current?.click()}
            onReposition={() => setRepositioning(true)}
            icon={
              node?.icon ? null : (
                <button
                  type="button"
                  className={controls.ghost}
                  data-icon-trigger=""
                  aria-haspopup="true"
                  aria-expanded={picking}
                  onClick={() => setPicking((p) => !p)}
                >
                  Add icon
                </button>
              )
            }
          />
          {picking && (
            <IconPicker
              icon={node?.icon ?? null}
              onPick={(icon) => handle.current?.setIcon(icon)}
              onClose={closePicker}
            />
          )}
        </div>
        <input
          ref={coverPicker}
          type="file"
          accept="image/*"
          hidden
          aria-label="Choose a cover image"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file)
              void saveFile(file).then(
                (added) =>
                  // A new picture starts centred.
                  added?.image &&
                  changeLook((m) => ({ ...withoutCover(m), cover: `/${added.path}` })),
              )
          }}
        />
        <Editor
          initial={text.text}
          source={source}
          onChange={onChange}
          handleRef={handle}
          mentionsFrom={mentionsFrom}
          onInsert={onInsert}
          onFiles={(files) => void addFiles(files)}
          assetUrl={assetUrl}
          files={() => session.getState().files(repo)}
          fileSize={(p) => session.getState().fileSize(repo, p)}
          // A new leaf holds only its title: start writing below it.
          autoFocus={text.text.trim().split('\n').length === 1}
        />
      </Suspense>
      {/* Images or any file: onInsert sets what it accepts. */}
      <input
        ref={filePicker}
        type="file"
        multiple
        hidden
        aria-label="Add files"
        onChange={(e) => {
          void addFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
      {action && tree && data?.graph && (
        <StructureDialog
          tree={tree}
          graph={data.graph}
          action={action}
          onDone={({ edit }) => mentionCreated(edit)}
          onClose={() => mentionCreated(undefined)}
        />
      )}
    </div>
  )
}

const COLORS = ['', ...ACCENT_IDS] as const
const colorName = (id: string) => (id ? id[0]!.toUpperCase() + id.slice(1) : 'Default')

/** Line 2 without the cover and its position. */
function withoutCover(meta: LeafMeta): LeafMeta {
  const rest = { ...meta }
  delete rest.cover
  delete rest.coverPosition
  return rest
}

/**
 * Icon, cover and colours: what lines 1 and 2 hold. Colours are names, so they follow
 * every theme. `icon` is the "Add icon" button, first in the row, when there's no icon yet.
 */
function LeafStyle({
  meta,
  onChange,
  onCover,
  onReposition,
  icon,
}: {
  meta: LeafMeta | null
  onChange(update: (meta: LeafMeta) => LeafMeta): void
  onCover(): void
  onReposition(): void
  icon: React.ReactNode
}) {
  const setColor = (part: 'heading' | 'text', value: string) =>
    onChange(({ color, ...rest }) => {
      const next = { ...color, [part]: value || undefined }
      if (!next.heading) delete next.heading
      if (!next.text) delete next.text
      return Object.keys(next).length ? { ...rest, color: next } : rest
    })
  return (
    <div className={styles.look}>
      {icon}
      <button type="button" className={controls.ghost} onClick={onCover}>
        {meta?.cover ? 'Change cover' : 'Add cover'}
      </button>
      {typeof meta?.cover === 'string' && (
        <button type="button" className={controls.ghost} onClick={onReposition}>
          Reposition
        </button>
      )}
      {meta?.cover !== undefined && (
        <button type="button" className={controls.ghost} onClick={() => onChange(withoutCover)}>
          Remove cover
        </button>
      )}
      {(['heading', 'text'] as const).map((part) => (
        <label key={part} className={styles.color}>
          {part === 'heading' ? 'Heading colour' : 'Text colour'}
          <select
            className={controls.input}
            value={typeof meta?.color?.[part] === 'string' ? meta.color[part] : ''}
            onChange={(e) => setColor(part, e.target.value)}
          >
            {COLORS.map((id) => (
              <option key={id} value={id}>
                {colorName(id)}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  )
}
