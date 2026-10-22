// A leaf, editable wherever it is shown: the Peek over the map, its full page, the phone's
// sheet (ARCHITECTURE.md §7). Cover, icon and colours above the text; the text is the file.
// A branch's text (its folder's README.md) is written here too, without a look of its own.

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { iconImage, threadEnd, type GraphNode } from '../model/graph'
import { parseLeaf, parseMeta, repairHeader, type LeafMeta } from '../model/parse'
import { leafColors } from '../read/colors'
import { Cover } from '../read/LeafLook'
import { mentionLink } from '../model/links'
import { session, useSession } from '../store/session'
import controls from '../ui/controls.module.css'
import { Icon } from '../ui/icons'
import { treeHref } from '../ui/paths'
import { planBranchText } from '../sync/structure'
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
  autoFocus,
  onOpen,
}: {
  repo: string
  path: string
  /** Show the Markdown as it is, instead of the live preview. */
  source: boolean
  /** Put the cursor below the title, to start writing: the leaf was just created. */
  autoFocus?: boolean | undefined
  /** Opens another leaf: an @ mention was clicked. */
  onOpen(id: string): void
}) {
  const key = repo.toLowerCase()
  const tree = useSession((s) => s.trees.find((t) => t.repo.toLowerCase() === key))
  const data = useSession((s) => s.data[key])
  const node = data?.graph?.nodes.get(path)
  // The branch whose text this is, if it is a README.md rather than a leaf.
  const owner = data?.graph ? threadEnd(data.graph, path) : null
  const branch = owner !== null && owner !== path ? data!.graph!.nodes.get(owner)! : null
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
      // A link to a branch's README.md is a mention of the branch, and opens it.
      leaf: (id) => {
        const graph = graphRef.current
        const end = graph ? threadEnd(graph, id) : null
        const n = end === null ? undefined : graph!.nodes.get(end)
        return n ? asLeaf(n) : null
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
    } else if (kind === 'leaf') setAction({ kind: 'new-leaf', parent: branch?.id ?? path })
    else if (kind === 'branch' && graph)
      setAction({ kind: 'new-branch', parent: parentFor(graph, branch?.id ?? path) })
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
  // A branch's look is its text's (README.md): the graph gives it to the branch.
  const owned = branch ?? node
  const meta = look ?? owned?.meta ?? null
  const changeLook = (update: (meta: LeafMeta) => LeafMeta) => {
    const next = update(meta ?? {})
    setLook(next)
    handle.current?.setMeta(next)
  }
  const coverPicker = useRef<HTMLInputElement>(null)
  const iconFile = useRef<HTMLInputElement>(null)
  const [repositioning, setRepositioning] = useState(false)
  const [picking, setPicking] = useState(false)
  /** One icon at a time: an emoji (line 1) or an image (line 2's `icon`). */
  const setEmoji = (icon: string | null) => {
    if (iconImage(meta)) changeLook(withoutImageIcon)
    handle.current?.setIcon(icon)
  }
  const image = iconImage(meta)
  const closePicker = useCallback(() => setPicking(false), [])
  /** An emoji or an image: in "Add icon", or in the icon's own menu once there is one. */
  const iconChoices = (
    <>
      <button type="button" role="menuitem" onClick={() => setPicking(true)} data-icon-trigger="">
        Choose an emoji
      </button>
      <button type="button" role="menuitem" onClick={() => iconFile.current?.click()}>
        Upload an image
      </button>
    </>
  )
  const assetUrl = useCallback((p: string) => session.getState().assetUrl(repo, p), [repo])
  const mentionCreated = (id: string | undefined) => {
    setAction(null)
    const created = id && session.getState().data[key]?.graph?.nodes.get(id)
    if (created) handle.current?.insertText(mentionLink(created.title, created.id))
    else handle.current?.focus()
  }

  useEffect(() => {
    let live = true
    // A branch's text that doesn't exist yet starts from its heading; the first save creates it.
    const graph = session.getState().data[key]?.graph
    const end = graph ? threadEnd(graph, path) : null
    const unwritten = graph && end !== null && end !== path && !graph.nodes.get(end)?.sha
    void Promise.resolve(
      unwritten ? planBranchText(graph, end).text : session.getState().textOf(repo, path),
    )
      .then((t) => {
        if (!live) return
        // A header damaged before shows repaired, and the next save writes the repair.
        const repaired = repairHeader(t)
        if (repaired !== t) setLook(parseLeaf(repaired).meta)
        setText({ path, text: repaired })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [repo, key, path])

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
    // The look follows the text, so Undo of a header change shows (and keeps) the undone line 2.
    setLook(parseMeta(secondLine(next)) ?? {})
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
          {(owned?.icon || image) && (
            <div
              className={styles.iconRow}
              data-position={iconPlace(meta)}
              // Over the cover's lower edge; not while the cover is being moved.
              data-over-cover={meta?.cover && !repositioning ? '' : undefined}
            >
              {/* The icon's choices open from the icon itself (owner's request). */}
              <Menu
                label={image ? 'Change icon (an image)' : `Change icon ${owned?.icon}`}
                className={styles.iconButton}
                iconTrigger
                trigger={
                  image ? (
                    <Cover repo={repo} src={image} className={styles.iconImage} />
                  ) : (
                    <span className={styles.icon}>{owned?.icon}</span>
                  )
                }
              >
                {iconChoices}
                <span className={styles.menuLabel} role="presentation">
                  Position
                </span>
                {PLACES.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={iconPlace(meta) === id}
                    onClick={() =>
                      changeLook((m) => ({
                        ...withoutPlace(m),
                        ...(id !== 'left' && { iconPosition: id }),
                      }))
                    }
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  role="menuitem"
                  data-danger=""
                  onClick={() => {
                    changeLook(withoutImageIcon)
                    handle.current?.setIcon(null)
                  }}
                >
                  Remove icon
                </button>
              </Menu>
            </div>
          )}
          <LeafStyle
            meta={meta}
            iconChoices={owned?.icon || image ? null : iconChoices}
            onChange={changeLook}
            onCover={() => coverPicker.current?.click()}
            onReposition={() => setRepositioning(true)}
          />
          {picking && (
            <IconPicker
              removable={!!(owned?.icon || image)}
              onPick={setEmoji}
              onClose={closePicker}
            />
          )}
        </div>
        <input
          ref={iconFile}
          type="file"
          accept="image/*"
          hidden
          aria-label="Choose an icon image"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file)
              void saveFile(file).then((added) => {
                if (!added?.image) return
                // An image replaces the emoji: one icon at a time.
                handle.current?.setIcon(null)
                changeLook((m) => ({ ...m, icon: `/${added.path}` }))
              })
          }}
        />
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
          autoFocus={autoFocus}
          titleHidden={branch !== null}
          untitled={branch?.title}
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

/** Line 2 of a text, without parsing the rest of it. */
function secondLine(text: string): string | undefined {
  const start = text.indexOf('\n')
  if (start < 0) return undefined
  const end = text.indexOf('\n', start + 1)
  return text.slice(start + 1, end < 0 ? undefined : end)
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

/** Line 2 without an image icon or its place. */
function withoutImageIcon(meta: LeafMeta): LeafMeta {
  const rest = { ...meta }
  delete rest.icon
  delete rest.iconPosition
  return rest
}

/** Line 2 without the icon's place. */
function withoutPlace(meta: LeafMeta): LeafMeta {
  const rest = { ...meta }
  delete rest.iconPosition
  return rest
}

const PLACES = [
  ['left', 'Left'],
  ['center', 'Centre'],
  ['right', 'Right'],
] as const
type Place = (typeof PLACES)[number][0]
/** Where the icon sits over the cover (line 2 `iconPosition`); on the left unless chosen. */
const iconPlace = (meta: LeafMeta | null): Place =>
  PLACES.some(([id]) => id === meta?.iconPosition) ? (meta!.iconPosition as Place) : 'left'

/**
 * Icon, cover and colours: what lines 1 and 2 hold. Colours are names, so they follow
 * every theme. Each is one button's menu; on a phone the buttons are icons alone.
 */
function LeafStyle({
  meta,
  iconChoices,
  onChange,
  onCover,
  onReposition,
}: {
  meta: LeafMeta | null
  /** "Add icon" and its choices; null once the leaf has an icon, whose own menu has them. */
  iconChoices: React.ReactNode
  onChange(update: (meta: LeafMeta) => LeafMeta): void
  onCover(): void
  onReposition(): void
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
      {iconChoices && (
        <Menu label="Add icon" icon={<Icon name="face" size={18} />}>
          {iconChoices}
        </Menu>
      )}
      {meta?.cover === undefined ? (
        <button
          type="button"
          className={`${controls.ghost} ${styles.lookButton}`}
          aria-label="Add cover"
          onClick={onCover}
        >
          <Icon name="image" size={18} />
          <span className={styles.word}>Add cover</span>
        </button>
      ) : (
        <Menu label="Change cover" icon={<Icon name="image" size={18} />}>
          <button type="button" role="menuitem" onClick={onCover}>
            Upload an image
          </button>
          {typeof meta.cover === 'string' && (
            <button type="button" role="menuitem" onClick={onReposition}>
              Reposition
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            data-danger=""
            onClick={() => onChange(withoutCover)}
          >
            Remove cover
          </button>
        </Menu>
      )}
      {(['heading', 'text'] as const).map((part) => {
        const current = typeof meta?.color?.[part] === 'string' ? meta.color[part] : ''
        return (
          <Menu
            key={part}
            label={part === 'heading' ? 'Heading colour' : 'Text colour'}
            icon={
              <span className={styles.swatch} data-part={part} aria-hidden="true">
                {part === 'heading' ? 'H' : 'T'}
              </span>
            }
          >
            {COLORS.map((id) => (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={current === id}
                onClick={() => setColor(part, id)}
              >
                <span
                  className={styles.dot}
                  style={{ background: id ? `var(--c-${id})` : 'var(--text)' }}
                  aria-hidden="true"
                />
                {colorName(id)}
              </button>
            ))}
          </Menu>
        )
      })}
    </div>
  )
}

/**
 * A button whose choices open below it; a choice, a click elsewhere or Escape closes it.
 * It shows `trigger` alone, or `icon` with the label (the label alone on a phone's screen is
 * too much: there only the icon shows).
 */
function Menu({
  label,
  children,
  icon,
  trigger,
  className,
  iconTrigger,
}: {
  label: string
  children: React.ReactNode
  icon?: React.ReactNode
  trigger?: React.ReactNode
  className?: string
  /** Marks the button for the icon picker, which stays open when it is clicked. */
  iconTrigger?: boolean
}) {
  const [open, setOpen] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !host.current?.contains(e.target as Node)
      )
        setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <div ref={host} className={styles.menuHost}>
      <button
        type="button"
        className={className ?? `${controls.ghost} ${styles.lookButton}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-icon-trigger={iconTrigger ? '' : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger ?? (
          <>
            {icon}
            <span className={styles.word}>{label}</span>
          </>
        )}
      </button>
      {open && (
        <div
          className={`${controls.panel} ${styles.menu}`}
          role="menu"
          aria-label={label}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}
