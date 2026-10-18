// The workspace: one Family (a repository) with every one of its Trees on the map at once,
// the Explorer on the left and the Peek on the right. The app opens straight into it.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { familyLayout, treesOf } from '../map/family'
import { TreeMap } from '../map/TreeMap'
import { compactWords, type Graph } from '../model/graph'
import { ROOT } from '../model/tree'
import { markNow } from '../perf'
import { preloadEditor } from '../editor/LeafEditor'
import { Peek } from '../read/Peek'
import { session, useSession } from '../store/session'
import controls from './controls.module.css'
import { Explorer } from './Explorer'
import { FamilyMenu, rememberFamily } from './FamilyMenu'
import { Icon } from './icons'
import { InlineName } from './InlineName'
import { ConflictBanner } from './ConflictBanner'
import { decodePath, treeHref } from './paths'
import { parentFor, StructureDialog, type StructureAction } from './StructureDialogs'
import { SyncStatus } from './SyncStatus'
import { colorVar } from './theme'
import { Divider, TopBar } from './TopBar'
import styles from './FamilyView.module.css'
import { PHONE, useMedia } from './useMedia'
import { Search, type Matches } from './Search'

export function FamilyView({ params }: { params: { owner: string; name: string; '*'?: string } }) {
  const repo = `${params.owner}/${params.name}`
  const key = repo.toLowerCase()
  const [, navigate] = useLocation()
  const data = useSession((s) => s.data[key])
  const tree = useSession((s) => s.trees.find((t) => t.repo.toLowerCase() === key))
  const phone = useMedia(PHONE)

  const [explorerOpen, setExplorerOpen] = useState(() => !window.matchMedia(PHONE).matches)
  const [peekOpen, setPeekOpen] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [action, setAction] = useState<StructureAction | null>(null)
  /** A leaf just created here: it opens ready to write. */
  const [created, setCreated] = useState<string | null>(null)
  /** What the last search found: the map's Matches layer. */
  const [found, setFound] = useState<Matches | null>(null)
  const lit = found?.ids[key]
  const matches = useMemo(
    () => (found && lit ? { query: found.query, ids: lit } : null),
    [found, lit],
  )

  useEffect(() => {
    markNow('tree-open')
    rememberFamily(repo)
    void session.getState().open(repo)
    preloadEditor()
  }, [repo])

  const graph = data?.graph ?? null
  const family = useMemo(() => (graph ? familyLayout(graph) : null), [graph])
  // No path: nothing selected. An empty path (`/tree/o/n/`): the Family itself.
  const wanted = params['*'] === undefined ? null : decodePath(params['*'])
  const selected = graph && wanted !== null && graph.nodes.has(wanted) ? wanted : null

  // Arriving at a node's URL from outside (a link, the back button) shows its Peek.
  const [arrived, setArrived] = useState(wanted)
  if (arrived !== wanted) {
    setArrived(wanted)
    if (wanted !== null) setPeekOpen(true)
  }
  const peekVisible = peekOpen && selected !== null

  const select = useCallback(
    (id: string | null) => {
      navigate(treeHref(repo, id), { replace: true })
      setCreated(null)
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
        <div className={styles.crumbs}>
          <h1 className={styles.title}>
            {tree && graph ? (
              <InlineName
                value={tree.title}
                label="Family name"
                onRename={(name) => session.getState().renameTree(repo, name)}
              />
            ) : (
              (tree?.title ?? params.name)
            )}
          </h1>
          <FamilyMenu current={repo} />
        </div>
        <Search repo={repo} onMatches={setFound} />
        <span className={styles.status}>
          <Status data={data} repo={repo} branch={tree?.branch ?? 'main'} />
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
          {graph && (
            <button
              type="button"
              className={`${controls.primary} ${styles.newLeaf}`}
              aria-label="New leaf"
              onClick={() => setAction({ kind: 'new-leaf', parent: parentFor(graph, selected) })}
            >
              <Icon name="plus" />
              <span className={styles.newLeafText}>New leaf</span>
            </button>
          )}
        </div>
      </TopBar>
      <ConflictBanner repo={repo} />
      {action && graph && tree && (
        <StructureDialog
          tree={tree}
          graph={graph}
          action={action}
          onClose={() => setAction(null)}
          onDone={(result) => {
            setAction(null)
            select(result.edit ?? result.select ?? null)
            setCreated(result.edit ?? null)
          }}
        />
      )}

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
            onAction={setAction}
          />
        )}
        <main className={styles.main}>
          {graph && family ? (
            <TreeMap
              treeKey={key}
              graph={graph}
              family={family}
              title={tree?.title ?? repo}
              color={color}
              selected={selected}
              matches={matches}
              onClearMatches={() => setFound(null)}
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
              created={created === selected}
              href={href}
              onSelect={select}
              onExpand={setExpanded}
              onClose={() => {
                setPeekOpen(false)
                setExpanded(false)
              }}
              onAction={setAction}
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
  repo,
  branch,
}: {
  data: ReturnType<typeof session.getState>['data'][string] | undefined
  repo: string
  branch: string
}) {
  const sync = useSession((s) => s.sync[repo.toLowerCase()])
  if (!data) return null
  if (data.status === 'loading') {
    return (
      <span role="status">
        {data.total > 0 ? `Loading ${data.fetched}/${data.total} leaves` : 'Loading…'}
      </span>
    )
  }
  if (data.status === 'error') return data.graph ? <span role="status">{data.error}</span> : null
  if (data.offline && (!sync || sync.status === 'synced'))
    return <span role="status">Offline · showing the saved copy</span>
  return <SyncStatus repo={repo} branch={branch} />
}

function Placeholder({
  data,
}: {
  data: ReturnType<typeof session.getState>['data'][string] | undefined
}) {
  if (data?.status !== 'error') {
    return (
      <p className={styles.placeholder} aria-busy="true">
        Opening the Family…
      </p>
    )
  }
  return (
    <div className={styles.placeholder}>
      <p className={controls.error} role="alert">
        {data.error}
      </p>
      <div className={styles.actions}>
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

/** Map only: word totals per Tree (design screen 06). */
function WhereYouWrite({ graph }: { graph: Graph }) {
  const tops = treesOf(graph)
    .map((id) => graph.nodes.get(id)!)
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
