// Every Family on one map (issue #69), what `#/` opens on unless this device chose the last
// Family (Settings › Views). The map draws the merged graph (map/families.ts); a selected
// node opens in its own Family's Peek, so reading, editing and saving work as they do there.
// Every view of a Family shows every Family too: they get the merged graph and `allRef`, and
// their actions go to the Family the node is in.
// ponytail: the Explorer and Tree colours stay per Family; search picks open the result in its
// Family.

import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useLocation } from 'wouter'
import type { TreeRef } from '../github/graphql'
import {
  ALL,
  allId,
  allRef,
  familiesLayout,
  mergeFamilies,
  splitId,
  type FamilyGraph,
} from '../map/families'
import { treesOf, type FamilyLayout } from '../map/family'
import { TreeMap } from '../map/TreeMap'
import { byPlanted, type Graph } from '../model/graph'
import { ROOT } from '../model/tree'
import { preloadEditor } from '../editor/LeafEditor'
import { imageAt } from '../read/LeafLook'
import { Peek } from '../read/Peek'
import { session, useSession } from '../store/session'
import { treeColor, usePlanted } from '../views/common'
import { VIEW_COMPONENTS } from '../views'
import { PANEL } from '../views/views'
import { useView, ViewSwitcher } from '../views/ViewSwitcher'
import controls from './controls.module.css'
import { ConflictBanner } from './ConflictBanner'
import { FamilyMenu } from './FamilyMenu'
import styles from './FamilyView.module.css'
import { Icon } from './icons'
import { Presence } from './motion'
import { allHref, decodePath } from './paths'
import { SaveAndRefresh } from './SaveAndRefresh'
import { Search, type Matches } from './Search'
import { parentFor, StructureDialog, type StructureAction } from './StructureDialogs'
import { useDeleteKey } from './deleteKey'
import { colorVar } from './theme'
import { ProjectTabs } from './ProjectTabs'
import { Divider, TopBar } from './TopBar'
import { SHEET_HEIGHT, widthStore, widthVars } from './panels'
import { PHONE, useMedia } from './useMedia'

const TITLE = 'All projects'

/**
 * The merged graph and its layout, made again only when a Family's graph or ref changes:
 * the session's data also changes while content loads and edits are saved.
 */
let last: {
  families: FamilyGraph[]
  merged: Graph
  layout: FamilyLayout
  ref: TreeRef
} | null = null
function mapOf(families: FamilyGraph[]) {
  const same =
    last?.families.length === families.length &&
    families.every(
      (f, i) => f.graph === last!.families[i]!.graph && f.ref === last!.families[i]!.ref,
    )
  if (!same) {
    const merged = mergeFamilies(families, TITLE)
    last = { families, merged, layout: familiesLayout(merged), ref: allRef(families, TITLE) }
  }
  return last!
}

