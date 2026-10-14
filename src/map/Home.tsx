import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useLocation } from 'wouter'
import { compactWords } from '../model/graph'
import { session, useSession, type TreeData } from '../store/session'
import controls from '../ui/controls.module.css'
import { Icon } from '../ui/icons'
import { treeHref } from '../ui/paths'
import { colorVar } from '../ui/theme'
import { Divider, TopBar } from '../ui/TopBar'
import styles from './Home.module.css'
import { HomeMap, type HomeEntry } from './HomeMap'

export function Home() {
  const trees = useSession((s) => s.trees)
  const data = useSession((s) => s.data)
  const discovery = useSession((s) => s.discovery)
  const [selected, setSelected] = useState<string | null>(null)
  const [, navigate] = useLocation()

  // Find Trees again on every visit (another device may have made one), and open each.
  useEffect(() => {
    void session.getState().discover()
  }, [])
  useEffect(() => {
    for (const t of trees)
      if (!session.getState().data[t.repo.toLowerCase()]) void session.getState().open(t.repo)
  }, [trees])

  const entries = useMemo<HomeEntry[]>(
    () =>
      trees.flatMap((tree) => {
        const graph = data[tree.repo.toLowerCase()]?.graph
        return graph ? [{ tree, graph }] : []
      }),
    [trees, data],
  )
  const current = entries.find((e) => e.tree.repo === selected) ?? null
  const open = (repo: string) => navigate(treeHref(repo))

  return (
    <div className={styles.page}>
      <TopBar>
        <Divider />
        <h1 className={styles.title}>All trees</h1>
        <button
          type="button"
          className={`${controls.iconButton} ${styles.signOut}`}
          aria-label="Sign out"
          title="Sign out"
          onClick={() => void session.getState().signOut()}
        >
          <Icon name="signOut" size={18} />
        </button>
      </TopBar>
      <div className={styles.body}>
        <aside className={styles.rail} aria-label="Trees">
          <div className={styles.railHead}>
            <h2 className={controls.eyebrow}>Trees</h2>
            <span className={`${controls.mono} ${styles.count}`}>{trees.length}</span>
          </div>
          <ul className={styles.list}>
            {trees.map((t) => {
              const d = data[t.repo.toLowerCase()]
              return (
                <li key={t.repo}>
                  <button
                    type="button"
                    className={styles.row}
                    aria-current={selected === t.repo || undefined}
                    onClick={() => setSelected(t.repo)}
                    onDoubleClick={() => open(t.repo)}
                    style={{ '--tree': colorVar(t.color) } as CSSProperties}
                  >
                    <span className={styles.ring} aria-hidden="true" />
                    <span className={styles.names}>
                      <span className={styles.name}>{t.title}</span>
                      <span className={`${controls.mono} ${styles.repo}`}>
                        {d?.status === 'error' ? d.error : t.repo}
                      </span>
                    </span>
                    <span className={`${controls.mono} ${styles.count}`}>{leafCount(d)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <Connect onConnected={(repo) => setSelected(repo)} />
        </aside>
        <main className={styles.main}>
          {entries.length > 0 && (
            <HomeMap entries={entries} selected={selected} onSelect={setSelected} onOpen={open} />
          )}
          {trees.length === 0 && (
            <div className={styles.empty}>
              {discovery === 'loading' || discovery === 'idle' ? (
                <p aria-busy="true">Looking for your Trees…</p>
              ) : (
                <>
                  <h2>No Trees yet</h2>
                  <p>
                    A Tree is a GitHub repository with a <code>.yeraz.json</code> file at its root.
                    Add one to a repository this token can read, then connect it here.
                  </p>
                </>
              )}
            </div>
          )}
          {entries.length > 0 && (
            <div className={styles.corner}>
              {current ? (
                <div
                  className={`${controls.panel} ${styles.card}`}
                  style={{ '--tree': colorVar(current.tree.color) } as CSSProperties}
                >
                  <div className={styles.cardHead}>
                    <span className={styles.ring} aria-hidden="true" />
                    <h2 className={styles.cardName}>{current.tree.title}</h2>
                    <button
                      type="button"
                      className={controls.iconButton}
                      aria-label="Close"
                      onClick={() => setSelected(null)}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                  <span className={`${controls.mono} ${styles.repo}`}>
                    github.com/{current.tree.repo}
                  </span>
                  <dl className={styles.stats}>
                    {(
                      [
                        ['leaves', current.graph.stats.leaves],
                        ['branches', current.graph.stats.branches],
                        ['threads', current.graph.stats.threads],
                        ['words', compactWords(current.graph.stats.words)],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label}>
                        <dd>{value}</dd>
                        <dt>{label}</dt>
                      </div>
                    ))}
                  </dl>
                  <Link href={treeHref(current.tree.repo)} className={styles.openTree}>
                    Open tree
                    <Icon name="arrowRight" />
                  </Link>
                </div>
              ) : (
                <span className={`${controls.panel} ${styles.hint}`}>
                  Select a tree to inspect it
                </span>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function leafCount(d: TreeData | undefined): string {
  if (!d?.graph) return d?.status === 'error' ? '!' : '…'
  return String(d.graph.stats.leaves)
}

function Connect({ onConnected }: { onConnected(repo: string): void }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const tree = await session.getState().connect(value)
      void session.getState().open(tree.repo)
      onConnected(tree.repo)
      setOpen(false)
      setValue('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className={styles.railFoot}>
        <button type="button" className={controls.ghost} onClick={() => setOpen(true)}>
          <Icon name="repo" />
          Connect repository
        </button>
      </div>
    )
  }
  return (
    <form className={styles.railFoot} onSubmit={submit}>
      <label className={styles.field}>
        <span className={controls.eyebrow}>Repository</span>
        <input
          className={`${controls.input} ${controls.mono}`}
          placeholder="owner/name"
          autoFocus
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
      </label>
      {error && (
        <p className={controls.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.formButtons}>
        <button type="button" className={controls.ghost} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className={controls.primary} disabled={busy || !value.trim()}>
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    </form>
  )
}
