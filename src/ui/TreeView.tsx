import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { layoutFor } from '../map/layout'
import { TreeMap } from '../map/TreeMap'
import { compactWords, type Graph } from '../model/graph'
import { ROOT } from '../model/tree'
import { markNow } from '../perf'
import { Peek } from '../read/Peek'
import { session, useSession } from '../store/session'
import controls from './controls.module.css'
import { Explorer } from './Explorer'
import { Icon } from './icons'
import { decodePath, treeHref } from './paths'
import { colorVar } from './theme'
import { Divider, TopBar } from './TopBar'
import styles from './TreeView.module.css'
import { PHONE, useMedia } from './useMedia'

export function TreeView({ params }: { params: { owner: string; name: string; '*'?: string } }) {
  const repo = `${params.owner}/${params.name}`
  const key = repo.toLowerCase()
  const [, navigate] = useLocation()
  const data = useSession((s) => s.data[key])
  const tree = useSession((s) => s.trees.find((t) => t.repo.toLowerCase() === key))
  const phone = useMedia(PHONE)

  const [explorerOpen, setExplorerOpen] = useState(() => !window.matchMedia(PHONE).matches)
  const [peekOpen, setPeekOpen] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    markNow('tree-open')
    void session.getState().open(repo)
  }, [repo])

  const graph = data?.graph ?? null
  const layout = useMemo(() => (graph ? layoutFor(graph) : null), [graph])
  // No path: nothing selected. An empty path (`/tree/o/n/`): the Tree itself.
  const wanted = params['*'] === undefined ? null : decodePath(params['*'])
  const selected = graph && wanted !== null && graph.nodes.has(wanted) ? wanted : null
  const peekVisible = peekOpen && selected !== null

  const select = useCallback(
    (id: string | null) => {
      navigate(treeHref(repo, id), { replace: true })
      setPeekOpen(id !== null)
      if (id === null) setExpanded(false)
    },
    [navigate, repo],
  )
  const href = useCallback((id: string) => `#${treeHref(repo, id)}`, [repo])
  const color = colorVar(tree?.color)

  const insets = phone
    ? { bottom: peekVisible ? Math.round(window.innerHeight * 0.6) : 0 }
    : { right: peekVisible && !expanded ? 452 : 0 }

  return (
    <div className={styles.page} style={{ '--tree': color } as React.CSSProperties}>
      <TopBar>
        <Divider />
        <nav aria-label="Breadcrumb" className={styles.crumbs}>
          <Link href="/" className={styles.home} aria-label="All trees">
            <span className={styles.back}>
              <Icon name="chevronLeft" size={18} />
            </span>
            <span className={styles.homeText}>All trees</span>
          </Link>
          <span className={styles.sep}>
            <Icon name="chevronRight" size={14} />
          </span>
          <h1 className={styles.title}>{tree?.title ?? params.name}</h1>
        </nav>
        <span className={styles.status} role="status">
          <Status data={data} />
        </span>
        <div className={styles.toggles}>
          <button
            type="button"
            className={controls.iconButton}
            aria-label="Show explorer"
            aria-pressed={explorerOpen}
            onClick={() => setExplorerOpen((open) => !open)}
          >
            <Icon name="panelLeft" size={18} />
          </button>
          <button
            type="button"
            className={controls.iconButton}
            aria-label="Show leaf panel"
            aria-pressed={peekVisible}
            onClick={() => {
              if (peekVisible) {
                setPeekOpen(false)
                setExpanded(false)
              } else select(selected ?? ROOT)
            }}
          >
            <Icon name="panelRight" size={18} />
          </button>
        </div>
      </TopBar>

      <div className={styles.body}>
        {explorerOpen && graph && tree && (
          <Explorer
            tree={tree}
            graph={graph}
            selected={selected}
            onSelect={(id) => {
              select(id)
              if (phone) setExplorerOpen(false)
            }}
            onClose={() => setExplorerOpen(false)}
          />
        )}
        <main className={styles.main}>
          {graph && layout ? (
            <TreeMap
              treeKey={key}
              graph={graph}
              layout={layout}
              title={tree?.title ?? repo}
              color={color}
              selected={selected}
              onSelect={select}
              onOpen={(id) => {
                select(id)
                setExpanded(true)
              }}
              insets={insets}
            />
          ) : (
            <Placeholder data={data} />
          )}
          {graph && tree && peekVisible && (
            <Peek
              tree={tree}
              graph={graph}
              id={selected!}
              expanded={expanded}
              href={href}
              onSelect={select}
              onExpand={setExpanded}
              onClose={() => {
                setPeekOpen(false)
                setExpanded(false)
              }}
            />
          )}
          {graph && !explorerOpen && !peekVisible && !phone && <WhereYouWrite graph={graph} />}
        </main>
      </div>
    </div>
  )
}

function Status({
  data,
}: {
  data: ReturnType<typeof session.getState>['data'][string] | undefined
}) {
  if (!data) return null
  if (data.status === 'loading')
    return data.total > 0 ? (
      <>
        Loading {data.fetched}/{data.total} leaves
      </>
    ) : (
      <>Loading…</>
    )
  if (data.status === 'error' && data.graph) return <>{data.error}</>
  if (data.status === 'ready' && data.offline) return <>Offline · showing the saved copy</>
  return null
}

function Placeholder({
  data,
}: {
  data: ReturnType<typeof session.getState>['data'][string] | undefined
}) {
  if (data?.status !== 'error') {
    return (
      <p className={styles.placeholder} aria-busy="true">
        Opening the Tree…
      </p>
    )
  }
  return (
    <div className={styles.placeholder}>
      <p className={controls.error} role="alert">
        {data.error}
      </p>
      <div className={styles.actions}>
        <Link href="/" className={controls.ghost}>
          All trees
        </Link>
        {data.kind === 'auth' ? (
          <button
            type="button"
            className={controls.ghost}
            onClick={() => void session.getState().signOut()}
          >
            Use another token
          </button>
        ) : (
          <button type="button" className={controls.primary} onClick={() => location.reload()}>
            Try again
          </button>
        )}
      </div>
    </div>
  )
}

/** Map only: word totals per top-level branch (design screen 06). */
function WhereYouWrite({ graph }: { graph: Graph }) {
  const tops = graph.nodes
    .get(ROOT)!
    .children.map((id) => graph.nodes.get(id)!)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)
  const max = Math.max(1, ...tops.map((n) => n.total))
  return (
    <aside className={`${controls.panel} ${styles.most}`} aria-label="Where you write most">
      <h2 className={controls.eyebrow}>Where you write most</h2>
      {tops.map((n) => (
        <div key={n.id} className={styles.bar}>
          <div className={styles.barLabel}>
            <span>{n.title}</span>
            <span className={controls.mono}>{compactWords(n.total)}</span>
          </div>
          <div className={styles.track}>
            <div className={styles.fill} style={{ width: `${(n.total / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </aside>
  )
}
