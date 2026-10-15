import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'
import type { GraphNode } from '../model/graph'
import { mentionLink } from '../model/links'
import { session, useSession } from '../store/session'
import { ConflictBanner } from '../ui/ConflictBanner'
import controls from '../ui/controls.module.css'
import { Icon } from '../ui/icons'
import { decodePath, treeHref } from '../ui/paths'
import { parentFor, StructureDialog, type StructureAction } from '../ui/StructureDialogs'
import { SyncStatus } from '../ui/SyncStatus'
import { colorVar } from '../ui/theme'
import { Divider, TopBar } from '../ui/TopBar'
import type { EditorHandle } from './Editor'
import styles from './EditorPage.module.css'
import { IconPicker } from './IconPicker'
import type { InsertHost } from './insertMenu'
import type { MentionLeaf, MentionSource } from './mentions'

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
  const onInsert: InsertHost = (kind) => {
    const graph = graphRef.current
    if (kind === 'leaf') setAction({ kind: 'new-leaf', parent: path })
    else if (kind === 'branch' && graph)
      setAction({ kind: 'new-branch', parent: parentFor(graph, path) })
  }
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
          <article className={styles.column}>
            <IconPicker
              icon={node?.icon ?? null}
              onPick={(icon) => handle.current?.setIcon(icon)}
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
                // A new leaf holds only its title: start writing below it.
                autoFocus={text.text.trim().split('\n').length === 1}
              />
            </Suspense>
            <p className={`${controls.mono} ${styles.path}`}>{path}</p>
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
