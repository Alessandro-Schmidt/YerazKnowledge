import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { session, useSession } from '../store/session'
import { ConflictBanner } from '../ui/ConflictBanner'
import controls from '../ui/controls.module.css'
import { Icon } from '../ui/icons'
import { decodePath, treeHref } from '../ui/paths'
import { SyncStatus } from '../ui/SyncStatus'
import { colorVar } from '../ui/theme'
import { Divider, TopBar } from '../ui/TopBar'
import type { EditorHandle } from './Editor'
import styles from './EditorPage.module.css'
import { IconPicker } from './IconPicker'

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
    </div>
  )
}
