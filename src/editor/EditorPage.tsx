import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'
import type { GraphNode } from '../model/graph'
import type { LeafMeta } from '../model/parse'
import { Cover, leafColors } from '../read/LeafLook'
import { destination, mentionLink } from '../model/links'
import { assetPath } from '../sync/assets'
import { session, useSession } from '../store/session'
import { ConflictBanner } from '../ui/ConflictBanner'
import controls from '../ui/controls.module.css'
import { Icon } from '../ui/icons'
import { decodePath, treeHref } from '../ui/paths'
import { parentFor, StructureDialog, type StructureAction } from '../ui/StructureDialogs'
import { SyncStatus } from '../ui/SyncStatus'
import { ACCENT_IDS, colorVar } from '../ui/theme'
import { Divider, TopBar } from '../ui/TopBar'
import type { EditorHandle } from './Editor'
import styles from './EditorPage.module.css'
import { IconPicker } from './IconPicker'
import type { InsertHost } from './insertMenu'
import type { MentionLeaf, MentionSource } from './mentions'
import { Search } from '../ui/Search'

// CodeMirror is its own chunk: it loads the first time a leaf is edited (ARCHITECTURE.md §11).
const Editor = lazy(() => import('./Editor'))

/** Edits reach this device's storage after this much quiet; commits follow the autosave. */
const LOCAL_SAVE_MS = 500

