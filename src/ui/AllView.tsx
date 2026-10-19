// Every Family on one map (issue #69), what `#/` opens on unless this device chose the last
// Family (Settings › Views). The map draws the merged graph (map/families.ts); a selected
// node opens in its own Family's Peek, so reading, editing and saving work as they do there.
// ponytail: only the radial map shows every Family; the other views, the Explorer and the
// Tree colours stay per Family. Search picks open the result in its Family.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import type { TreeRef } from '../github/graphql'
import { allId, familiesLayout, mergeFamilies, splitId, type FamilyGraph } from '../map/families'
import { treesOf, type FamilyLayout } from '../map/family'
import { TreeMap } from '../map/TreeMap'
import type { Graph } from '../model/graph'
import { ROOT } from '../model/tree'
import { preloadEditor } from '../editor/LeafEditor'
import { Peek } from '../read/Peek'
import { session, useSession } from '../store/session'
import { treeColor } from '../views/common'
import controls from './controls.module.css'
import { ConflictBanner } from './ConflictBanner'
import { FamilyMenu } from './FamilyMenu'
import styles from './FamilyView.module.css'
import { Icon } from './icons'
import { allHref, decodePath } from './paths'
import { SaveAndRefresh } from './SaveAndRefresh'
import { Search, type Matches } from './Search'
import { parentFor, StructureDialog, type StructureAction } from './StructureDialogs'
import { colorVar } from './theme'
import { Divider, TopBar } from './TopBar'
import { PHONE, useMedia } from './useMedia'

const TITLE = 'All Families'

/**
 * The merged graph and its layout, made again only when a Family's graph or ref changes:
 * the session's data also changes while content loads and edits are saved.
 */
let last: { families: FamilyGraph[]; merged: Graph; layout: FamilyLayout } | null = null
function mapOf(families: FamilyGraph[]) {
  const same =
    last?.families.length === families.length &&
    families.every(
      (f, i) => f.graph === last!.families[i]!.graph && f.ref === last!.families[i]!.ref,
    )
  if (!same) {
    const merged = mergeFamilies(families, TITLE)
    last = { families, merged, layout: familiesLayout(merged) }
  }
  return last!
}

export function AllView({ params }: { params: { owner?: string; name?: string; '*'?: string } }) {
  const [, navigate] = useLocation()
  const trees = useSession((s) => s.trees)
  const data = useSession((s) => s.data)
  const phone = useMedia(PHONE)
  const [peekOpen, setPeekOpen] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [action, setAction] = useState<{ tree: TreeRef; action: StructureAction } | null>(null)
  const [created, setCreated] = useState<string | null>(null)
  const [found, setFound] = useState<Matches | null>(null)

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
  const { merged, layout } = useMemo(() => mapOf(families), [families])

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
  const peekShown = peekOpen && family !== undefined && path !== null

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

  const insets = phone
    ? { bottom: peekShown ? Math.round(window.innerHeight * 0.6) : 0 }
    : { right: peekShown && !expanded ? 452 : 0 }
  // New leaf goes to the selection's Family, or the first one.
  const target = family ?? families[0]

  return (
    <div className={styles.page}>
      <TopBar>
        <Divider />
        <div className={styles.crumbs}>
          <h1 className={styles.title}>{TITLE}</h1>
          <FamilyMenu all />
        </div>
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
            select(action.tree, result.edit ?? result.select ?? null)
            setCreated(result.edit ?? null)
          }}
        />
      )}
      <div className={styles.body}>
        <main className={styles.main}>
          {families.length ? (
            <TreeMap
              treeKey="all"
              graph={merged}
              family={layout}
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
          {peekShown && (
            <Peek
              tree={family.ref}
              graph={family.graph}
              id={path ?? ROOT}
              expanded={expanded}
              docked={false}
              created={created === path}
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
        </main>
      </div>
    </div>
  )
}