export function AllView({ params }: { params: { owner?: string; name?: string; '*'?: string } }) {
  const [, navigate] = useLocation()
  const trees = useSession((s) => s.trees)
  const data = useSession((s) => s.data)
  const phone = useMedia(PHONE)
  const view = useView()
  // Phones use the Peek sheet, except Rings, whose own sheet holds the core sample.
  const panel = phone ? (view === 'rings' ? 'own' : 'float') : PANEL[view]
  const [peekOpen, setPeekOpen] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [action, setAction] = useState<{ tree: TreeRef; action: StructureAction } | null>(null)
  const [created, setCreated] = useState<string | null>(null)
  const [found, setFound] = useState<Matches | null>(null)
  /** Nodes kept open beside the selection, by merged id: any Family's (as in FamilyView). */
  const [pinned, setPinned] = useState<string[]>([])
  const unpin = (id: string) => setPinned((p) => p.filter((x) => x !== id))

  useEffect(() => {
    for (const t of session.getState().trees) void session.getState().open(t.repo)
    preloadEditor()
  }, [])

  // Each Family's graph object, unchanged until that Family's data changes.
  const families = useMemo(
    () =>
      trees.flatMap((ref): FamilyGraph[] => {
        const graph = data[ref.repo.toLowerCase()]?.graph
        return graph ? [{ ref, graph }] : []
      }),
    [trees, data],
  )
  const { merged, layout: named, ref: all } = useMemo(() => mapOf(families), [families])
  // The map in the order leaves were planted (Settings › Views); as named until known.
  const planted = usePlanted(ALL, families.length ? merged : null, view === 'map')
  const layout = useMemo(
    () => (planted ? familiesLayout(byPlanted(merged, planted)) : named),
    [planted, merged, named],
  )

  // The selection, in its Family: `#/all/owner/name/path`.
  const repo = params.owner && params.name ? `${params.owner}/${params.name}`.toLowerCase() : null
  const family = families.find((f) => f.ref.repo.toLowerCase() === repo)
  const wanted = repo === null ? null : decodePath(params['*'] ?? '')
  const path =
    family && wanted !== null && (family.graph.nodes.has(wanted) || family.graph.ghosts.has(wanted))
      ? wanted
      : null
  const selected = family && path !== null ? allId(family.ref.repo, path) : null

  const [arrived, setArrived] = useState(selected)
  if (arrived !== selected) {
    setArrived(selected)
    if (selected !== null) setPeekOpen(true)
  }
  // Choosing another view shows it (issue #65): a leaf open as a page, or the phone's sheet
  // over the view, gives way. The selection stays.
  const [shownView, setShownView] = useState(view)
  if (shownView !== view) {
    setShownView(view)
    setExpanded(false)
    if (phone) setPeekOpen(false)
  }
  const peekVisible = peekOpen && family !== undefined && path !== null
  // A view with its own panel shows the Peek only as a full page.
  const peekShown = peekVisible && (panel !== 'own' || expanded)
  // The pinned columns: beside a floating Peek on a computer, never twice the selection.
  const stack =
    phone || panel !== 'float' || expanded
      ? []
      : pinned.flatMap((id) => {
          const at = id === selected ? null : splitId(id)
          const f = at && families.find((f) => f.ref.repo.toLowerCase() === at.repo)
          return f && f.graph.nodes.has(at.id) ? [{ id, family: f, path: at.id }] : []
        })
  const stackShown = stack.length > 0 && !expanded

  /** Selects a node of the Family `ref` by its own id; null clears the selection. */
  const select = useCallback(
    (ref: TreeRef | null, id: string | null) => {
      navigate(ref && id !== null ? allHref(ref.repo, id) : allHref(), { replace: true })
      setCreated(null)
      setPeekOpen(id !== null)
      if (id === null) setExpanded(false)
    },
    [navigate],
  )
  // The Delete key on the selection (a ghost or a Family's root have nothing to delete).
  useDeleteKey(
    family && action === null && path !== null && path !== ROOT && family.graph.nodes.has(path)
      ? path
      : null,
    (id) => family && setAction({ tree: family.ref, action: { kind: 'delete', id } }),
  )
  /** A node's image icon, from its own Family. */
  const imageUrl = useCallback(
    (id: string, src: string) => imageAt(splitId(id)?.repo ?? '', src),
    [],
  )
  const fromMap = (id: string | null) => {
    const at = id === null ? null : splitId(id)
    const ref = at && families.find((f) => f.ref.repo.toLowerCase() === at.repo)?.ref
    select(ref ?? null, at && ref ? at.id : null)
  }

  const treeColors = useMemo(
    () =>
      Object.fromEntries(
        families.flatMap(({ ref, graph }) =>
          treesOf(graph).map((id) => [allId(ref.repo, id), treeColor(ref, id)]),
        ),
      ) as Record<string, string>,
    [families],
  )
  const titles = useMemo(
    () => Object.fromEntries(families.map((f) => [f.ref.repo.toLowerCase(), f.ref.title])),
    [families],
  )
  const lit = useMemo(() => {
    if (!found) return null
    const ids = Object.entries(found.ids).flatMap(([r, ids]) => ids.map((id) => allId(r, id)))
    return ids.length ? { query: found.query, ids } : null
  }, [found])

  // The panels' widths, dragged by their edges and saved on this device (issue #80).
  const widths = useSyncExternalStore(widthStore.subscribe, widthStore.get)
  const insets = phone
    ? { bottom: peekShown ? SHEET_HEIGHT() : 0 }
    : { right: peekShown && !expanded ? (panel === 'dock' ? widths.dock : widths.peek + 32) : 0 }
  // New leaf goes to the selection's Family, or the first one.
  const target = family ?? families[0]
  const View = view === 'map' ? null : VIEW_COMPONENTS[view]

  /** A view's action, on merged ids, as its Family's: the root's goes to `target`. */
  const fromView = (a: StructureAction) => {
    const of = splitId('parent' in a ? a.parent : a.id)
    const owner = of ? families.find((f) => f.ref.repo.toLowerCase() === of.repo) : target
    if (!owner) return
    const id = of ? of.id : ROOT
    setAction({ tree: owner.ref, action: 'parent' in a ? { ...a, parent: id } : { ...a, id } })
  }

  return (
    <div className={styles.page} data-panels="" style={widthVars(widths) as React.CSSProperties}>
      <TopBar>
        <Divider />
        <div className={styles.crumbs}>
          <h1 className={styles.title}>{TITLE}</h1>
          <FamilyMenu all />
        </div>
        {!phone && <ViewSwitcher />}
        <Search repo={target?.ref.repo ?? ''} onMatches={setFound} />
        <div className={styles.toggles}>
          <SaveAndRefresh repos={trees.map((t) => t.repo)} />
          {target && (
            <button
              type="button"
              className={`${controls.primary} ${styles.newLeaf}`}
              aria-label="New leaf"
              onClick={() =>
                setAction({
                  tree: target.ref,
                  action: { kind: 'new-leaf', parent: parentFor(target.graph, path) },
                })
              }
            >
              <Icon name="plus" />
              <span className={styles.newLeafText}>New leaf</span>
            </button>
          )}
        </div>
      </TopBar>
      <ProjectTabs all />
      {phone && <ViewSwitcher phone />}
      {trees.map((t) => (
        <ConflictBanner key={t.repo} repo={t.repo} />
      ))}
      {action && (
        <StructureDialog
          tree={action.tree}
          graph={data[action.tree.repo.toLowerCase()]!.graph!}
          action={action.action}
          onClose={() => setAction(null)}
          onDone={(result) => {
            setAction(null)
            // Moved to another Family: selected there.
            const ref = trees.find((t) => t.repo === result.repo) ?? action.tree
            select(ref, result.edit ?? result.select ?? null)
            setCreated(result.edit ?? null)
          }}
        />
      )}
      <div className={styles.body}>
        <main id="main" tabIndex={-1} className={styles.main}>
          {families.length && View ? (
            <Suspense fallback={<p className={styles.placeholder} aria-busy="true" />}>
              <View
                key={view}
                tree={all}
                graph={merged}
                selected={selected}
                matches={lit}
                phone={phone}
                insets={insets}
                onSelect={fromMap}
                onOpen={(id) => {
                  fromMap(id)
                  setExpanded(true)
                }}
                onAction={fromView}
              />
            </Suspense>
          ) : families.length ? (
            <TreeMap
              treeKey="all"
              graph={merged}
              family={layout}
              imageUrl={imageUrl}
              title={TITLE}
              color={colorVar(null)}
              treeColors={treeColors}
              groupTitles={titles}
              selected={selected}
              matches={lit}
              onClearMatches={() => setFound(null)}
              onSelect={fromMap}
              onOpen={(id) => {
                fromMap(id)
                setExpanded(true)
              }}
              insets={insets}
            />
          ) : (
            <p className={styles.placeholder} aria-busy="true">
              Opening your Families…
            </p>
          )}
          <Presence show={peekShown || stackShown}>
            {(peekShown || stackShown) && (
              <div className={stackShown ? styles.stack : undefined}>
                {stack.map(({ id, family: f, path: p }) => (
                  <Peek
                    key={id}
                    tree={f.ref}
                    graph={f.graph}
                    id={p}
                    expanded={false}
                    pinned
                    kept
                    href={(id) => `#${allHref(f.ref.repo, id)}`}
                    onSelect={(id) => select(f.ref, id)}
                    onExpand={() => {
                      select(f.ref, p)
                      setExpanded(true)
                    }}
                    onPin={() => unpin(id)}
                    onClose={() => unpin(id)}
                    onAction={(a) => setAction({ tree: f.ref, action: a })}
                    onWritten={(id) => {
                      select(f.ref, id)
                      setCreated(id)
                    }}
                  />
                ))}
                {peekShown && (
                  <Peek
                    tree={family.ref}
                    graph={family.graph}
                    id={path ?? ROOT}
                    expanded={expanded}
                    docked={panel === 'dock'}
                    created={created === path}
                    pinned={stackShown}
                    kept={pinned.includes(selected!)}
                    onPin={
                      phone || panel !== 'float'
                        ? undefined
                        : () =>
                            setPinned((p) =>
                              p.includes(selected!)
                                ? p.filter((x) => x !== selected)
                                : [...p, selected!],
                            )
                    }
                    href={(id) => `#${allHref(family.ref.repo, id)}`}
                    onSelect={(id) => select(family.ref, id)}
                    onExpand={setExpanded}
                    onClose={() => {
                      setPeekOpen(false)
                      setExpanded(false)
                    }}
                    onAction={(a) => setAction({ tree: family.ref, action: a })}
                    onWritten={(id) => {
                      select(family.ref, id)
                      setCreated(id)
                    }}
                  />
                )}
              </div>
            )}
          </Presence>
        </main>
      </div>
    </div>
  )
}
