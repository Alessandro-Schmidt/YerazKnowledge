// Columns (design/views/screens/03, 12): walk the Family a level at a time, like Finder. The
// first column lists its Trees; each picked node opens a column of its children; the
// selected leaf is open beside them, in the Peek docked as the last column. On a phone
// the parent columns fold into spines down the left edge; tapping one goes back a level.

import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { treesOf } from '../map/family'
import { compactWords, type Graph, type GraphNode } from '../model/graph'
import { ROOT } from '../model/tree'
import controls from '../ui/controls.module.css'
import { Glyph } from '../ui/Glyph'
import { Icon } from '../ui/icons'
import { enterOpens, plural, topOf, treeColor, useFirstLines, type ViewProps } from './common'
import styles from './Columns.module.css'

interface Column {
  /** The node whose children the column lists. */
  of: GraphNode
  items: GraphNode[]
  /** The child picked in it: the next column's node, or the selection. */
  picked: string | null
}

/** The columns down to the selection: the Family's Trees, then each picked node's children. */
export function columnsFor(graph: Graph, selected: string | null): Column[] {
  const path: string[] = []
  for (
    let id = selected !== null && graph.nodes.has(selected) ? selected : null;
    id !== null && id !== ROOT;
    id = graph.nodes.get(id)?.parent ?? null
  )
    path.unshift(id)
  const columns: Column[] = []
  let of = graph.nodes.get(ROOT)!
  for (let i = 0; ; i++) {
    const items = (of.id === ROOT ? treesOf(graph) : of.children)
      .map((c) => graph.nodes.get(c))
      .filter((n): n is GraphNode => n !== undefined)
    if (!items.length) break
    columns.push({ of, items, picked: path[i] ?? null })
    const next = path[i]
    if (next === undefined) break
    of = graph.nodes.get(next)!
  }
  return columns
}

/** The least height (px) a phone's column keeps above the sheet: its head and three rows. */
const PHONE_ROOM = 200

export default function Columns({
  tree,
  graph,
  selected,
  phone,
  insets,
  onSelect,
  onOpen,
  onAction,
}: ViewProps) {
  const lines = useFirstLines(tree.repo, graph)
  const columns = columnsFor(graph, selected)
  const strip = useRef<HTMLDivElement>(null)

  // The newest column scrolls into view.
  useLayoutEffect(() => {
    const el = strip.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [columns.length, selected])

  const subtitle = (c: Column) => {
    const branches = c.items.filter((n) => n.kind === 'branch').length
    if (c.of.kind === 'root') return plural(c.items.length, 'tree')
    if (c.of.kind === 'leaf') return plural(c.items.length, 'sub-leaf', 'sub-leaves')
    return branches === c.items.length
      ? plural(branches, 'branch', 'branches')
      : plural(c.items.length - branches, 'leaf', 'leaves')
  }

  // On a phone every column but the last is a spine.
  const spines = phone ? columns.slice(0, -1) : []
  const shown = phone ? columns.slice(-1) : columns

  return (
    <div
      className={styles.wrap}
      data-phone={phone || undefined}
      style={{
        right: insets.right ?? 0,
        // A short phone leaves little above the sheet: the column keeps room for its head and
        // a few rows, the rest of it going under the sheet.
        bottom: phone
          ? `min(${insets.bottom ?? 0}px, calc(100% - ${PHONE_ROOM}px))`
          : (insets.bottom ?? 0),
      }}
    >
      {spines.map((c, i) => (
        <button
          key={c.of.id}
          type="button"
          className={styles.spine}
          style={{ left: i * 40 }}
          aria-label={`Back to ${c.of.title}`}
          onClick={() => onSelect(c.of.id === ROOT ? null : c.of.id)}
        >
          <Icon name="chevronLeft" size={14} />
          <span className={styles.spineText}>
            <span className={controls.eyebrow}>{c.of.title}</span>
            <span>{c.picked ? graph.nodes.get(c.picked)?.title : ''}</span>
          </span>
        </button>
      ))}
      <div ref={strip} className={styles.strip} style={{ paddingLeft: spines.length * 40 }}>
        {shown.map((c, i) => {
          const rich = c.of.kind !== 'root'
          const top = c.of.kind === 'root' ? null : topOf(graph, c.of.id)
          return (
            <section
              key={c.of.id}
              className={styles.column}
              data-first={c.of.kind === 'root' || undefined}
              aria-label={c.of.title}
              style={{ '--tree': treeColor(tree, top) } as CSSProperties}
            >
              <div className={styles.head}>
                <h2 className={controls.eyebrow}>{c.of.title}</h2>
                <span className={`${controls.mono} ${styles.sub}`}>{subtitle(c)}</span>
              </div>
              <ul className={styles.items} aria-label={`Inside ${c.of.title}`}>
                {c.items.map((n) => {
                  const on = c.picked === n.id
                  const first = rich && n.kind === 'leaf' ? lines.get(n.id) : undefined
                  const style =
                    c.of.kind === 'root'
                      ? ({ '--tree': treeColor(tree, n.id) } as CSSProperties)
                      : undefined
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        className={styles.item}
                        aria-current={on || undefined}
                        data-rich={first ? '' : undefined}
                        style={style}
                        onClick={() => onSelect(n.id)}
                        onDoubleClick={() => onOpen(n.id)}
                        onKeyDown={enterOpens(on, () => onOpen(n.id))}
                      >
                        <Glyph node={n.parent === ROOT ? { kind: 'branch', children: [] } : n} />
                        <span className={styles.itemText}>
                          <span className={styles.itemName}>
                            {n.icon && <span aria-hidden="true">{n.icon}</span>}
                            <span>{n.title}</span>
                          </span>
                          {first && <span className={`reading ${styles.first}`}>{first}</span>}
                        </span>
                        <span className={`${controls.mono} ${styles.count}`}>
                          {n.kind === 'leaf' && n.words ? compactWords(n.words) : n.children.length}
                        </span>
                        {n.children.length > 0 && <Icon name="chevronRight" size={14} />}
                      </button>
                    </li>
                  )
                })}
              </ul>
              {c.of.kind !== 'root' && (
                <button
                  type="button"
                  className={styles.add}
                  onClick={() => onAction({ kind: 'new-leaf', parent: c.of.id })}
                >
                  <Icon name="plus" size={14} />
                  {c.of.kind === 'leaf' ? 'New sub-leaf' : `New leaf in ${c.of.title}`}
                </button>
              )}
              {i === shown.length - 1 && c.of.kind === 'root' && (
                <button
                  type="button"
                  className={styles.add}
                  onClick={() => onAction({ kind: 'new-branch', parent: ROOT })}
                >
                  <Icon name="plus" size={14} />
                  New tree
                </button>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