export function EditorPage({ params }: { params: { owner: string; name: string; '*'?: string } }) {
  const repo = `${params.owner}/${params.name}`
  const key = repo.toLowerCase()
  const path = decodePath(params['*'] ?? '')
  const [, navigate] = useLocation()
  const tree = useSession((s) => s.trees.find((t) => t.repo.toLowerCase() === key))
  const data = useSession((s) => s.data[key])
  const node = data?.graph?.nodes.get(path)
  const exists = node?.kind === 'leaf'
  const [text, setText] = useState<{ path: string; text: string } | null>(null)
  const [source, setSource] = useState(false)
  const handle = useRef<EditorHandle | null>(null)

  // @ mentions read the newest graph on use, so the editor is never rebuilt for it.
  const graphRef = useRef(data?.graph)
  useEffect(() => {
    graphRef.current = data?.graph
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
      open: (id) => navigate(treeHref(repo, id)),
    }
  }, [repo, path, navigate])

  // Insert menu items the page handles. A new leaf or branch also gets a mention here.
  const [action, setAction] = useState<StructureAction | null>(null)
  const filePicker = useRef<HTMLInputElement>(null)
  const onInsert: InsertHost = (kind) => {
    const graph = graphRef.current
    if (kind === 'image') filePicker.current?.click()
    else if (kind === 'leaf') setAction({ kind: 'new-leaf', parent: path })
    else if (kind === 'branch' && graph)
      setAction({ kind: 'new-branch', parent: parentFor(graph, path) })
  }

  // Images, picked, pasted or dropped: saved in assets/ and shown where the cursor is.
  /** Saves an image in assets/ as a pending edit; null when it isn't an image or was declined. */
  const saveImage = async (file: File) => {
    if (!file.type.startsWith('image/')) return null
    const { prepareImage, WARN_BYTES } = await import('./images')
    const { bytes, ext } = await prepareImage(file)
    const megabytes = (bytes.byteLength / 1024 / 1024).toFixed(1)
    if (
      bytes.byteLength > WARN_BYTES &&
      !window.confirm(
        `${file.name} is ${megabytes} MB. Large files make the repository slow to download. Add it anyway?`,
      )
    )
      return null
    const taken = new Set(session.getState().files(repo))
    const asset = assetPath(file.name, ext, new Date(), (p) => taken.has(p))
    await session.getState().apply(repo, [{ path: asset, text: bytes }])
    return asset
  }
  const addImages = async (files: File[]) => {
    for (const file of files) {
      const asset = await saveImage(file)
      if (!asset) continue
      const alt = file.name.replace(/\.[^.]*$/, '').replace(/[[\]\\]/g, '') || 'Image'
      handle.current?.insertText(`![${alt}](${destination(asset)})`, true)
    }
  }

  // The leaf's look (line 2): cover and colours. Shown at once, written to the text.
  const [look, setLook] = useState<{ path: string; meta: LeafMeta } | null>(null)
  const meta = look?.path === path ? look.meta : (node?.meta ?? null)
  const changeLook = (update: (meta: LeafMeta) => LeafMeta) => {
    const next = update(meta ?? {})
    setLook({ path, meta: next })
    handle.current?.setMeta(() => next)
  }
  const coverPicker = useRef<HTMLInputElement>(null)
  const assetUrl = useCallback((p: string) => session.getState().assetUrl(repo, p), [repo])
  const mentionCreated = (id: string | undefined) => {
    setAction(null)
    const created = id && session.getState().data[key]?.graph?.nodes.get(id)
    if (created) handle.current?.insertText(mentionLink(created.title, created.id))
    else handle.current?.focus()
  }

  useEffect(() => {
    void session.getState().open(repo)
  }, [repo])

  useEffect(() => {
    if (!exists || text?.path === path) return
    void session
      .getState()
      .textOf(repo, path)
      .then((t) => setText({ path, text: t }))
  }, [repo, path, exists, text?.path])

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
  // keystrokes not yet written locally. Handled here first; App's listener covers other pages.
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

  const title = node?.title ?? decodePath(path).replace(/^.*\//, '')
  return (
    <div className={styles.page} style={{ '--tree': colorVar(tree?.color) } as React.CSSProperties}>
      <TopBar>
        <Divider />
        <nav aria-label="Breadcrumb" className={styles.crumbs}>
          <Link href="/" className={styles.home}>
            All trees
          </Link>
          <Icon name="chevronRight" size={14} />
          <Link href={treeHref(repo)} className={styles.home}>
            {tree?.title ?? params.name}
          </Link>
          <Icon name="chevronRight" size={14} />
          <h1 className={styles.title}>{title}</h1>
        </nav>
        <Search />
        <span className={styles.status}>
          <SyncStatus repo={repo} branch={tree?.branch ?? 'main'} />
        </span>
        <button
          type="button"
          className={`${controls.ghost} ${styles.toggle}`}
          aria-pressed={source}
          onClick={() => setSource((s) => !s)}
        >
          {source ? 'Show preview' : 'Show Markdown'}
        </button>
        <button
          type="button"
          className={controls.primary}
          onClick={() => navigate(treeHref(repo, path))}
        >
          Done
        </button>
      </TopBar>
      <ConflictBanner repo={repo} />
      <main className={styles.main}>
        {data?.status === 'error' && !data.graph ? (
          <p className={controls.error} role="alert">
            {data.error}
          </p>
        ) : data?.graph && !exists ? (
          <p className={styles.missing}>
            This leaf isn't in the Tree any more. <Link href={treeHref(repo)}>Back to the map</Link>
          </p>
        ) : text?.path === path ? (
          <article className={styles.column} style={leafColors(meta)}>
            <Cover repo={repo} src={meta?.cover} className={styles.cover} />
            <IconPicker
              icon={node?.icon ?? null}
              onPick={(icon) => handle.current?.setIcon(icon)}
            />
            <LeafStyle
              meta={meta}
              onChange={changeLook}
              onCover={() => coverPicker.current?.click()}
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
                  void saveImage(file).then(
                    (asset) => asset && changeLook((m) => ({ ...m, cover: `/${asset}` })),
                  )
              }}
            />
            <Suspense fallback={<div className={styles.loading} aria-busy="true" />}>
              <Editor
                key={path}
                initial={text.text}
                source={source}
                onChange={onChange}
                handleRef={handle}
                mentionsFrom={mentionsFrom}
                onInsert={onInsert}
                onFiles={(files) => void addImages(files)}
                assetUrl={assetUrl}
                // A new leaf holds only its title: start writing below it.
                autoFocus={text.text.trim().split('\n').length === 1}
              />
            </Suspense>
            <p className={`${controls.mono} ${styles.path}`}>{path}</p>
            <input
              ref={filePicker}
              type="file"
              accept="image/*"
              multiple
              hidden
              aria-label="Add images"
              onChange={(e) => {
                void addImages([...(e.target.files ?? [])])
                e.target.value = ''
              }}
            />
          </article>
        ) : (
          <div className={styles.loading} aria-busy="true" />
        )}
      </main>
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

/** Cover and colours: what line 2 holds. Colours are names, so they follow every theme. */
function LeafStyle({
  meta,
  onChange,
  onCover,
}: {
  meta: LeafMeta | null
  onChange(update: (meta: LeafMeta) => LeafMeta): void
  onCover(): void
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
      <button type="button" className={controls.ghost} onClick={onCover}>
        {meta?.cover ? 'Change cover' : 'Add cover'}
      </button>
      {meta?.cover !== undefined && (
        <button
          type="button"
          className={controls.ghost}
          onClick={() =>
            onChange((m) => {
              const rest = { ...m }
              delete rest.cover
              return rest
            })
          }
        >
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
